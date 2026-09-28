-- Centralize final application decisions so Screening and Reviews use one authoritative path.
-- Owner/Admin only. Existing decision triggers keep selection and participant enrollment in sync.

create or replace function public.set_submission_decision(
  p_submission_id uuid,
  p_decision text
)
returns table (
  submission_id uuid,
  decision text,
  participant_id text,
  participant_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_organization_id uuid;
  v_role text;
  v_saved_decision text;
  v_participant_id text;
  v_participant_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  if p_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  select a.organization_id
    into v_organization_id
  from public.submissions s
  join public.applications a on a.id = s.application_id
  where s.id = p_submission_id;

  if v_organization_id is null then
    raise exception 'Submission not found.';
  end if;

  select p.role::text
    into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.organization_id = v_organization_id;

  if coalesce(v_role,'') not in ('owner','admin') then
    raise exception 'Only an Owner or Admin can make the final application decision.';
  end if;

  update public.submissions
  set decision = p_decision
  where id = p_submission_id
  returning public.submissions.decision::text into v_saved_decision;

  if v_saved_decision is null then
    raise exception 'The application decision was not saved.';
  end if;

  select p.participant_id, p.status::text
    into v_participant_id, v_participant_status
  from public.participants p
  where p.submission_id = p_submission_id
  limit 1;

  return query
  select p_submission_id, v_saved_decision, v_participant_id, v_participant_status;
end;
$function$;

revoke all on function public.set_submission_decision(uuid,text) from public;
revoke all on function public.set_submission_decision(uuid,text) from anon;
grant execute on function public.set_submission_decision(uuid,text) to authenticated;
