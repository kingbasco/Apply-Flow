-- Rate-limit anonymous participant assignment/results/attendance portals.

CREATE OR REPLACE FUNCTION public.get_public_assignment_result(p_slug text, p_participant_code text, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_assignment public.assignments; v_participant public.participants; v_applicant public.applicants;
  v_submission public.assignment_submissions; v_rows jsonb;
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_identity text:=lower(trim(coalesce(p_slug,'')))||'|'||upper(trim(coalesce(p_participant_code,'')));
begin
  if not private.record_public_attempt('assignment_result_global',null,250,600)
     or not private.record_public_attempt('assignment_result_identity',v_identity,10,600) then
    return jsonb_build_object('error','Too many attempts. Please wait a few minutes and try again.');
  end if;
  begin
    if length(v_email)>320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
      raise exception 'Participant ID or email is not valid for this programme.';
    end if;
    select * into v_assignment from public.assignments where public_slug=p_slug;
    if v_assignment.id is null then raise exception 'Results portal is not available.'; end if;
    if not v_assignment.results_released then raise exception 'Results have not been released yet.'; end if;
    select p.* into v_participant
    from public.participants p join public.applicants a on a.id=p.applicant_id
    where p.application_id=v_assignment.application_id
      and upper(p.participant_id)=upper(trim(p_participant_code))
      and lower(trim(coalesce(a.email,'')))=v_email
    limit 1;
    if v_participant.id is null then raise exception 'Participant ID or email is not valid for this programme.'; end if;
    select * into v_applicant from public.applicants where id=v_participant.applicant_id;
    select * into v_submission from public.assignment_submissions
    where assignment_id=v_assignment.id and participant_id=v_participant.id;
    if v_submission.id is null then raise exception 'No submission was found for this participant.'; end if;
    if v_submission.status<>'graded' or v_submission.score is null then raise exception 'Your result has not been graded yet.'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'rank',x.rnk,
      'participant_id',case when x.participant_record_id=v_participant.id then x.participant_id else regexp_replace(x.participant_id,'.(?=.{4})','*','g') end,
      'display_name',case when x.participant_record_id=v_participant.id then coalesce(v_applicant.full_name,'You') else 'Participant' end,
      'score',x.score,'percentage',x.percentage,'is_you',x.participant_record_id=v_participant.id
    ) order by x.rnk,x.participant_id),'[]'::jsonb)
    into v_rows
    from (
      select dense_rank() over(order by s.score desc,s.submitted_at asc)::bigint rnk,
             p.id participant_record_id,p.participant_id,s.score,
             round((s.score/nullif(v_assignment.max_score,0))*100,2) percentage
      from public.assignment_submissions s join public.participants p on p.id=s.participant_id
      where s.assignment_id=v_assignment.id and s.status='graded' and s.score is not null
    ) x;
    return jsonb_build_object(
      'title',v_assignment.title,'participant_name',coalesce(v_applicant.full_name,'Participant'),
      'participant_code',v_participant.participant_id,'score',v_submission.score,'max_score',v_assignment.max_score,
      'percentage',round((v_submission.score/nullif(v_assignment.max_score,0))*100,2),
      'pass_mark',v_assignment.pass_mark,'passed',v_submission.score>=v_assignment.pass_mark,
      'feedback',v_submission.feedback,'submitted_at',v_submission.submitted_at,'graded_at',v_submission.graded_at,
      'leaderboard',v_rows
    );
  exception when raise_exception then
    return jsonb_build_object('error',sqlerrm);
  when others then
    return jsonb_build_object('error','Could not load this result. Please try again.');
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.open_assignment_for_participant(p_slug text, p_participant_code text, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_assignment public.assignments;
  v_participant public.participants;
  v_applicant public.applicants;
  v_questions jsonb;
  v_token text;
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_identity text:=lower(trim(coalesce(p_slug,'')))||'|'||upper(trim(coalesce(p_participant_code,'')));
begin
  if not private.record_public_attempt('assignment_open_global',null,250,600)
     or not private.record_public_attempt('assignment_open_identity',v_identity,8,600) then
    return jsonb_build_object('error','Too many attempts. Please wait a few minutes and try again.');
  end if;
  begin
    if length(v_email)>320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
      raise exception 'Participant ID or email is not valid for this programme.';
    end if;
    select * into v_assignment from public.assignments where public_slug=p_slug and status='published';
    if v_assignment.id is null then raise exception 'Assignment is not available.'; end if;
    if v_assignment.deadline is not null and now()>v_assignment.deadline then raise exception 'This assignment deadline has passed.'; end if;
    select p.* into v_participant
    from public.participants p join public.applicants a on a.id=p.applicant_id
    where p.application_id=v_assignment.application_id
      and upper(p.participant_id)=upper(trim(p_participant_code))
      and lower(trim(coalesce(a.email,'')))=v_email
      and p.status='active'
    limit 1;
    if v_participant.id is null then raise exception 'Participant ID or email is not valid for this programme.'; end if;
    select * into v_applicant from public.applicants where id=v_participant.applicant_id;
    if exists(select 1 from public.assignment_submissions s where s.assignment_id=v_assignment.id and s.participant_id=v_participant.id) then
      raise exception 'This assignment has already been submitted.';
    end if;
    delete from public.assignment_upload_sessions
    where assignment_id=v_assignment.id and participant_id=v_participant.id and used_at is null;
    v_token:=encode(extensions.gen_random_bytes(24),'hex');
    insert into public.assignment_upload_sessions(assignment_id,participant_id,token)
    values(v_assignment.id,v_participant.id,v_token);
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',q.id,'type',q.type,'label',q.label,'description',q.description,
      'required',q.required,'position',q.position,'config',q.config
    ) order by q.position),'[]'::jsonb)
    into v_questions
    from public.assignment_questions q where q.assignment_id=v_assignment.id;
    return jsonb_build_object(
      'assignment_id',v_assignment.id,'participant_code',v_participant.participant_id,
      'participant_name',coalesce(v_applicant.full_name,'Participant'),'upload_token',v_token,
      'title',v_assignment.title,'description',v_assignment.description,'instructions',v_assignment.instructions,
      'deadline',v_assignment.deadline,'max_score',v_assignment.max_score,'pass_mark',v_assignment.pass_mark,
      'questions',v_questions
    );
  exception when raise_exception then
    return jsonb_build_object('error',sqlerrm);
  when others then
    return jsonb_build_object('error','Could not open this assignment. Please try again.');
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.open_attendance_checkin(p_slug text, p_participant_code text, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session public.attendance_sessions; v_participant public.participants;
  v_applicant public.applicants; v_record public.attendance_records;
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_identity text:=lower(trim(coalesce(p_slug,'')))||'|'||upper(trim(coalesce(p_participant_code,'')));
begin
  if not private.record_public_attempt('attendance_open_global',null,500,600)
     or not private.record_public_attempt('attendance_open_identity',v_identity,8,600) then
    return jsonb_build_object('error','Too many attempts. Please wait a few minutes and try again.');
  end if;
  begin
    if length(v_email)>320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
      raise exception 'Participant ID or email is not valid for this programme.';
    end if;
    select * into v_session from public.attendance_sessions where check_in_slug=p_slug;
    if v_session.id is null then raise exception 'This attendance link is not available.'; end if;
    if not v_session.check_in_open then raise exception 'Attendance check-in is currently closed.'; end if;
    select p.* into v_participant
    from public.participants p join public.applicants a on a.id=p.applicant_id
    where p.application_id=v_session.application_id
      and upper(p.participant_id)=upper(trim(p_participant_code))
      and lower(trim(coalesce(a.email,'')))=v_email
      and p.status='active'
    limit 1;
    if v_participant.id is null then raise exception 'Participant ID or email is not valid for this programme.'; end if;
    select * into v_applicant from public.applicants where id=v_participant.applicant_id;
    select * into v_record from public.attendance_records
    where attendance_session_id=v_session.id and participant_id=v_participant.id;
    return jsonb_build_object(
      'session_id',v_session.id,'title',v_session.title,'session_date',v_session.session_date,
      'participant_name',coalesce(v_applicant.full_name,'Participant'),'participant_code',v_participant.participant_id,
      'already_recorded',v_record.id is not null,'attendance_status',v_record.status,'marked_at',v_record.marked_at
    );
  exception when raise_exception then
    return jsonb_build_object('error',sqlerrm);
  when others then
    return jsonb_build_object('error','Could not open attendance check-in. Please try again.');
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_attendance_checkin(p_slug text, p_participant_code text, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session public.attendance_sessions; v_participant public.participants;
  v_applicant public.applicants; v_record public.attendance_records;
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_identity text:=lower(trim(coalesce(p_slug,'')))||'|'||upper(trim(coalesce(p_participant_code,'')));
begin
  if not private.record_public_attempt('attendance_submit_global',null,500,600)
     or not private.record_public_attempt('attendance_submit_identity',v_identity,8,600) then
    return jsonb_build_object('error','Too many attempts. Please wait a few minutes and try again.');
  end if;
  begin
    if length(v_email)>320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
      raise exception 'Participant ID or email is not valid for this programme.';
    end if;
    select * into v_session from public.attendance_sessions where check_in_slug=p_slug for update;
    if v_session.id is null then raise exception 'This attendance link is not available.'; end if;
    if not v_session.check_in_open then raise exception 'Attendance check-in is currently closed.'; end if;
    select p.* into v_participant
    from public.participants p join public.applicants a on a.id=p.applicant_id
    where p.application_id=v_session.application_id
      and upper(p.participant_id)=upper(trim(p_participant_code))
      and lower(trim(coalesce(a.email,'')))=v_email
      and p.status='active'
    limit 1;
    if v_participant.id is null then raise exception 'Participant ID or email is not valid for this programme.'; end if;
    select * into v_applicant from public.applicants where id=v_participant.applicant_id;
    select * into v_record from public.attendance_records
    where attendance_session_id=v_session.id and participant_id=v_participant.id;
    if v_record.id is not null then
      return jsonb_build_object('title',v_session.title,'session_date',v_session.session_date,
        'participant_name',coalesce(v_applicant.full_name,'Participant'),'participant_code',v_participant.participant_id,
        'already_recorded',true,'status',v_record.status,'marked_at',v_record.marked_at);
    end if;
    insert into public.attendance_records(attendance_session_id,participant_id,status,source,marked_at)
    values(v_session.id,v_participant.id,'present','self_check_in',now()) returning * into v_record;
    return jsonb_build_object('title',v_session.title,'session_date',v_session.session_date,
      'participant_name',coalesce(v_applicant.full_name,'Participant'),'participant_code',v_participant.participant_id,
      'already_recorded',false,'status','present','marked_at',v_record.marked_at);
  exception when raise_exception then
    return jsonb_build_object('error',sqlerrm);
  when others then
    return jsonb_build_object('error','Could not record attendance. Please try again.');
  end;
end;
$function$;
