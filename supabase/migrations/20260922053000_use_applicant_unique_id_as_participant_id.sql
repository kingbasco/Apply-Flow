-- Use the applicant's existing unique ID as the permanent participant ID.
-- Do not generate a second participant-specific identifier.

update public.participants p
set participant_code = a.unique_id,
    updated_at = now()
from public.applicants a
where a.id = p.applicant_id
  and p.participant_code is distinct from a.unique_id;

create or replace function private.assign_participant_on_selection()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_submission public.submissions%rowtype;
  v_applicant public.applicants%rowtype;
  v_org uuid;
begin
  if new.status <> 'selected' then
    return new;
  end if;

  select * into v_submission
  from public.submissions
  where id = new.submission_id;

  select * into v_applicant
  from public.applicants
  where id = v_submission.applicant_id;

  select organization_id into v_org
  from public.applications
  where id = v_submission.application_id;

  if exists (select 1 from public.participants where submission_id = new.submission_id) then
    update public.participants
    set status='active',
        participant_code=v_applicant.unique_id,
        updated_at=now()
    where submission_id=new.submission_id;
    return new;
  end if;

  insert into public.participants (
    organization_id, application_id, submission_id, applicant_id, participant_code, status
  ) values (
    v_org,
    v_submission.application_id,
    v_submission.id,
    v_submission.applicant_id,
    v_applicant.unique_id,
    'active'
  );

  return new;
end;
$function$;
