-- Keep screening decisions, selection state and participant enrollment in sync.
-- Approving a submission selects it and automatically enrolls/creates the participant.
-- Rejecting a submission records a rejected selection and does not create a participant.

create or replace function private.sync_selection_and_participant_on_submission_decision()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.decision is null or new.decision = 'pending' then
    return new;
  end if;

  if new.decision = 'approved' then
    insert into public.submission_selections (submission_id,status,decided_by,decided_at,updated_at)
    values (new.id,'selected',(select auth.uid()),now(),now())
    on conflict (submission_id) do update
      set status='selected',
          decided_by=coalesce((select auth.uid()), public.submission_selections.decided_by),
          decided_at=now(),
          updated_at=now();

    update public.participants
    set status='active', updated_at=now()
    where submission_id=new.id;

  elsif new.decision = 'rejected' then
    insert into public.submission_selections (submission_id,status,decided_by,decided_at,updated_at)
    values (new.id,'rejected',(select auth.uid()),now(),now())
    on conflict (submission_id) do update
      set status='rejected',
          decided_by=coalesce((select auth.uid()), public.submission_selections.decided_by),
          decided_at=now(),
          updated_at=now();

    update public.participants
    set status='withdrawn', updated_at=now()
    where submission_id=new.id;
  end if;

  return new;
end;
$function$;

drop trigger if exists submissions_sync_selection_on_decision on public.submissions;
create trigger submissions_sync_selection_on_decision
after insert or update of decision on public.submissions
for each row
execute function private.sync_selection_and_participant_on_submission_decision();

-- Backfill existing decisions through the same synchronization path.
update public.submissions
set decision=decision
where decision in ('approved','rejected');

-- Re-approving a previously withdrawn participant makes them active again.
create or replace function private.assign_participant_on_selection()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_submission public.submissions%rowtype;
  v_org uuid;
  v_num bigint;
  v_code text;
begin
  if new.status <> 'selected' then
    return new;
  end if;

  if exists (select 1 from public.participants where submission_id = new.submission_id) then
    update public.participants
    set status='active', updated_at=now()
    where submission_id=new.submission_id;
    return new;
  end if;

  select * into v_submission from public.submissions where id = new.submission_id;
  select organization_id into v_org from public.applications where id = v_submission.application_id;

  v_num := nextval('public.participant_code_seq');
  v_code := 'HC2-' || to_char(coalesce(now()::date, current_date), 'YYYY') || '-' || lpad(v_num::text, 4, '0');

  insert into public.participants (
    organization_id, application_id, submission_id, applicant_id, participant_code, status
  ) values (
    v_org, v_submission.application_id, v_submission.id, v_submission.applicant_id, v_code, 'active'
  );

  return new;
end;
$function$;
