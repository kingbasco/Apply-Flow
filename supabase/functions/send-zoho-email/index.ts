import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  closeZohoSmtp,
  getZohoSmtpConfig,
  openZohoSmtp,
  sendZohoSmtpMessage,
  type ZohoSmtpSession,
} from "./smtp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function merge(template: string, values: Record<string,string>) {
  return Object.entries(values).reduce((result,[key,value]) => result.split("{{"+key+"}}").join(value), template);
}

const applyflowAllowedOrigins = new Set([
  "https://apply-flow-one.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...(Deno.env.get("APPLYFLOW_ALLOWED_ORIGINS") || "").split(",").map((value) => value.trim()).filter(Boolean),
]);

function applyflowOriginAllowed(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || applyflowAllowedOrigins.has(origin);
}

Deno.serve(async (req) => {
  if (!applyflowOriginAllowed(req)) return new Response(JSON.stringify({ error: "Request origin is not allowed." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let smtpSession: ZohoSmtpSession | null = null;

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);

    const { createClient } = await import("npm:@supabase/supabase-js@2.57.4");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid session." }, 401);

    const requestBody = await req.json();
    const organizationId = String(requestBody?.organization_id || "");
    const applicationId = String(requestBody?.application_id || "");
    const participantIds = Array.isArray(requestBody?.participant_ids) ? [...new Set(requestBody.participant_ids.map(String))] : [];
    const subjectTemplate = String(requestBody?.subject || "").trim();
    const bodyTemplate = String(requestBody?.body || "").trim();
    const whatsappGroupLink = String(requestBody?.whatsapp_group_link || "").trim();

    if (!organizationId || !applicationId || !participantIds.length || !subjectTemplate || !bodyTemplate) {
      return json({ error: "organization_id, application_id, participant_ids, subject and body are required." }, 400);
    }
    if (participantIds.length > 50) return json({ error: "This delivery version supports up to 50 recipients per send." }, 400);

    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("id,organization_id,role").eq("id", authData.user.id).single();
    if (profileError || !profile || profile.organization_id !== organizationId || !["owner","admin"].includes(profile.role)) {
      return json({ error: "Only an Owner or Admin can send participant email." }, 403);
    }

    const { data: application, error: applicationError } = await admin.from("applications")
      .select("id,name,organization_id").eq("id", applicationId).eq("organization_id", organizationId).single();
    if (applicationError || !application) return json({ error: "Programme not found." }, 404);

    const { data: participants, error: participantError } = await admin.from("participants")
      .select("id,participant_id,application_id,applicants(full_name,email)")
      .eq("organization_id", organizationId)
      .eq("application_id", applicationId)
      .in("id", participantIds);
    if (participantError) throw participantError;

    const { config, missing } = getZohoSmtpConfig();
    if (!config) return json({ error: "Zoho Mail is not configured on the server.", missing }, 503);

    const results: { participant_id:string; email:string|null; status:"sent"|"skipped"|"failed"; error?:string }[] = [];

    for (const row of participants || []) {
      const email = row.applicants?.email ? String(row.applicants.email).trim() : "";
      if (!email || !email.includes("@")) {
        results.push({ participant_id: row.participant_id, email: email || null, status: "skipped", error: "No valid email address." });
        continue;
      }

      const values = {
        name: String(row.applicants?.full_name || "Participant"),
        participant_id: String(row.participant_id || ""),
        email,
        programme_name: String(application.name || "Programme"),
        whatsapp_group_link: whatsappGroupLink,
      };
      const subject = merge(subjectTemplate, values);
      const content = merge(bodyTemplate, values);

      try {
        if (!smtpSession) smtpSession = await openZohoSmtp(config);
        await sendZohoSmtpMessage(smtpSession, config, email, subject, content);
        results.push({ participant_id: row.participant_id, email, status: "sent" });
      } catch (error) {
        await closeZohoSmtp(smtpSession);
        smtpSession = null;
        results.push({
          participant_id: row.participant_id,
          email,
          status: "failed",
          error: error instanceof Error ? error.message : "Send failed.",
        });
      }
    }

    return json({
      provider: "zoho",
      transport: "smtp",
      from_address: config.fromAddress,
      requested: participantIds.length,
      matched: (participants || []).length,
      sent_count: results.filter((r) => r.status === "sent").length,
      skipped_count: results.filter((r) => r.status === "skipped").length,
      failed_count: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send participant email.";
    return json({ error: message }, 500);
  } finally {
    await closeZohoSmtp(smtpSession);
  }
});
