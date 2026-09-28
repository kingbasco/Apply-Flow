-- QA hardening: keep privileged workspace RPCs unavailable to anonymous callers.
-- Public applicant/assignment/attendance lookup and submission RPCs remain unchanged.

revoke all on function public.bulk_set_participant_staff_assignment(uuid[],uuid,boolean) from public;
revoke execute on function public.bulk_set_participant_staff_assignment(uuid[],uuid,boolean) from anon;
grant execute on function public.bulk_set_participant_staff_assignment(uuid[],uuid,boolean) to authenticated;

revoke all on function public.complete_invited_member_profile(text,text,integer,integer) from public;
revoke execute on function public.complete_invited_member_profile(text,text,integer,integer) from anon;
grant execute on function public.complete_invited_member_profile(text,text,integer,integer) to authenticated;

revoke all on function public.create_team_invite_link(uuid,text,integer) from public;
revoke execute on function public.create_team_invite_link(uuid,text,integer) from anon;
grant execute on function public.create_team_invite_link(uuid,text,integer) to authenticated;

revoke all on function public.grade_assignment_submission(uuid,numeric,text) from public;
revoke execute on function public.grade_assignment_submission(uuid,numeric,text) from anon;
grant execute on function public.grade_assignment_submission(uuid,numeric,text) to authenticated;

revoke all on function public.reconcile_my_team_invitation() from public;
revoke execute on function public.reconcile_my_team_invitation() from anon;
grant execute on function public.reconcile_my_team_invitation() to authenticated;

revoke all on function public.revoke_team_invite_link(uuid) from public;
revoke execute on function public.revoke_team_invite_link(uuid) from anon;
grant execute on function public.revoke_team_invite_link(uuid) to authenticated;

revoke all on function public.set_participant_staff_assignment(uuid,uuid,boolean) from public;
revoke execute on function public.set_participant_staff_assignment(uuid,uuid,boolean) from anon;
grant execute on function public.set_participant_staff_assignment(uuid,uuid,boolean) to authenticated;

alter function public.normalize_attendance_slug(text) set search_path = pg_catalog;
