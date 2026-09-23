-- Unify ApplyFlow around one user-facing identifier: Participant ID.
-- Internal UUIDs remain for database relationships and are not shown as user IDs.

do $
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='applications' and column_name='participant_code'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='applications' and column_name='participant_id_prefix'
  ) then
    alter table public.applications rename column participant_code to participant_id_prefix;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='applicants' and column_name='unique_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='applicants' and column_name='participant_id'
  ) then
    alter table public.applicants rename column unique_id to participant_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='participants' and column_name='participant_code'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='participants' and column_name='participant_id'
  ) then
    alter table public.participants rename column participant_code to participant_id;
  end if;
end;
$;

alter index if exists public.applicants_unique_id_idx
  rename to applicants_participant_id_idx;

update public.participants p
set participant_id = a.participant_id,
    updated_at = now()
from public.applicants a
where a.id = p.applicant_id
  and p.participant_id is distinct from a.participant_id;

drop index if exists public.participants_application_code_key;
drop index if exists public.participants_participant_id_key;
create unique index if not exists participants_participant_id_key
  on public.participants(participant_id);

alter table public.participants
  alter column participant_id set not null;

alter table public.applicants
  alter column participant_id set not null;

create unique index if not exists applicants_participant_id_idx
  on public.applicants(participant_id);

drop trigger if exists applications_sync_participant_codes on public.applications;
drop function if exists private.sync_participant_codes_on_application_code_change();
drop table if exists private.participant_sequences;

drop trigger if exists applications_normalize_participant_code on public.applications;
drop trigger if exists applications_normalize_participant_id_prefix on public.applications;
drop function if exists private.normalize_application_participant_code();
drop function if exists private.normalize_participant_id_prefix();

create or replace function private.assign_participant_on_selection()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_submission public.submissions%rowtype;
  v_application public.applications%rowtype;
  v_participant_id text;
begin
  if new.status <> 'selected' then
    return new;
  end if;

  if exists (
    select 1 from public.participants
    where submission_id = new.submission_id
  ) then
    update public.participants
    set status = 'active', updated_at = now()
    where submission_id = new.submission_id;
    return new;
  end if;

  select * into v_submission
  from public.submissions
  where id = new.submission_id;

  select * into v_application
  from public.applications
  where id = v_submission.application_id;

  select participant_id into v_participant_id
  from public.applicants
  where id = v_submission.applicant_id;

  if v_participant_id is null then
    raise exception 'Participant ID is missing for this applicant.';
  end if;

  insert into public.participants (
    organization_id, application_id, submission_id, applicant_id, participant_id, status
  ) values (
    v_application.organization_id, v_application.id, v_submission.id,
    v_submission.applicant_id, v_participant_id, 'active'
  );

  return new;
end;
$function$;

drop function if exists public.submit_application_with_id(uuid,uuid,text,text,jsonb);
drop function if exists private.submit_application_with_id(uuid,uuid,text,text,jsonb);

create or replace function private.submit_application_with_participant_id(
  p_application_id uuid,
  p_form_version_id uuid,
  p_email text,
  p_full_name text,
  p_answers jsonb
) returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $function$
declare
  v_submission_id uuid;
  v_applicant_id uuid;
  v_participant_id text;
begin
  v_submission_id := private.submit_application(
    p_application_id,
    p_form_version_id,
    p_email,
    p_full_name,
    p_answers
  );

  select applicant_id into v_applicant_id
  from public.submissions
  where id = v_submission_id;

  select participant_id into v_participant_id
  from public.applicants
  where id = v_applicant_id;

  return jsonb_build_object(
    'participant_id', v_participant_id
  );
end;
$function$;

create or replace function public.submit_application_with_participant_id(
  p_application_id uuid,
  p_form_version_id uuid,
  p_email text,
  p_full_name text,
  p_answers jsonb
) returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $function$
begin
  return private.submit_application_with_participant_id(
    p_application_id,
    p_form_version_id,
    p_email,
    p_full_name,
    p_answers
  );
end;
$function$;

revoke all on function public.submit_application_with_participant_id(uuid,uuid,text,text,jsonb) from public;
grant execute on function public.submit_application_with_participant_id(uuid,uuid,text,text,jsonb) to anon, authenticated;

-- The programme prefix was only a second identifier-generation concept.
-- Remove it so Participant ID is the sole user-facing identifier.
alter table public.applications
  drop column if exists participant_id_prefix;
