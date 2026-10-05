-- Owner/Admin-only lookup for enrolled participants who explicitly answered
-- Yes to the business-loan interest question on their submitted application.

create or replace function public.get_loan_interest_participant_ids(p_application_id uuid)
returns table(participant_id uuid)
language sql
stable
security definer
set search_path=''
as $$
  select distinct p.id
  from public.participants p
  join public.applications app
    on app.id=p.application_id
   and app.id=p_application_id
   and app.organization_id=p.organization_id
  join public.profiles me
    on me.id=auth.uid()
   and me.organization_id=p.organization_id
   and me.role in ('owner','admin')
  join public.submissions s
    on s.id=p.submission_id
   and s.application_id=p.application_id
  join public.answers ans
    on ans.submission_id=s.id
  join public.questions q
    on q.id=ans.question_id
   and q.form_version_id=s.form_version_id
  where p.status in ('active','completed')
    and lower(trim(q.label))='are you interested in getting a business loan?'
    and lower(trim(ans.value #>> '{}'))='yes'
  order by p.id;
$$;

revoke all on function public.get_loan_interest_participant_ids(uuid) from public;
revoke all on function public.get_loan_interest_participant_ids(uuid) from anon;
grant execute on function public.get_loan_interest_participant_ids(uuid) to authenticated;
