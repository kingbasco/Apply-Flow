import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { closeZohoSmtp, getZohoSmtpConfig, openZohoSmtp, validateZohoSmtpSender } from "./smtp.ts";
import { getZeptoMailConfig } from "./zeptomail.ts";

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

async function authorize(req: Request, organizationId: string) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("AUTH_REQUIRED");
  const { createClient } = await import("npm:@supabase/supabase-js@2.57.4");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) throw new Error("AUTH_REQUIRED");
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("id,organization_id,role").eq("id", authData.user.id).single();
  if (profileError || !profile || profile.organization_id !== organizationId || !["owner","admin"].includes(profile.role)) {
    throw new Error("FORBIDDEN");
  }
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

  try {
    const body = await req.json().catch(() => ({}));
    const organizationId = String(body?.organization_id || "");
    if (!organizationId) return json({ error: "organization_id is required." }, 400);
    await authorize(req, organizationId);

    const { config: zeptoConfig, missing: zeptoMissing } = getZeptoMailConfig();
    if (zeptoConfig) {
      return json({
        provider:"zeptomail",
        transport:"api",
        configured:true,
        validated:false,
        validation_error:null,
        validation_note:"ZeptoMail API is configured. Token and verified-domain acceptance are confirmed on the first send.",
        from_address:zeptoConfig.fromAddress,
        smtp_host:null,
        missing:[],
      });
    }

    const { config, missing } = getZohoSmtpConfig();
    const configured = Boolean(config);
    let validated = false;
    let validationError = "";
    let smtpHost: string | null = null;

    if (config && body?.validate === true) {
      try {
        const session = await openZohoSmtp(config);
        smtpHost = session.host;
        await validateZohoSmtpSender(session, config);
        validated = true;
        await closeZohoSmtp(session);
      } catch (error) {
        validationError = error instanceof Error ? error.message : "Could not validate Zoho Mail.";
      }
    }

    return json({
      provider: "zoho",
      transport: "smtp",
      configured,
      validated,
      validation_error: validationError || null,
      validation_note:null,
      from_address: config?.fromAddress || null,
      smtp_host: smtpHost,
      missing: configured ? [] : [...zeptoMissing, ...missing],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not check Zoho Mail status.";
    if (message === "AUTH_REQUIRED") return json({ error: "Authentication required." }, 401);
    if (message === "FORBIDDEN") return json({ error: "Only an Owner or Admin can manage Zoho Mail." }, 403);
    return json({ error: message }, 500);
  }
});
