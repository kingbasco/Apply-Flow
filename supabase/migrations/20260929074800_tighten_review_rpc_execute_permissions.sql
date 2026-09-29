-- Restrict internal review RPCs to authenticated workspace users.
revoke all on function public.assign_review_submission(uuid, uuid) from public;
revoke all on function public.assign_review_submission(uuid, uuid) from anon;
grant execute on function public.assign_review_submission(uuid, uuid) to authenticated;

revoke all on function public.update_review_assignment(uuid, text, numeric, text, text) from public;
revoke all on function public.update_review_assignment(uuid, text, numeric, text, text) from anon;
grant execute on function public.update_review_assignment(uuid, text, numeric, text, text) to authenticated;
