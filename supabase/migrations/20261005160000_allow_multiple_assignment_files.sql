-- Allow up to 10 uploaded files per assignment file question while preserving
-- the existing upload-session, file-type, size and path protections.

create or replace function public.is_valid_assignment_upload_path(p_name text,p_mime text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
select exists(
  select 1
  from public.assignment_upload_sessions us
  join public.assignments a on a.id=us.assignment_id
  join public.participants p on p.id=us.participant_id
  join public.assignment_questions q on q.assignment_id=a.id and q.type='file'
  where (storage.foldername(p_name))[1]='assignment-submissions'
    and a.id::text=(storage.foldername(p_name))[2]
    and us.token=(storage.foldername(p_name))[3]
    and us.used_at is null
    and us.expires_at>now()
    and a.status='published'
    and (a.deadline is null or a.deadline>=now())
    and p.application_id=a.application_id
    and p.status='active'
    and storage.filename(p_name) like q.id::text||'-%'
    and lower(coalesce(p_mime,'')) in (
      'image/png','image/jpeg','image/webp','application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    and (
      select count(*)
      from storage.objects o
      where o.bucket_id='application-files'
        and (storage.foldername(o.name))[1]='assignment-submissions'
        and (storage.foldername(o.name))[2]=a.id::text
        and (storage.foldername(o.name))[3]=us.token
        and storage.filename(o.name) like q.id::text||'-%'
    ) < 10
);
$$;

revoke all on function public.is_valid_assignment_upload_path(text,text) from public;
grant execute on function public.is_valid_assignment_upload_path(text,text) to anon,authenticated,service_role;

create or replace function public.submit_public_assignment(
  p_slug text,
  p_participant_code text,
  p_upload_token text,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assignment public.assignments;
  v_participant public.participants;
  v_submission_id uuid;
  v_question public.assignment_questions;
  v_answer jsonb;
  v_files jsonb;
  v_file jsonb;
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
        if jsonb_typeof(v_answer)='object' then
          v_files:=jsonb_build_array(v_answer);
        elsif jsonb_typeof(v_answer)='array' then
          v_files:=v_answer;
        else
          raise exception 'Invalid file answer.';
        end if;

        if jsonb_array_length(v_files)=0 or jsonb_array_length(v_files)>10 then
          raise exception 'Upload between 1 and 10 files for each file question.';
        end if;

        if exists(
          select 1 from jsonb_array_elements(v_files) as t(item)
          where jsonb_typeof(item)<>'object'
        ) then
          raise exception 'Invalid file answer.';
        end if;

        select count(distinct item->>'path')
        into v_count
        from jsonb_array_elements(v_files) as t(item);
        if v_count<>jsonb_array_length(v_files) then
          raise exception 'Duplicate assignment files are not allowed.';
        end if;

        for v_file in select value from jsonb_array_elements(v_files)
        loop
          v_path:=coalesce(v_file->>'path','');
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
        end loop;

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
      file_item.value->>'path',
      file_item.value->>'name',
      o.metadata->>'mimetype',
      (o.metadata->>'size')::bigint,
      'uploaded'
    from public.assignment_questions aq
    cross join lateral jsonb_array_elements(
      case jsonb_typeof(p_answers->aq.id::text)
        when 'array' then p_answers->aq.id::text
        when 'object' then jsonb_build_array(p_answers->aq.id::text)
        else '[]'::jsonb
      end
    ) as file_item(value)
    join storage.objects o
      on o.bucket_id='application-files'
     and o.name=file_item.value->>'path'
    where aq.assignment_id=v_assignment.id
      and aq.type='file'
      and coalesce(file_item.value->>'path','')
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

revoke all on function public.submit_public_assignment(text,text,text,jsonb) from public;
grant execute on function public.submit_public_assignment(text,text,text,jsonb) to anon,authenticated;
