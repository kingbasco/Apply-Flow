import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

    const body = await req.json();
    const organizationId = String(body?.organization_id || "");
    const email = String(body?.email || "").trim().toLowerCase();
    const fullName = body?.full_name ? String(body.full_name).trim() : null;
    const role = body?.role === "admin" ? "admin" : "reviewer";
    if (!organizationId || !email) return json({ error: "organization_id and email are required." }, 400);

    const { data: inviter, error: inviterError } = await admin.from("profiles")
      .select("id,organization_id,role").eq("id", authData.user.id).single();
    if (inviterError || !inviter || inviter.organization_id !== organizationId || !["owner", "admin"].includes(inviter.role)) {
      return json({ error: "Only an Owner or Admin can invite team members." }, 403);
    }
    if (role === "admin" && inviter.role !== "owner") {
      return json({ error: "Only the workspace Owner can invite an Admin." }, 403);
    }

    const requestedRedirect = String(body?.redirect_to || "").trim();
    const fallbackRedirect = "https://apply-flow-one.vercel.app/login?invite=1";
    let redirectTo = fallbackRedirect;
    if (requestedRedirect) {
      try {
        const parsed = new URL(requestedRedirect);
        const allowed = new Set([
          "https://apply-flow-one.vercel.app",
          "https://apply-flow-bascocreative.vercel.app",
          "http://localhost:5173",
          "http://127.0.0.1:5173",
        ]);
        if (!allowed.has(parsed.origin)) return json({ error: "Invitation redirect is not allowed." }, 400);
        redirectTo = parsed.toString();
      } catch {
        return json({ error: "Invitation redirect is not allowed." }, 400);
      }
    }
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo,
    });
    if (inviteError) return json({ error: inviteError.message }, 400);
    if (!invited.user) return json({ error: "Invitation could not be created." }, 500);

    const { error: profileError } = await admin.from("profiles").upsert({
      id: invited.user.id,
      full_name: fullName || invited.user.user_metadata?.full_name || email.split("@")[0],
      email,
      invitation_status: "pending",
      organization_id: organizationId,
      role,
    }, { onConflict: "id" });
    if (profileError) {
      try { await admin.auth.admin.deleteUser(invited.user.id); } catch {}
      return json({ error: profileError.message }, 500);
    }
    return json({ invited: true, user_id: invited.user.id, email });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not send invitation." }, 500);
  }
});