-- Prevent eligibility evaluation from running before answers exist.
drop trigger if exists submissions_evaluate_eligibility on public.submissions;

create or replace function private.submit_application(
  p_application_id uuid,
  p_form_version_id uuid,
  p_email text,
  p_full_name text,
  p_answers jsonb
)
returns uuid
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $function$
declare
  v_app public.applications%rowtype;
  v_settings public.application_settings%rowtype;
  v_version public.form_versions%rowtype;
  v_applicant_id uuid;
  v_submission_id uuid;
  v_email text := nullif(lower(trim(p_email)), '');
  v_q record;
  v_answer jsonb;
  v_count integer;
begin
  select * into v_app from public.applications where id=p_application_id and status='published';
  if not found then raise exception 'Application is not available.'; end if;
  select * into v_settings from public.application_settings where application_id=p_application_id;
  if v_settings.start_date is not null and current_date < v_settings.start_date then raise exception 'Applications are not open yet.'; end if;
  if v_app.deadline is not null and current_date > v_app.deadline then raise exception 'Applications for this programme are now closed.'; end if;
  if v_settings.submission_limit is not null then
    select count(*) into v_count from public.submissions where application_id=p_application_id and status='submitted';
    if v_count >= v_settings.submission_limit then raise exception 'This application has reached its submission limit.'; end if;
  end if;
  select * into v_version from public.form_versions where id=p_form_version_id and application_id=p_application_id and status='published';
  if not found then raise exception 'Published form version is invalid.'; end if;
  if v_email is not null then
    select count(*) into v_count from public.submission_attempts where application_id=p_application_id and email=v_email and created_at>now()-interval '10 minutes';
    if v_count>=3 then raise exception 'Too many submission attempts. Please try again later.'; end if;
    if exists(select 1 from public.applicants a join public.submissions s on s.applicant_id=a.id where a.application_id=p_application_id and lower(trim(a.email))=v_email and s.status='submitted') then
      raise exception 'An application has already been submitted with this email address.';
    end if;
  end if;
  for v_q in select q.id,q.required,q.conditional_rules from public.questions q where q.form_version_id=p_form_version_id loop
    if v_q.required then
      select x->'value' into v_answer from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) x where x->>'question_id'=v_q.id::text limit 1;
      if (v_answer is null or v_answer='null'::jsonb or v_answer='""'::jsonb or v_answer='[]'::jsonb) then
        if not exists(select 1 from jsonb_array_elements(coalesce(v_q.conditional_rules,'[]'::jsonb)) r where coalesce((select x2->>'value' from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) x2 where x2->>'question_id'=(r->>'question_id') limit 1),'')=coalesce(r->>'value','')) then
          raise exception 'Please complete all required questions.';
        end if;
      end if;
    end if;
  end loop;
  insert into public.submission_attempts(application_id,email) values(p_application_id,v_email);
  insert into public.applicants(application_id,email,full_name) values(p_application_id,v_email,nullif(trim(p_full_name),'')) returning id into v_applicant_id;
  insert into public.submissions(application_id,form_version_id,applicant_id,status,submitted_at) values(p_application_id,p_form_version_id,v_applicant_id,'submitted',now()) returning id into v_submission_id;
  insert into public.answers(submission_id,question_id,value)
  select v_submission_id,(x->>'question_id')::uuid,x->'value' from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) x
  where exists(select 1 from public.questions q where q.id=(x->>'question_id')::uuid and q.form_version_id=p_form_version_id);
  insert into public.uploaded_documents(organization_id,submission_id,question_id,answer_id,storage_bucket,storage_path,original_name,mime_type,file_size,status,extraction_status)
  select v_app.organization_id,v_submission_id,(x->>'question_id')::uuid,ans.id,'application-files',x->'value'->>'path',x->'value'->>'name',x->'value'->>'type',(x->'value'->>'size')::bigint,'pending','pending'
  from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) x
  join public.questions q on q.id=(x->>'question_id')::uuid and q.form_version_id=p_form_version_id
  join public.answers ans on ans.submission_id=v_submission_id and ans.question_id=q.id
  where q.type in ('file','image') and coalesce(x->'value'->>'path','') like 'public-submissions/'||p_application_id::text||'/%';
  perform private.evaluate_submission_eligibility(v_submission_id);
  return v_submission_id;
end;
$function$;

revoke execute on function public.submit_application_with_id(uuid,uuid,text,text,jsonb) from public;
grant execute on function public.submit_application_with_id(uuid,uuid,text,text,jsonb) to anon, authenticated;