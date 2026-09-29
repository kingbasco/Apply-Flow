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

async function authorize(req: Request, organizationId: string) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("AUTH_REQUIRED");
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
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

async function refreshZohoToken() {
  const accountsBase = (Deno.env.get("ZOHO_ACCOUNTS_BASE_URL") || "https://accounts.zoho.com").replace(/\/$/, "");
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: Deno.env.get("ZOHO_CLIENT_ID") || "",
    client_secret: Deno.env.get("ZOHO_CLIENT_SECRET") || "",
    refresh_token: Deno.env.get("ZOHO_REFRESH_TOKEN") || "",
  });
  const response = await fetch(accountsBase + "/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) throw new Error(payload?.error || "Zoho token refresh failed.");
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const organizationId = String(body?.organization_id || "");
    if (!organizationId) return json({ error: "organization_id is required." }, 400);
    await authorize(req, organizationId);

    const required = ["ZOHO_CLIENT_ID","ZOHO_CLIENT_SECRET","ZOHO_REFRESH_TOKEN","ZOHO_ACCOUNT_ID","ZOHO_FROM_ADDRESS"];
    const missing = required.filter((name) => !Deno.env.get(name));
    const configured = missing.length === 0;
    let validated = false;
    let validationError = "";

    if (configured && body?.validate === true) {
      try { validated = await refreshZohoToken(); }
      catch (error) { validationError = error instanceof Error ? error.message : "Could not validate Zoho Mail."; }
    }

    return json({
      provider: "zoho",
      configured,
      validated,
      validation_error: validationError || null,
      from_address: configured ? Deno.env.get("ZOHO_FROM_ADDRESS") : null,
      missing,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not check Zoho Mail status.";
    if (message === "AUTH_REQUIRED") return json({ error: "Authentication required." }, 401);
    if (message === "FORBIDDEN") return json({ error: "Only an Owner or Admin can manage Zoho Mail." }, 403);
    return json({ error: message }, 500);
  }
});
