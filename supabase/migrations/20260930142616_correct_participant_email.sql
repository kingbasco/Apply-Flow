-- A single transaction updates the canonical identity, matching form answers and audit.
create table public.participant_email_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  old_email text,
  new_email text not null,
  reason text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  updated_answer_count integer not null default 0
);
create index participant_email_changes_participant_idx on public.participant_email_changes(participant_id,changed_at desc);
create index participant_email_changes_org_idx on public.participant_email_changes(organization_id);
alter table public.participant_email_changes enable row level security;
revoke all on public.participant_email_changes from public,anon,authenticated;
grant select on public.participant_email_changes to authenticated;
create policy participant_email_changes_admin_read on public.participant_email_changes
  for select to authenticated using (private.is_org_admin(organization_id));

create or replace function private.correct_participant_email(
  p_participant_id uuid, p_expected_email text, p_new_email text, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_org uuid;
  v_app uuid;
  v_applicant uuid;
  v_old text;
  v_new text := lower(btrim(coalesce(p_new_email,'')));
  v_reason text := btrim(coalesce(p_reason,''));
  v_count integer;
begin
  if v_actor is null or not private.has_active_user_session() then
    raise exception 'Your session has expired. Please sign in again.' using errcode='42501';
  end if;
  select p.organization_id,p.application_id,p.applicant_id into v_org,v_app,v_applicant
  from public.participants p join public.applications app on app.id=p.application_id
  join public.applicants a on a.id=p.applicant_id and a.application_id=p.application_id
  where p.id=p_participant_id and app.organization_id=p.organization_id;
  if v_org is null or not private.is_org_admin(v_org) then
    raise exception 'Only an Owner or Admin in this organisation can correct participant emails.' using errcode='42501';
  end if;
  if length(v_new)>254 or length(split_part(v_new,'@',1))>64
     or v_new !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$'
     or split_part(v_new,'@',1) like '.%' or split_part(v_new,'@',1) like '%.' or v_new like '%..%' then
    raise exception 'Enter a valid email address.' using errcode='22023';
  end if;
  if length(v_reason)<3 or length(v_reason)>500 then
    raise exception 'Add a correction reason between 3 and 500 characters.' using errcode='22023';
  end if;
  -- Serialize corrections within a programme, including collision checks.
  perform 1 from public.applications where id=v_app for update;
  select email into v_old from public.applicants where id=v_applicant for update;
  if lower(btrim(coalesce(v_old,''))) is distinct from lower(btrim(coalesce(p_expected_email,''))) then
    raise exception 'This email changed since you opened the profile. Refresh and try again.' using errcode='40001';
  end if;
  if lower(btrim(coalesce(v_old,'')))=v_new then
    raise exception 'Enter a different email address.' using errcode='22023';
  end if;
  if exists(select 1 from public.applicants where application_id=v_app and id<>v_applicant and lower(btrim(email))=v_new) then
    raise exception 'This email is already used by another applicant in this programme. Check the participant before saving.' using errcode='23505';
  end if;
  update public.applicants set email=v_new,updated_at=now() where id=v_applicant;
  -- Do not replace references, alternate contacts or unrelated text answers.
  update public.answers ans set value=to_jsonb(v_new)
  from public.submissions s,public.questions q
  where ans.submission_id=s.id and ans.question_id=q.id
    and s.applicant_id=v_applicant and s.application_id=v_app
    and q.form_version_id=s.form_version_id
    and (q.type='email' or lower(btrim(q.label)) ~ '^e[ -]?mail([ ]+address)?$')
    and jsonb_typeof(ans.value)='string'
    and lower(btrim(ans.value #>> '{}'))=lower(btrim(coalesce(v_old,'')));
  get diagnostics v_count=row_count;
  -- An open assignment token issued using the former email must be re-opened.
  delete from public.assignment_upload_sessions u using public.participants p
    where u.participant_id=p.id and p.applicant_id=v_applicant and u.used_at is null;
  insert into public.participant_email_changes
    (organization_id,application_id,applicant_id,participant_id,old_email,new_email,reason,changed_by,updated_answer_count)
  values(v_org,v_app,v_applicant,p_participant_id,v_old,v_new,v_reason,v_actor,v_count);
  return jsonb_build_object('participant_id',p_participant_id,'applicant_id',v_applicant,'email',v_new,'updated_answer_count',v_count);
end;
$$;
revoke all on function private.correct_participant_email(uuid,text,text,text) from public,anon,authenticated;
grant execute on function private.correct_participant_email(uuid,text,text,text) to authenticated;

create or replace function public.correct_participant_email(
  p_participant_id uuid,p_expected_email text,p_new_email text,p_reason text
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.correct_participant_email(p_participant_id,p_expected_email,p_new_email,p_reason);
$$;
revoke all on function public.correct_participant_email(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.correct_participant_email(uuid,text,text,text) to authenticated;
