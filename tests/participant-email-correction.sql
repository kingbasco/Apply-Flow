-- Integration regression: synthetic records only; every change rolls back.
-- Run as the database owner in a test-capable PostgreSQL connection.
begin;
do $$
declare
  u uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid();
  app uuid:=gen_random_uuid(); applicant uuid:=gen_random_uuid(); participant uuid:=gen_random_uuid();
  version uuid:=gen_random_uuid(); sub uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); q2 uuid:=gen_random_uuid(); q3 uuid:=gen_random_uuid();
  assignment uuid:=gen_random_uuid(); code text; result jsonb; claims jsonb; n integer;
begin
  insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values(u,'email-correction-test-'||u||'@example.invalid','{}','{}');
  insert into public.organizations(id,name,slug,created_by) values(org,'Email correction test','email-test-'||org,u),(other_org,'Other test org','email-test-'||other_org,u);
  insert into public.profiles(id,organization_id,role) values(u,org,'owner') on conflict(id) do update set organization_id=org,role='owner';
  insert into auth.sessions(id,user_id) values(sid,u);
  claims:=jsonb_build_object('sub',u,'role','authenticated','session_id',sid,'is_anonymous',false);
  perform set_config('request.jwt.claims',claims::text,true);
  insert into public.applications(id,organization_id,created_by,name) values(app,org,u,'Email correction test');
  insert into public.form_versions(id,application_id,version_number,created_by) values(version,app,1,u);
  insert into public.questions(id,form_version_id,type,label,position) values(q,version,'email','Email',0),(q2,version,'short_text','Email',1),(q3,version,'short_text','Referee contact',2);
  insert into public.applicants(id,application_id,email,full_name) values(applicant,app,'person@gnail.com','Synthetic participant');
  select participant_id into code from public.applicants where id=applicant;
  insert into public.submissions(id,application_id,form_version_id,applicant_id,status) values(sub,app,version,applicant,'submitted');
  insert into public.answers(submission_id,question_id,value) values(sub,q,'"person@gnail.com"'),(sub,q2,'"person@gnail.com"'),(sub,q3,'"person@gnail.com"');
  insert into public.participants(id,organization_id,application_id,submission_id,applicant_id,participant_id) values(participant,org,app,sub,applicant,code);
  insert into public.assignments(id,organization_id,application_id,created_by,title,public_slug,status) values(assignment,org,app,u,'Test assignment','email-test-'||assignment,'published');
  insert into public.assignment_upload_sessions(assignment_id,participant_id,token) values(assignment,participant,'email-test-token-'||participant);

  begin
    perform public.correct_participant_email(participant,'person@gnail.com','bad@@gmail.com','Typo');
    raise exception 'TEST FAILED: malformed email accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.correct_participant_email(participant,'stale@gnail.com','person@gmail.com','Typo');
    raise exception 'TEST FAILED: stale update accepted';
  exception when serialization_failure then null; end;
  insert into public.applicants(application_id,email,full_name) values(app,'taken@gmail.com','Collision test');
  begin
    perform public.correct_participant_email(participant,'person@gnail.com','TAKEN@gmail.com','Typo');
    raise exception 'TEST FAILED: duplicate accepted';
  exception when unique_violation then null; end;

  -- Role/organisation checks use the same trusted profiles as production.
  perform set_config('request.jwt.claims','{}',true);
  update public.profiles set role='reviewer' where id=u;
  perform set_config('request.jwt.claims',claims::text,true);
  begin
    perform public.correct_participant_email(participant,'person@gnail.com','person@gmail.com','Typo');
    raise exception 'TEST FAILED: staff correction accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{}',true);
  update public.profiles set role='owner',organization_id=other_org where id=u;
  perform set_config('request.jwt.claims',claims::text,true);
  begin
    perform public.correct_participant_email(participant,'person@gnail.com','person@gmail.com','Typo');
    raise exception 'TEST FAILED: cross-organisation correction accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{}',true);
  update public.profiles set role='admin',organization_id=org where id=u;
  perform set_config('request.jwt.claims',claims::text,true);

  result:=public.correct_participant_email(participant,'person@gnail.com',' Person@Gmail.com ','Participant confirmed typo');
  if result->>'email'<>'person@gmail.com' or (result->>'updated_answer_count')::int<>2 then raise exception 'TEST FAILED: canonical/answer update'; end if;
  if (select email from public.applicants where id=applicant)<>'person@gmail.com' then raise exception 'TEST FAILED: canonical email'; end if;
  if (select value #>> '{}' from public.answers where submission_id=sub and question_id=q3)<>'person@gnail.com' then raise exception 'TEST FAILED: unrelated answer changed'; end if;
  if (select participant_id from public.participants where id=participant)<>code then raise exception 'TEST FAILED: ID changed'; end if;
  if exists(select 1 from public.assignment_upload_sessions where participant_id=participant) then raise exception 'TEST FAILED: old portal token retained'; end if;
  select count(*) into n from public.participant_email_changes where participant_id=participant and changed_by=u and old_email='person@gnail.com' and new_email='person@gmail.com';
  if n<>1 then raise exception 'TEST FAILED: audit record'; end if;
  result:=public.open_assignment_for_participant('email-test-'||assignment,code,'person@gnail.com');
  if not (result ? 'error') then raise exception 'TEST FAILED: old email still opens assignment'; end if;
  result:=public.open_assignment_for_participant('email-test-'||assignment,code,'person@gmail.com');
  if result ? 'error' or result->>'upload_token' is null then raise exception 'TEST FAILED: corrected email cannot open assignment: %',result; end if;
  if has_function_privilege('anon','public.correct_participant_email(uuid,text,text,text)','EXECUTE') then raise exception 'TEST FAILED: anonymous RPC grant'; end if;
  if has_table_privilege('authenticated','public.participant_email_changes','INSERT') then raise exception 'TEST FAILED: client can forge audit'; end if;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.correct_participant_email(participant,'person@gmail.com','another@gmail.com','Typo');
    raise exception 'TEST FAILED: no-session correction accepted';
  exception when insufficient_privilege then null; end;
end;
$$;
select 'PASS: validation, stale edits, collisions, staff/cross-org/session denial, canonical and form sync, stable ID, token revocation, audit, old/new portal access' as verification;
rollback;
