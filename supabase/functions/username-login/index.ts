import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRole) return json({ error: "Login service is unavailable." }, 503);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid username or password." }, 401); }

  const username = String(body?.username || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!/^[a-z0-9_]{3,30}$/.test(username) || !password || password.length > 1024) {
    return json({ error: "Invalid username or password." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const authClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: profile } = await admin.from("profiles").select("email").ilike("username", username).maybeSingle();
  const email = String(profile?.email || "no-such-user@invalid.applyflow.local");
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) return json({ error: "Invalid username or password." }, 401);

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at ?? null,
    expires_in: data.session.expires_in ?? null,
    token_type: data.session.token_type ?? "bearer",
  });
});
