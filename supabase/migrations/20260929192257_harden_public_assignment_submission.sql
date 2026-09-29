-- Validate and rate-limit anonymous assignment submission server-side.

CREATE OR REPLACE FUNCTION public.submit_public_assignment(p_slug text, p_participant_code text, p_upload_token text, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_assignment public.assignments;
  v_participant public.participants;
  v_submission_id uuid;
  v_question public.assignment_questions;
  v_answer jsonb;
  v_session public.assignment_upload_sessions;
  v_identity text:=lower(trim(coalesce(p_slug,'')))||'|'||upper(trim(coalesce(p_participant_code,'')));
  v_count integer;
  v_text text;
  v_num numeric;
  v_path text;
  v_obj_metadata jsonb;
begin
  if not private.record_public_attempt('assignment_submit_global',null,250,600)
     or not private.record_public_attempt('assignment_submit_identity',v_identity,12,600) then
    return jsonb_build_object('error','Too many attempts. Please wait a few minutes and try again.');
  end if;

  begin
    if jsonb_typeof(coalesce(p_answers,'null'::jsonb))<>'object' then
      raise exception 'Invalid assignment payload.';
    end if;
    if pg_column_size(p_answers)>1048576 then
      raise exception 'Assignment payload is too large.';
    end if;
    select count(*) into v_count from jsonb_object_keys(p_answers);
    if v_count>200 then raise exception 'Assignment payload is too large.'; end if;

    select * into v_assignment
    from public.assignments
    where public_slug=p_slug and status='published';

    if v_assignment.id is null then raise exception 'Assignment is not available.'; end if;
    if v_assignment.deadline is not null and now()>v_assignment.deadline then
      raise exception 'This assignment deadline has passed.';
    end if;

    select * into v_participant
    from public.participants
    where application_id=v_assignment.application_id
      and upper(participant_id)=upper(trim(p_participant_code))
      and status='active';

    if v_participant.id is null then
      raise exception 'Participant ID is not valid for this programme.';
    end if;

    select * into v_session
    from public.assignment_upload_sessions
    where assignment_id=v_assignment.id
      and participant_id=v_participant.id
      and token=p_upload_token
      and used_at is null
      and expires_at>now()
    for update;

    if v_session.id is null then
      raise exception 'Your assignment session expired. Reopen the assignment and try again.';
    end if;

    if exists(
      select 1
      from jsonb_object_keys(p_answers) k
      where not exists(
        select 1 from public.assignment_questions q
        where q.assignment_id=v_assignment.id and q.id::text=k
      )
    ) then
      raise exception 'One or more answers do not belong to this assignment.';
    end if;

    if exists(
      select 1 from public.assignment_submissions s
      where s.assignment_id=v_assignment.id
        and s.participant_id=v_participant.id
    ) then
      raise exception 'This assignment has already been submitted.';
    end if;

    for v_question in
      select *
      from public.assignment_questions
      where assignment_id=v_assignment.id
      order by position
    loop
      v_answer:=p_answers->v_question.id::text;

      if v_question.required and private.answer_is_missing(v_answer) then
        raise exception 'Please answer all required questions.';
      end if;
      if private.answer_is_missing(v_answer) then continue; end if;

      if v_question.type='long_text' then
        if jsonb_typeof(v_answer)<>'string' or length(v_answer#>>'{}')>50000 then
          raise exception 'Invalid text answer.';
        end if;

      elsif v_question.type='number' then
        if jsonb_typeof(v_answer) not in ('string','number') then
          raise exception 'Invalid number answer.';
        end if;
        begin v_num:=(v_answer#>>'{}')::numeric;
        exception when others then raise exception 'Invalid number answer.'; end;

      elsif v_question.type='url' then
        if jsonb_typeof(v_answer)<>'string' then raise exception 'Invalid URL answer.'; end if;
        v_text:=v_answer#>>'{}';
        if length(v_text)>2048 or v_text !~* '^https?://' then
          raise exception 'Invalid URL answer.';
        end if;

      elsif v_question.type='single_choice' then
        if jsonb_typeof(v_answer)<>'string'
           or not exists(
             select 1 from jsonb_array_elements_text(coalesce(v_question.config->'options','[]'::jsonb)) o
             where o=v_answer#>>'{}'
           ) then
          raise exception 'Invalid choice answer.';
        end if;

      elsif v_question.type='multiple_choice' then
        if jsonb_typeof(v_answer)<>'array' or jsonb_array_length(v_answer)>100 then
          raise exception 'Invalid multiple-choice answer.';
        end if;
        if exists(select 1 from jsonb_array_elements(v_answer)e where jsonb_typeof(e)<>'string') then
          raise exception 'Invalid multiple-choice answer.';
        end if;
        if exists(
          select 1 from jsonb_array_elements_text(v_answer) av
          where not exists(
            select 1 from jsonb_array_elements_text(coalesce(v_question.config->'options','[]'::jsonb)) o
            where o=av
          )
        ) then
          raise exception 'Invalid multiple-choice answer.';
        end if;

      elsif v_question.type='file' then
        if jsonb_typeof(v_answer)<>'object' then raise exception 'Invalid file answer.'; end if;
        v_path:=coalesce(v_answer->>'path','');
        if v_path not like 'assignment-submissions/'||v_assignment.id::text||'/'||p_upload_token||'/%'
           or storage.filename(v_path) not like v_question.id::text||'-%' then
          raise exception 'Invalid assignment file path.';
        end if;
        select o.metadata into v_obj_metadata
        from storage.objects o
        where o.bucket_id='application-files' and o.name=v_path
        limit 1;
        if v_obj_metadata is null then
          raise exception 'One or more uploaded files could not be verified.';
        end if;
        if coalesce((v_obj_metadata->>'size')::bigint,0)>15728640 then
          raise exception 'One or more uploaded files are too large.';
        end if;
        v_text:=lower(coalesce(v_obj_metadata->>'mimetype',''));
        if v_text not in (
          'image/png','image/jpeg','image/webp','application/pdf','application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ) then
          raise exception 'One or more uploaded files have an invalid file type.';
        end if;

      else
        if jsonb_typeof(v_answer)<>'string' or length(v_answer#>>'{}')>5000 then
          raise exception 'Invalid answer.';
        end if;
      end if;
    end loop;

    insert into public.assignment_submissions(
      assignment_id,participant_id,organization_id,application_id
    )
    values(
      v_assignment.id,v_participant.id,v_assignment.organization_id,v_assignment.application_id
    )
    returning id into v_submission_id;

    insert into public.assignment_answers(submission_id,question_id,value)
    select v_submission_id,aq.id,coalesce(p_answers->aq.id::text,'null'::jsonb)
    from public.assignment_questions aq
    where aq.assignment_id=v_assignment.id;

    insert into public.assignment_documents(
      organization_id,submission_id,question_id,storage_bucket,storage_path,
      original_name,mime_type,file_size,status
    )
    select
      v_assignment.organization_id,
      v_submission_id,
      aq.id,
      'application-files',
      p_answers->aq.id::text->>'path',
      p_answers->aq.id::text->>'name',
      o.metadata->>'mimetype',
      (o.metadata->>'size')::bigint,
      'uploaded'
    from public.assignment_questions aq
    join storage.objects o
      on o.bucket_id='application-files'
     and o.name=p_answers->aq.id::text->>'path'
    where aq.assignment_id=v_assignment.id
      and aq.type='file'
      and coalesce(p_answers->aq.id::text->>'path','')
          like 'assignment-submissions/'||v_assignment.id::text||'/'||p_upload_token||'/%';

    update public.assignment_upload_sessions
    set used_at=now()
    where id=v_session.id;

    return jsonb_build_object(
      'submission_id',v_submission_id,
      'participant_code',v_participant.participant_id,
      'submitted_at',now(),
      'title',v_assignment.title
    );

  exception when raise_exception then
    return jsonb_build_object('error',sqlerrm);
  when others then
    return jsonb_build_object('error','Could not submit this assignment. Please try again.');
  end;
end;
$function$;
