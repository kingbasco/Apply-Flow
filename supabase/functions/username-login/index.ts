import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://apply-flow-one.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const configuredOrigins = (Deno.env.get("APPLYFLOW_ALLOWED_ORIGINS") || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins]);

function responseHeaders(req: Request) {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  if (origin && allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

const json = (req: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...responseHeaders(req),
      ...extraHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });

function requestOriginAllowed(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || allowedOrigins.has(origin);
}

function getClientIp(req: Request) {
  const candidates = [
    req.headers.get("cf-connecting-ip"),
    req.headers.get("x-real-ip"),
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
  ];
  const ip = candidates.find((value) => value && value.length <= 128);
  return ip || null;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type RateKey = {
  key: string;
  limit: number;
  windowSeconds: number;
  blockSeconds: number;
};

Deno.serve(async (req: Request) => {
  if (!requestOriginAllowed(req)) return json(req, { error: "Request origin is not allowed." }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json(req, { error: "Invalid username or password." }, 401);
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return json(req, { error: "Request too large." }, 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRole) {
    return json(req, { error: "Login service is unavailable." }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Invalid username or password." }, 401);
  }

  const username = String(body?.username || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!/^[a-z0-9_]{3,30}$/.test(username) || !password || password.length > 256) {
    return json(req, { error: "Invalid username or password." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ip = getClientIp(req);
  const rateKeys: RateKey[] = [
    { key: await sha256Hex(`username:${username}`), limit: 12, windowSeconds: 900, blockSeconds: 900 },
  ];
  if (ip) {
    rateKeys.push(
      { key: await sha256Hex(`pair:${username}:${ip}`), limit: 5, windowSeconds: 900, blockSeconds: 900 },
      { key: await sha256Hex(`ip:${ip}`), limit: 30, windowSeconds: 900, blockSeconds: 900 },
    );
  }

  let retryAfter = 0;
  for (const rate of rateKeys) {
    const { data, error } = await admin.rpc("check_login_rate_limit", {
      p_key_hash: rate.key,
      p_limit: rate.limit,
      p_window_seconds: rate.windowSeconds,
      p_block_seconds: rate.blockSeconds,
    });
    if (error) return json(req, { error: "Login service is temporarily unavailable." }, 503);
    const state = Array.isArray(data) ? data[0] : null;
    if (state && state.allowed === false) {
      retryAfter = Math.max(retryAfter, Number(state.retry_after_seconds || 1));
    }
  }

  if (retryAfter > 0) {
    return json(
      req,
      { error: "Too many login attempts. Please try again later." },
      429,
      { "Retry-After": String(retryAfter) },
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("email")
    .eq("username", username)
    .maybeSingle();

  if (profileError) return json(req, { error: "Login service is temporarily unavailable." }, 503);

  // Always perform an Auth password attempt, including unknown usernames,
  // so the endpoint does not reveal whether an account exists.
  const email = String(profile?.email || "no-such-user@invalid.applyflow.local");
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  const success = !error && Boolean(data.session);

  for (const rate of rateKeys) {
    const { error: recordError } = await admin.rpc("record_login_rate_limit", {
      p_key_hash: rate.key,
      p_success: success,
      p_limit: rate.limit,
      p_window_seconds: rate.windowSeconds,
      p_block_seconds: rate.blockSeconds,
    });
    if (recordError && success) {
      await authClient.auth.signOut();
      return json(req, { error: "Login service is temporarily unavailable." }, 503);
    }
  }

  if (!success || !data.session) {
    return json(req, { error: "Invalid username or password." }, 401);
  }

  return json(req, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at ?? null,
    expires_in: data.session.expires_in ?? null,
    token_type: data.session.token_type ?? "bearer",
  });
});
