import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const memberId = String(body?.member_id || "");
    const action = body?.action === "resend" ? "resend" : body?.action === "delete" ? "delete" : "";
    if (!organizationId || !memberId || !action) return json({ error: "organization_id, member_id and action are required." }, 400);

    const { data: manager, error: managerError } = await admin.from("profiles")
      .select("id,organization_id,role").eq("id", authData.user.id).single();
    if (managerError || !manager || manager.organization_id !== organizationId || !["owner", "admin"].includes(manager.role)) {
      return json({ error: "Only an Owner or Admin can manage team members." }, 403);
    }
    if (memberId === authData.user.id) return json({ error: "You cannot remove yourself." }, 400);

    const { data: member, error: memberError } = await admin.from("profiles")
      .select("id,full_name,email,role,organization_id,invitation_status")
      .eq("id", memberId).single();
    if (memberError || !member || member.organization_id !== organizationId) return json({ error: "Team member not found." }, 404);
    if (member.role === "owner") return json({ error: "The workspace owner cannot be removed." }, 400);
    if (member.role === "admin" && manager.role !== "owner") {
      return json({ error: "Only the workspace Owner can manage or remove an Admin." }, 403);
    }

    const { data: authMember, error: authMemberError } = await admin.auth.admin.getUserById(memberId);
    if (authMemberError || !authMember.user) return json({ error: "The member account could not be found." }, 404);

    if (action === "resend") {
      if (member.invitation_status !== "pending" || authMember.user.email_confirmed_at) {
        return json({ error: "This member has already completed account setup. Resend is only available for pending invitations." }, 400);
      }
      const email = authMember.user.email || member.email;
      if (!email) return json({ error: "No email address is available for this invitation." }, 400);
      const fullName = member.full_name || authMember.user.user_metadata?.full_name || email.split("@")[0];

      const { error: deleteError } = await admin.auth.admin.deleteUser(memberId);
      if (deleteError) return json({ error: deleteError.message }, 400);

      const redirectTo = "https://apply-flow-one.vercel.app/login?invite=1";
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo,
      });
      if (inviteError) return json({ error: inviteError.message }, 400);
      if (!invited.user) return json({ error: "A new invitation could not be created." }, 500);

      const { error: profileError } = await admin.from("profiles").upsert({
        id: invited.user.id,
        full_name: fullName,
        email,
        invitation_status: "pending",
        organization_id: organizationId,
        role: member.role,
      }, { onConflict: "id" });
      if (profileError) {
        try { await admin.auth.admin.deleteUser(invited.user.id); } catch {}
        return json({ error: profileError.message }, 500);
      }
      return json({ resent: true, user_id: invited.user.id, email });
    }

    const [
      { data: assignedRows, error: assignedRowsError },
      { data: createdInviteRows, error: createdInviteRowsError },
      { data: usedInviteRows, error: usedInviteRowsError },
    ] = await Promise.all([
      admin.from("participant_staff_assignments").select("id").eq("assigned_by", memberId),
      admin.from("team_invite_links").select("id").eq("created_by", memberId),
      admin.from("team_invite_links").select("id").eq("used_by", memberId),
    ]);
    if (assignedRowsError) throw assignedRowsError;
    if (createdInviteRowsError) throw createdInviteRowsError;
    if (usedInviteRowsError) throw usedInviteRowsError;

    const assignedIds = (assignedRows || []).map((row: any) => row.id);
    const createdInviteIds = (createdInviteRows || []).map((row: any) => row.id);
    const usedInviteIds = (usedInviteRows || []).map((row: any) => row.id);

    if (assignedIds.length) {
      const { error } = await admin.from("participant_staff_assignments").update({ assigned_by: manager.id }).in("id", assignedIds);
      if (error) throw error;
    }
    if (createdInviteIds.length) {
      const { error } = await admin.from("team_invite_links").update({ created_by: manager.id }).in("id", createdInviteIds);
      if (error) throw error;
    }
    if (usedInviteIds.length) {
      const { error } = await admin.from("team_invite_links").update({ used_by: null }).in("id", usedInviteIds);
      if (error) throw error;
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(memberId);
    if (deleteError) {
      try {
        if (assignedIds.length) await admin.from("participant_staff_assignments").update({ assigned_by: memberId }).in("id", assignedIds);
        if (createdInviteIds.length) await admin.from("team_invite_links").update({ created_by: memberId }).in("id", createdInviteIds);
        if (usedInviteIds.length) await admin.from("team_invite_links").update({ used_by: memberId }).in("id", usedInviteIds);
      } catch {}
      return json({ error: deleteError.message }, 400);
    }
    return json({ deleted: true, user_id: memberId });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not manage team member." }, 500);
  }
});