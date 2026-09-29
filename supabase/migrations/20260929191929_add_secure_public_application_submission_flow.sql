-- Secure public application submission flow: tokenized uploads, rate limits,
-- server-side payload validation and atomic submission-limit enforcement.

create table private.public_rate_limits (
  key_hash text primary key,
  window_started timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);
revoke all on table private.public_rate_limits from public, anon, authenticated;

create or replace function private.record_public_attempt(
  p_scope text,p_identifier text,p_limit integer,p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_ip text := 'unknown';
  v_key text;
  v_attempts integer;
  v_window interval := make_interval(secs => greatest(1,p_window_seconds));
begin
  begin
    v_headers := coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_ip := trim(split_part(coalesce(nullif(v_headers->>'x-forwarded-for',''),nullif(v_headers->>'x-real-ip',''),'unknown'),',',1));
  if v_ip='' then v_ip:='unknown'; end if;
  v_key:=encode(extensions.digest(v_ip||'|'||coalesce(p_scope,'')||'|'||coalesce(p_identifier,''),'sha256'),'hex');
  insert into private.public_rate_limits(key_hash,window_started,attempts,updated_at)
  values(v_key,now(),1,now())
  on conflict(key_hash) do update set
    attempts=case when private.public_rate_limits.window_started<=now()-v_window then 1 else private.public_rate_limits.attempts+1 end,
    window_started=case when private.public_rate_limits.window_started<=now()-v_window then now() else private.public_rate_limits.window_started end,
    updated_at=now()
  returning attempts into v_attempts;
  return v_attempts<=greatest(1,p_limit);
end;
$$;
revoke all on function private.record_public_attempt(text,text,integer,integer) from public,anon,authenticated;

create table private.public_application_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  form_version_id uuid not null references public.form_versions(id) on delete cascade,
  email_hash text not null,
  token text not null unique default encode(extensions.gen_random_bytes(24),'hex'),
  expires_at timestamptz not null default (now()+interval '20 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index public_application_upload_sessions_lookup_idx
  on private.public_application_upload_sessions(application_id,token,expires_at);
revoke all on table private.public_application_upload_sessions from public,anon,authenticated;

create or replace function private.answer_is_missing(p_value jsonb)
returns boolean
language sql immutable
set search_path=''
as $$
select p_value is null
    or p_value='null'::jsonb
    or (jsonb_typeof(p_value)='string' and btrim(coalesce(p_value#>>'{}',''))='')
    or (jsonb_typeof(p_value)='array' and jsonb_array_length(p_value)=0);
$$;
revoke all on function private.answer_is_missing(jsonb) from public,anon,authenticated;

create or replace function public.begin_public_application_submission(
  p_application_id uuid,p_form_version_id uuid,p_email text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_email text:=nullif(lower(trim(coalesce(p_email,''))),'');
  v_app public.applications;
  v_settings public.application_settings;
  v_token text; v_expires timestamptz;
  v_identifier text:=p_application_id::text||'|'||coalesce(v_email,'no-email');
begin
  if not private.record_public_attempt('application_prepare_global',null,30,600)
     or not private.record_public_attempt('application_prepare_identity',v_identifier,5,600) then
    return jsonb_build_object('error','Too many attempts. Please wait a few minutes and try again.');
  end if;
  begin
    if length(coalesce(p_email,''))>320 or (v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
      raise exception 'Enter a valid email address.';
    end if;
    select * into v_app from public.applications where id=p_application_id and status='published';
    if v_app.id is null then raise exception 'Application is not available.'; end if;
    select * into v_settings from public.application_settings where application_id=p_application_id;
    if v_settings.application_id is null then raise exception 'Application is not available.'; end if;
    if v_settings.start_date is not null and current_date<v_settings.start_date then raise exception 'Applications are not open yet.'; end if;
    if v_app.deadline is not null and current_date>v_app.deadline then raise exception 'Applications for this programme are now closed.'; end if;
    if not exists(select 1 from public.form_versions where id=p_form_version_id and application_id=p_application_id and status='published') then
      raise exception 'Published form version is invalid.';
    end if;
    if v_email is not null and exists(
      select 1 from public.applicants a join public.submissions s on s.applicant_id=a.id
      where a.application_id=p_application_id and lower(trim(coalesce(a.email,'')))=v_email and s.status='submitted'
    ) then raise exception 'An application has already been submitted with this email address.'; end if;
    delete from private.public_application_upload_sessions
    where application_id=p_application_id and form_version_id=p_form_version_id
      and email_hash=encode(extensions.digest(coalesce(v_email,''),'sha256'),'hex') and used_at is null;
    insert into private.public_application_upload_sessions(application_id,form_version_id,email_hash)
    values(p_application_id,p_form_version_id,encode(extensions.digest(coalesce(v_email,''),'sha256'),'hex'))
    returning token,expires_at into v_token,v_expires;
    return jsonb_build_object('upload_token',v_token,'expires_at',v_expires);
  exception when raise_exception then
    return jsonb_build_object('error',sqlerrm);
  when others then
    return jsonb_build_object('error','Could not start this application. Please try again.');
  end;
end;
$$;
revoke all on function public.begin_public_application_submission(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.begin_public_application_submission(uuid,uuid,text) to anon,authenticated,service_role;

create or replace function public.is_valid_application_upload_path(p_name text,p_mime text)
returns boolean
language sql stable security definer
set search_path=''
as $$
select exists(
  select 1
  from private.public_application_upload_sessions us
  join public.applications a on a.id=us.application_id
  join public.form_versions fv on fv.id=us.form_version_id
  join public.questions q on q.form_version_id=fv.id
  where (storage.foldername(p_name))[1]='public-submissions'
    and a.id::text=(storage.foldername(p_name))[2]
    and us.token=(storage.foldername(p_name))[3]
    and us.used_at is null and us.expires_at>now()
    and a.status='published' and fv.status='published'
    and (a.deadline is null or a.deadline>=current_date)
    and q.type in ('file','image')
    and storage.filename(p_name) like q.id::text||'-%'
    and lower(coalesce(p_mime,'')) in ('image/png','image/jpeg','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    and (q.type<>'image' or lower(coalesce(p_mime,'')) in ('image/png','image/jpeg','image/webp'))
    and not exists(
      select 1 from storage.objects o
      where o.bucket_id='application-files'
        and (storage.foldername(o.name))[1]='public-submissions'
        and (storage.foldername(o.name))[2]=a.id::text
        and (storage.foldername(o.name))[3]=us.token
        and storage.filename(o.name) like q.id::text||'-%'
    )
);
$$;
revoke all on function public.is_valid_application_upload_path(text,text) from public;
grant execute on function public.is_valid_application_upload_path(text,text) to anon,authenticated,service_role;

create policy "applicant token upload application files v2"
on storage.objects for insert to anon,authenticated
with check(
  bucket_id='application-files'
  and public.is_valid_application_upload_path(name,metadata->>'mimetype')
);

create or replace function private.submit_application_secure(
  p_application_id uuid,p_form_version_id uuid,p_email text,p_full_name text,p_answers jsonb,p_upload_token text
)
returns jsonb
language plpgsql security definer
set search_path=''
as $$
declare
  v_app public.applications; v_settings public.application_settings; v_version public.form_versions;
  v_session private.public_application_upload_sessions;
  v_answers jsonb:=coalesce(p_answers,'[]'::jsonb);
  v_email text:=nullif(lower(trim(coalesce(p_email,''))),'');
  v_applicant_id uuid; v_submission_id uuid; v_participant_id text;
  v_q record; v_answer jsonb; v_rule jsonb; v_control jsonb; v_control_text text;
  v_visible boolean; v_missing boolean; v_text text; v_num numeric; v_date date;
  v_path text; v_obj_metadata jsonb; v_count integer; v_distinct_count integer;
  v_primary_email_question uuid; v_primary_email_value jsonb;
begin
  if length(trim(coalesce(p_full_name,'')))>200 then raise exception 'Full name is too long.'; end if;
  if length(coalesce(p_email,''))>320 or (v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
    raise exception 'Enter a valid email address.';
  end if;
  if jsonb_typeof(v_answers)<>'array' then raise exception 'Invalid application payload.'; end if;
  if jsonb_array_length(v_answers)>200 or pg_column_size(v_answers)>1048576 then raise exception 'Application payload is too large.'; end if;
  if exists(select 1 from jsonb_array_elements(v_answers) x where jsonb_typeof(x)<>'object' or coalesce(x->>'question_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'Invalid question reference.';
  end if;
  select count(*),count(distinct x->>'question_id') into v_count,v_distinct_count from jsonb_array_elements(v_answers)x;
  if v_count<>v_distinct_count then raise exception 'Duplicate answers are not allowed.'; end if;

  select * into v_app from public.applications where id=p_application_id and status='published' for update;
  if v_app.id is null then raise exception 'Application is not available.'; end if;
  select * into v_settings from public.application_settings where application_id=p_application_id;
  if v_settings.application_id is null then raise exception 'Application is not available.'; end if;
  if v_settings.start_date is not null and current_date<v_settings.start_date then raise exception 'Applications are not open yet.'; end if;
  if v_app.deadline is not null and current_date>v_app.deadline then raise exception 'Applications for this programme are now closed.'; end if;
  if v_settings.submission_limit is not null then
    select count(*) into v_count from public.submissions where application_id=p_application_id and status='submitted';
    if v_count>=v_settings.submission_limit then raise exception 'This application has reached its submission limit.'; end if;
  end if;
  select * into v_version from public.form_versions where id=p_form_version_id and application_id=p_application_id and status='published';
  if v_version.id is null then raise exception 'Published form version is invalid.'; end if;
  select * into v_session from private.public_application_upload_sessions
  where token=p_upload_token and application_id=p_application_id and form_version_id=p_form_version_id
    and email_hash=encode(extensions.digest(coalesce(v_email,''),'sha256'),'hex')
    and used_at is null and expires_at>now() for update;
  if v_session.id is null then raise exception 'Your application session expired. Please try again.'; end if;

  if exists(select 1 from jsonb_array_elements(v_answers)x where not exists(
    select 1 from public.questions q where q.id=(x->>'question_id')::uuid and q.form_version_id=p_form_version_id
  )) then raise exception 'One or more answers do not belong to this form.'; end if;

  for v_q in select q.id,q.type,q.required,q.conditional_rules from public.questions q where q.form_version_id=p_form_version_id order by q.position loop
    v_answer:=null;
    select x->'value' into v_answer from jsonb_array_elements(v_answers)x where x->>'question_id'=v_q.id::text limit 1;
    v_visible:=true;
    if jsonb_typeof(v_q.conditional_rules)='array' and jsonb_array_length(v_q.conditional_rules)>0 then
      v_rule:=v_q.conditional_rules->0; v_control:=null;
      select x->'value' into v_control from jsonb_array_elements(v_answers)x where x->>'question_id'=v_rule->>'question_id' limit 1;
      v_control_text:=coalesce(v_control#>>'{}','');
      if coalesce(v_rule->>'operator','equals')='not_equals' then v_visible:=v_control_text<>coalesce(v_rule->>'value','');
      else v_visible:=v_control_text=coalesce(v_rule->>'value',''); end if;
    end if;
    v_missing:=private.answer_is_missing(v_answer);
    if not v_visible then
      if not v_missing then raise exception 'One or more answers do not match the form conditions.'; end if;
      continue;
    end if;
    if v_q.required and v_missing then raise exception 'Please complete all required questions.'; end if;
    if v_missing then continue; end if;

    if v_q.type in ('short_text','long_text','phone','nigeria_state','nigeria_lga') then
      if jsonb_typeof(v_answer)<>'string' then raise exception 'Invalid text answer.'; end if;
      v_text:=v_answer#>>'{}';
      if (v_q.type='short_text' and length(v_text)>2000) or (v_q.type='long_text' and length(v_text)>50000)
        or (v_q.type='phone' and length(v_text)>80) or (v_q.type in ('nigeria_state','nigeria_lga') and length(v_text)>120)
      then raise exception 'One or more answers are too long.'; end if;
    elsif v_q.type='email' then
      if jsonb_typeof(v_answer)<>'string' then raise exception 'Invalid email answer.'; end if;
      v_text:=lower(trim(v_answer#>>'{}'));
      if length(v_text)>320 or v_text !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;
    elsif v_q.type='number' then
      if jsonb_typeof(v_answer) not in ('string','number') then raise exception 'Invalid number answer.'; end if;
      begin v_num:=(v_answer#>>'{}')::numeric; exception when others then raise exception 'Invalid number answer.'; end;
    elsif v_q.type='date' then
      if jsonb_typeof(v_answer)<>'string' then raise exception 'Invalid date answer.'; end if;
      begin v_date:=(v_answer#>>'{}')::date; exception when others then raise exception 'Invalid date answer.'; end;
    elsif v_q.type in ('dropdown','single_choice','yes_no') then
      if jsonb_typeof(v_answer)<>'string' or not exists(select 1 from public.question_options qo where qo.question_id=v_q.id and qo.value=v_answer#>>'{}') then raise exception 'Invalid choice answer.'; end if;
    elsif v_q.type='multiple_choice' then
      if jsonb_typeof(v_answer)<>'array' or jsonb_array_length(v_answer)>100 then raise exception 'Invalid multiple-choice answer.'; end if;
      if exists(select 1 from jsonb_array_elements(v_answer)e where jsonb_typeof(e)<>'string') then raise exception 'Invalid multiple-choice answer.'; end if;
      if exists(select 1 from jsonb_array_elements_text(v_answer)av where not exists(select 1 from public.question_options qo where qo.question_id=v_q.id and qo.value=av)) then raise exception 'Invalid multiple-choice answer.'; end if;
    elsif v_q.type='rating' then
      if jsonb_typeof(v_answer) not in ('string','number') then raise exception 'Invalid rating answer.'; end if;
      begin v_num:=(v_answer#>>'{}')::numeric; exception when others then raise exception 'Invalid rating answer.'; end;
      if v_num not in (1,2,3,4,5) then raise exception 'Invalid rating answer.'; end if;
    elsif v_q.type in ('file','image') then
      if jsonb_typeof(v_answer)<>'object' then raise exception 'Invalid file answer.'; end if;
      v_path:=coalesce(v_answer->>'path','');
      if v_path not like 'public-submissions/'||p_application_id::text||'/'||p_upload_token||'/%' or storage.filename(v_path) not like v_q.id::text||'-%' then raise exception 'Invalid application file path.'; end if;
      if length(coalesce(v_answer->>'name',''))>255 then raise exception 'File name is too long.'; end if;
      select o.metadata into v_obj_metadata from storage.objects o where o.bucket_id='application-files' and o.name=v_path limit 1;
      if v_obj_metadata is null then raise exception 'One or more uploaded files could not be verified.'; end if;
      if coalesce((v_obj_metadata->>'size')::bigint,0)>15728640 then raise exception 'One or more uploaded files are too large.'; end if;
      v_text:=lower(coalesce(v_obj_metadata->>'mimetype',''));
      if v_text not in ('image/png','image/jpeg','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document') then raise exception 'One or more uploaded files have an invalid file type.'; end if;
      if v_q.type='image' and v_text not in ('image/png','image/jpeg','image/webp') then raise exception 'Image questions only accept JPG, PNG, or WebP files.'; end if;
    end if;
  end loop;

  select q.id into v_primary_email_question from public.questions q where q.form_version_id=p_form_version_id and q.type='email' order by q.position limit 1;
  if v_primary_email_question is not null then
    select x->'value' into v_primary_email_value from jsonb_array_elements(v_answers)x where x->>'question_id'=v_primary_email_question::text limit 1;
    if not private.answer_is_missing(v_primary_email_value) and lower(trim(v_primary_email_value#>>'{}'))<>coalesce(v_email,'') then
      raise exception 'Application email does not match the email answer.';
    end if;
  end if;

  if v_email is not null then
    select count(*) into v_count from public.submission_attempts where application_id=p_application_id and email=v_email and created_at>now()-interval '10 minutes';
    if v_count>=3 then raise exception 'Too many submission attempts. Please try again later.'; end if;
    if exists(select 1 from public.applicants a join public.submissions s on s.applicant_id=a.id
      where a.application_id=p_application_id and lower(trim(coalesce(a.email,'')))=v_email and s.status='submitted')
    then raise exception 'An application has already been submitted with this email address.'; end if;
  end if;

  insert into public.submission_attempts(application_id,email) values(p_application_id,v_email);
  insert into public.applicants(application_id,email,full_name)
  values(p_application_id,v_email,nullif(trim(p_full_name),''))
  returning id,participant_id into v_applicant_id,v_participant_id;
  insert into public.submissions(application_id,form_version_id,applicant_id,status,submitted_at)
  values(p_application_id,p_form_version_id,v_applicant_id,'submitted',now())
  returning id into v_submission_id;
  insert into public.answers(submission_id,question_id,value)
  select v_submission_id,(x->>'question_id')::uuid,x->'value' from jsonb_array_elements(v_answers)x;
  insert into public.uploaded_documents(organization_id,submission_id,question_id,answer_id,storage_bucket,storage_path,original_name,mime_type,file_size,status,extraction_status)
  select v_app.organization_id,v_submission_id,(x->>'question_id')::uuid,ans.id,'application-files',
         x->'value'->>'path',x->'value'->>'name',o.metadata->>'mimetype',(o.metadata->>'size')::bigint,'pending','pending'
  from jsonb_array_elements(v_answers)x
  join public.questions q on q.id=(x->>'question_id')::uuid and q.form_version_id=p_form_version_id and q.type in ('file','image')
  join public.answers ans on ans.submission_id=v_submission_id and ans.question_id=q.id
  join storage.objects o on o.bucket_id='application-files' and o.name=x->'value'->>'path';
  update private.public_application_upload_sessions set used_at=now() where id=v_session.id;
  perform private.evaluate_submission_eligibility(v_submission_id);
  return jsonb_build_object('participant_id',v_participant_id,'submission_id',v_submission_id);
end;
$$;
revoke all on function private.submit_application_secure(uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;

create or replace function public.submit_application_with_participant_id_v2(
  p_application_id uuid,p_form_version_id uuid,p_email text,p_full_name text,p_answers jsonb,p_upload_token text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_identifier text:=p_application_id::text||'|'||v_email;
begin
  if not private.record_public_attempt('application_submit_global',null,40,600)
     or not private.record_public_attempt('application_submit_identity',v_identifier,6,600) then
    return jsonb_build_object('error','Too many attempts. Please wait a few minutes and try again.');
  end if;
  begin
    return private.submit_application_secure(p_application_id,p_form_version_id,p_email,p_full_name,p_answers,p_upload_token);
  exception when raise_exception then
    return jsonb_build_object('error',sqlerrm);
  when others then
    return jsonb_build_object('error','Could not submit application. Please try again.');
  end;
end;
$$;
revoke all on function public.submit_application_with_participant_id_v2(uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_application_with_participant_id_v2(uuid,uuid,text,text,jsonb,text) to anon,authenticated,service_role;
