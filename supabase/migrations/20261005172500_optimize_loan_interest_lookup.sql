-- Optimize the loan-interest lookup without exposing privileged table access.
-- The public RPC remains SECURITY INVOKER. A non-exposed helper performs one
-- explicit Owner/Admin authorization check, then reads the required rows without
-- repeatedly invoking RLS policies across every joined table.

create schema if not exists applyflow_private;

revoke all on schema applyflow_private from public;
revoke all on schema applyflow_private from anon;
grant usage on schema applyflow_private to authenticated;

create or replace function applyflow_private.get_loan_interest_participant_ids(p_application_id uuid)
returns table(participant_id uuid)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_org_id uuid;
begin
  select a.organization_id
    into v_org_id
  from public.applications a
  where a.id=p_application_id;

  if v_org_id is null or not private.is_org_admin(v_org_id) then
    return;
  end if;

  return query
  select distinct p.id
  from public.participants p
  join public.submissions s
    on s.id=p.submission_id
   and s.application_id=p.application_id
  join public.answers ans
    on ans.submission_id=s.id
  join public.questions q
    on q.id=ans.question_id
   and q.form_version_id=s.form_version_id
  where p.application_id=p_application_id
    and p.status in ('active','completed')
    and lower(trim(q.label))='are you interested in getting a business loan?'
    and lower(trim(ans.value #>> '{}'))='yes'
  order by p.id;
end;
$$;

revoke all on function applyflow_private.get_loan_interest_participant_ids(uuid) from public;
revoke all on function applyflow_private.get_loan_interest_participant_ids(uuid) from anon;
grant execute on function applyflow_private.get_loan_interest_participant_ids(uuid) to authenticated;

create or replace function public.get_loan_interest_participant_ids(p_application_id uuid)
returns table(participant_id uuid)
language sql
stable
security invoker
set search_path=''
as $$
  select *
  from applyflow_private.get_loan_interest_participant_ids(p_application_id);
$$;

revoke all on function public.get_loan_interest_participant_ids(uuid) from public;
revoke all on function public.get_loan_interest_participant_ids(uuid) from anon;
grant execute on function public.get_loan_interest_participant_ids(uuid) to authenticated;
