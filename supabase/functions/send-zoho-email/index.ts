import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function merge(template: string, values: Record<string,string>) {
  return Object.entries(values).reduce((result,[key,value]) => result.split("{{"+key+"}}").join(value), template);
}

async function getAccessToken() {
  const required = ["ZOHO_CLIENT_ID","ZOHO_CLIENT_SECRET","ZOHO_REFRESH_TOKEN","ZOHO_ACCOUNT_ID","ZOHO_FROM_ADDRESS"];
  const missing = required.filter((name) => !Deno.env.get(name));
  if (missing.length) throw new Error("ZOHO_NOT_CONFIGURED:"+missing.join(","));

  const accountsBase = (Deno.env.get("ZOHO_ACCOUNTS_BASE_URL") || "https://accounts.zoho.com").replace(/\/$/, "");
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: Deno.env.get("ZOHO_CLIENT_ID")!,
    client_secret: Deno.env.get("ZOHO_CLIENT_SECRET")!,
    refresh_token: Deno.env.get("ZOHO_REFRESH_TOKEN")!,
  });
  const response = await fetch(accountsBase + "/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) throw new Error(payload?.error || "Zoho token refresh failed.");
  return String(payload.access_token);
}

async function sendZoho(accessToken: string, toAddress: string, subject: string, content: string) {
  const mailBase = (Deno.env.get("ZOHO_MAIL_BASE_URL") || "https://mail.zoho.com").replace(/\/$/, "");
  const accountId = Deno.env.get("ZOHO_ACCOUNT_ID")!;
  const fromAddress = Deno.env.get("ZOHO_FROM_ADDRESS")!;
  const request = () => fetch(mailBase + "/api/accounts/" + encodeURIComponent(accountId) + "/messages", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": "Zoho-oauthtoken " + accessToken,
    },
    body: JSON.stringify({
      fromAddress,
      toAddress,
      subject,
      content,
      mailFormat: "plaintext",
    }),
  });

  let response = await request();
  if (response.status === 429) {
    const retryAfter = Math.min(Number(response.headers.get("Retry-After") || 2), 5);
    await sleep(Math.max(1,retryAfter) * 1000);
    response = await request();
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.data?.errorCode || payload?.message || "Zoho rejected the message.");
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid session." }, 401);

    const body = await req.json();
    const organizationId = String(body?.organization_id || "");
    const applicationId = String(body?.application_id || "");
    const participantIds = Array.isArray(body?.participant_ids) ? [...new Set(body.participant_ids.map(String))] : [];
    const subjectTemplate = String(body?.subject || "").trim();
    const bodyTemplate = String(body?.body || "").trim();
    const whatsappGroupLink = String(body?.whatsapp_group_link || "").trim();

    if (!organizationId || !applicationId || !participantIds.length || !subjectTemplate || !bodyTemplate) {
      return json({ error: "organization_id, application_id, participant_ids, subject and body are required." }, 400);
    }
    if (participantIds.length > 50) return json({ error: "This first delivery version supports up to 50 recipients per send." }, 400);

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

    const accessToken = await getAccessToken();
    const results: { participant_id:string; email:string|null; status:"sent"|"skipped"|"failed"; error?:string }[] = [];

    for (const row of participants || []) {
      const email = row.applicants?.email ? String(row.applicants.email) : "";
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
        await sendZoho(accessToken, email, subject, content);
        results.push({ participant_id: row.participant_id, email, status: "sent" });
      } catch (error) {
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
      requested: participantIds.length,
      matched: (participants || []).length,
      sent_count: results.filter((r) => r.status === "sent").length,
      skipped_count: results.filter((r) => r.status === "skipped").length,
      failed_count: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send participant email.";
    if (message.startsWith("ZOHO_NOT_CONFIGURED:")) return json({ error: "Zoho Mail is not configured on the server.", missing: message.split(":")[1]?.split(",") || [] }, 503);
    return json({ error: message }, 500);
  }
});
