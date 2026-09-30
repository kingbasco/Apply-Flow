import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  closeZohoSmtp,
  getZohoSmtpConfig,
  openZohoSmtp,
  sendZohoSmtpMessage,
  validateZohoSmtpSender,
  type ZohoSmtpSession,
} from "./smtp.ts";
import { getZeptoMailConfig, sendZeptoMailMessage } from "./zeptomail.ts";

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
  "https://apply-flow-bascocreative.vercel.app",
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
    const deliveryId = String(requestBody?.delivery_id || "").trim();
    const batchNumber = Number(requestBody?.batch_number || 1);
    const batchCount = Number(requestBody?.batch_count || 1);

    if (!organizationId || !applicationId || !participantIds.length || !subjectTemplate || !bodyTemplate) {
      return json({ error: "organization_id, application_id, participant_ids, subject and body are required." }, 400);
    }
    if (participantIds.length > 10) return json({ error: "This delivery version supports up to 10 recipients per batch." }, 400);
    if (deliveryId && !/^[0-9a-f-]{36}$/i.test(deliveryId)) return json({ error: "Invalid delivery identifier." }, 400);
    if (!Number.isInteger(batchNumber) || batchNumber < 1 || !Number.isInteger(batchCount) || batchCount < 1 || batchNumber > batchCount) {
      return json({ error: "Invalid delivery batch metadata." }, 400);
    }

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

    const { config: zeptoConfig, missing: zeptoMissing } = getZeptoMailConfig();
    const { config: smtpConfig, missing: smtpMissing } = getZohoSmtpConfig();
    if (!zeptoConfig && !smtpConfig) {
      return json({
        error: "No participant email provider is configured on the server.",
        missing: [...zeptoMissing, ...smtpMissing],
      }, 503);
    }
    const provider = zeptoConfig ? "zeptomail" : "zoho";
    const transport = zeptoConfig ? "api" : "smtp";

    if (!zeptoConfig && smtpConfig) {
      try {
        smtpSession = await openZohoSmtp(smtpConfig);
        await validateZohoSmtpSender(smtpSession, smtpConfig);
      } catch (error) {
        const transportError = error instanceof Error ? error.message : "Zoho SMTP validation failed.";
        console.error(JSON.stringify({
          event: "zoho_smtp_preflight_failed",
          delivery_id: deliveryId || null,
          batch_number: batchNumber,
          batch_count: batchCount,
          error: transportError,
        }));
        await closeZohoSmtp(smtpSession);
        smtpSession = null;
        return json({
          error: transportError,
          provider,
          transport,
          stage: "sender_preflight",
        }, 502);
      }
    }

    const results: { participant_id:string; email:string|null; status:"sent"|"skipped"|"failed"; error?:string; request_id?:string|null }[] = [];

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
        if (zeptoConfig) {
          const accepted=await sendZeptoMailMessage(
            zeptoConfig,
            email,
            String(row.applicants?.full_name||"Participant"),
            subject,
            content,
          );
          results.push({ participant_id: row.participant_id, email, status: "sent", request_id: accepted.request_id });
        } else if (smtpConfig) {
          if (!smtpSession) {
            smtpSession = await openZohoSmtp(smtpConfig);
            await validateZohoSmtpSender(smtpSession, smtpConfig);
          }
          await sendZohoSmtpMessage(smtpSession, smtpConfig, email, subject, content);
          results.push({ participant_id: row.participant_id, email, status: "sent" });
        }
      } catch (error) {
        const message=error instanceof Error?error.message:"Send failed.";
        await closeZohoSmtp(smtpSession);
        smtpSession=null;
        if(message.includes("550 5.4.6")&&message.toLowerCase().includes("unusual sending activity")){
          const blockedMessage="Zoho Mail has temporarily blocked outgoing mail because it detected unusual sending activity. Do not retry bulk sends from this mailbox. Unblock the mailbox in Zoho or configure ZeptoMail for ApplyFlow automated participant email.";
          console.error(JSON.stringify({
            event:"zoho_usage_block",
            delivery_id:deliveryId||null,
            batch_number:batchNumber,
            error:message,
          }));
          return json({
            error:blockedMessage,
            error_code:"ZOHO_USAGE_BLOCK",
            provider:"zoho",
            transport:"smtp",
            stage:"message_send",
          });
        }
        results.push({
          participant_id: row.participant_id,
          email,
          status: "failed",
          error: message,
        });
      }
    }

    const summary = {
      provider,
      transport,
      from_address: zeptoConfig?.fromAddress || smtpConfig?.fromAddress || null,
      delivery_id: deliveryId || null,
      batch_number: batchNumber,
      batch_count: batchCount,
      requested: participantIds.length,
      matched: (participants || []).length,
      sent_count: results.filter((r) => r.status === "sent").length,
      skipped_count: results.filter((r) => r.status === "skipped").length,
      failed_count: results.filter((r) => r.status === "failed").length,
      first_failure_error: results.find((r) => r.status === "failed")?.error || null,
      results,
    };
    console.info(JSON.stringify({
      event: "zoho_email_batch_complete",
      delivery_id: summary.delivery_id,
      batch_number: summary.batch_number,
      batch_count: summary.batch_count,
      requested: summary.requested,
      matched: summary.matched,
      sent_count: summary.sent_count,
      skipped_count: summary.skipped_count,
      failed_count: summary.failed_count,
      first_failure_error: summary.first_failure_error,
    }));
    return json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send participant email.";
    return json({ error: message }, 500);
  } finally {
    await closeZohoSmtp(smtpSession);
  }
});
