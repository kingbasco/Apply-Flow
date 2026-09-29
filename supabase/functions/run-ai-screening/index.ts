import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizeLabel(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function answerText(value: unknown, questionId: string, optionLabels: Map<string,string>): string {
  const formatItem = (item: any): string => {
    if (item === null || item === undefined || item === "") return "Not provided";
    if (typeof item === "object") {
      const raw = item.value ?? item.id ?? item.label;
      if (raw !== undefined) {
        const mapped = optionLabels.get(questionId + ":" + String(raw));
        if (mapped) return mapped;
      }
      if (item.label !== undefined) return String(item.label);
      try { return JSON.stringify(item); } catch { return String(item); }
    }
    return optionLabels.get(questionId + ":" + String(item)) || String(item);
  };
  if (Array.isArray(value)) return value.length ? value.map(formatItem).join(", ") : "Not provided";
  return formatItem(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let screeningId: string | null = null;

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);

    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: authUser, error: authError } = await userClient.auth.getUser();
    if (authError || !authUser.user) return json({ error: "Invalid session." }, 401);

    const body = await req.json().catch(() => ({}));
    const submissionId = String(body?.submission_id || "");
    if (!submissionId) return json({ error: "submission_id is required." }, 400);

    const { data: submission, error: submissionError } = await admin.from("submissions")
      .select("id,application_id,form_version_id,answers(question_id,value)")
      .eq("id", submissionId)
      .single();
    if (submissionError || !submission) return json({ error: "Submission not found." }, 404);

    const { data: application, error: applicationError } = await admin.from("applications")
      .select("id,organization_id")
      .eq("id", submission.application_id)
      .single();
    if (applicationError || !application) return json({ error: "Application not found." }, 404);

    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("id,organization_id,role")
      .eq("id", authUser.user.id)
      .single();
    if (profileError || !profile || profile.organization_id !== application.organization_id || !["owner","admin","reviewer"].includes(profile.role)) {
      return json({ error: "You are not authorized to screen this application." }, 403);
    }

    if (profile.role === "reviewer") {
      const { data: assignment, error: assignmentError } = await admin.from("review_assignments")
        .select("id")
        .eq("submission_id", submissionId)
        .eq("reviewer_id", authUser.user.id)
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assignment) return json({ error: "This application is not assigned to you." }, 403);
    }

    const questionIds = (submission.answers || []).map((answer: any) => answer.question_id);
    const [{ data: questions, error: questionsError }, { data: options, error: optionsError }, { data: eligibility, error: eligibilityError }] = await Promise.all([
      admin.from("questions")
        .select("id,label,type,position")
        .in("id", questionIds.length ? questionIds : ["00000000-0000-0000-0000-000000000000"]),
      admin.from("question_options")
        .select("id,question_id,label,value")
        .in("question_id", questionIds.length ? questionIds : ["00000000-0000-0000-0000-000000000000"]),
      admin.from("submission_eligibility")
        .select("status,reasons")
        .eq("submission_id", submissionId)
        .maybeSingle(),
    ]);
    if (questionsError) throw questionsError;
    if (optionsError) throw optionsError;
    if (eligibilityError) throw eligibilityError;

    const optionLabels = new Map<string,string>();
    for (const option of options || []) {
      optionLabels.set(option.question_id + ":" + String(option.id), option.label);
      optionLabels.set(option.question_id + ":" + String(option.value), option.label);
    }

    const answerByQuestion = new Map((submission.answers || []).map((answer: any) => [answer.question_id, answer.value]));
    const normalizedQuestions = (questions || []).map((question: any) => ({
      ...question,
      normalized: normalizeLabel(question.label),
    }));

    const pick = (matcher: (label: string) => boolean): string => {
      const question = normalizedQuestions.find((item: any) => matcher(item.normalized));
      if (!question) return "Not provided";
      return answerText(answerByQuestion.get(question.id), question.id, optionLabels);
    };

    const age = pick((label) => label === "age" || label === "your age" || label.startsWith("age "));
    const residentialAddress = pick((label) =>
      label.includes("residential address") ||
      label === "home address" ||
      label === "address"
    );
    const trade = pick((label) =>
      label === "what is your trade" ||
      label === "your trade" ||
      label === "trade" ||
      label.startsWith("what is your trade ")
    );

    const quickProfile = {
      age,
      residential_address: residentialAddress,
      trade,
    };

    const { data: existing, error: existingError } = await admin.from("ai_screenings")
      .select("id")
      .eq("submission_id", submissionId)
      .maybeSingle();
    if (existingError) throw existingError;

    const screeningPayload = {
      status: "completed",
      overall_assessment: JSON.stringify(quickProfile),
      eligibility_status: eligibility?.status || "pending",
      eligibility_assessment: eligibility?.status === "eligible"
        ? "Eligible"
        : eligibility?.status === "ineligible"
        ? "Not eligible"
        : "Pending",
      criterion_assessments: [],
      strengths: [],
      concerns: [],
      missing_information: Object.entries(quickProfile).filter(([,value]) => value === "Not provided").map(([key]) => key),
      inconsistencies: [],
      evidence: [
        "Age: " + age,
        "Residential Address: " + residentialAddress,
        "Trade: " + trade,
      ],
      suggested_score: null,
      confidence: "1",
      model: "applyflow-quick-screen-v1",
      error_message: null,
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      screeningId = existing.id;
      const { error: updateError } = await admin.from("ai_screenings").update(screeningPayload).eq("id", screeningId);
      if (updateError) throw updateError;
    } else {
      const { data: created, error: createError } = await admin.from("ai_screenings")
        .insert({ submission_id: submissionId, ...screeningPayload })
        .select("id")
        .single();
      if (createError) throw createError;
      screeningId = created.id;
    }

    return json({
      screening_id: screeningId,
      status: "completed",
      profile: quickProfile,
      model: "applyflow-quick-screen-v1",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quick screening failed.";
    if (screeningId) {
      try {
        const { createClient } = await import("npm:@supabase/supabase-js@2");
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await admin.from("ai_screenings").update({ status: "failed", error_message: message }).eq("id", screeningId);
      } catch {}
    }
    return json({ error: message }, 500);
  }
});
