-- Public review RPC wrappers execute with their owner's privilege so they can
-- reach private helper functions. The private helpers perform the actual
-- per-user, role, and organisation authorization checks.

alter function public.assign_review_submission(uuid,uuid) security definer;
alter function public.update_review_assignment(uuid,text,numeric,text) security definer;
alter function public.update_review_assignment(uuid,text,numeric,text,text) security definer;

revoke all on function public.assign_review_submission(uuid,uuid) from public, anon;
revoke all on function public.update_review_assignment(uuid,text,numeric,text) from public, anon;
revoke all on function public.update_review_assignment(uuid,text,numeric,text,text) from public, anon;

grant execute on function public.assign_review_submission(uuid,uuid) to authenticated, service_role;
grant execute on function public.update_review_assignment(uuid,text,numeric,text) to authenticated, service_role;
grant execute on function public.update_review_assignment(uuid,text,numeric,text,text) to authenticated, service_role;
