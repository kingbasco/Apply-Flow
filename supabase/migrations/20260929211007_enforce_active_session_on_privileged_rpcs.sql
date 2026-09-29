-- Enforce active-session checks on authenticated privileged RPC/helper paths.
-- Generated from the verified production definitions after hardening.

CREATE OR REPLACE FUNCTION private.assign_review_submission(p_submission_id uuid, p_reviewer_id uuid)
 RETURNS review_assignments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org_id uuid;
  v_row public.review_assignments;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select a.organization_id
    into v_org_id
  from public.submissions s
  join public.applications a on a.id = s.application_id
  where s.id = p_submission_id;

  if v_org_id is null then
    raise exception 'Submission not found';
  end if;

  if not private.is_org_admin(v_org_id) then
    raise exception 'Only workspace admins can assign reviews';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_reviewer_id
      and p.organization_id = v_org_id
      and p.role = 'reviewer'
  ) then
    raise exception 'Reviewer must be Programme Staff in this workspace';
  end if;

  insert into public.review_assignments(submission_id, reviewer_id, status)
  values (p_submission_id, p_reviewer_id, 'assigned')
  on conflict(submission_id, reviewer_id)
  do update set status='assigned', updated_at=now()
  returning * into v_row;

  insert into public.review_audit_logs(
    review_assignment_id, action, to_status, actor_id, organization_id, metadata
  )
  values (
    v_row.id, 'assigned', v_row.status, (select auth.uid()), v_org_id,
    jsonb_build_object('reviewer_id', p_reviewer_id)
  );

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION private.can_access_review_assignment(p_review_assignment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select private.has_active_user_session()
    and exists (
      select 1
      from public.review_assignments ra
      join public.submissions s on s.id = ra.submission_id
      join public.applications a on a.id = s.application_id
      join public.profiles p on p.id = (select auth.uid())
        and p.organization_id = a.organization_id
      where ra.id = p_review_assignment_id
        and (p.role in ('owner','admin') or ra.reviewer_id = p.id)
    )
$function$;

CREATE OR REPLACE FUNCTION private.can_access_submission(p_submission_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select private.has_active_user_session()
    and exists (
      select 1
      from public.submissions s
      join public.applications a on a.id = s.application_id
      join public.profiles p on p.id = (select auth.uid())
        and p.organization_id = a.organization_id
      where s.id = p_submission_id
        and (
          p.role in ('owner','admin')
          or (
            p.role = 'reviewer'
            and exists (
              select 1
              from public.review_assignments ra
              where ra.submission_id = s.id
                and ra.reviewer_id = p.id
            )
          )
        )
    )
$function$;

CREATE OR REPLACE FUNCTION private.current_user_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select p.organization_id
  from public.profiles p
  where private.has_active_user_session()
    and p.id=(select auth.uid())
  limit 1
$function$;

CREATE OR REPLACE FUNCTION private.reviewer_set_submission_decision(p_submission_id uuid, p_decision text)
 RETURNS submissions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.submissions;
  v_assignment public.review_assignments;
  v_org_id uuid;
  v_actor uuid := (select auth.uid());
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  select ra.* into v_assignment
  from public.review_assignments ra
  where ra.submission_id=p_submission_id and ra.reviewer_id=v_actor
  limit 1;
  if v_assignment.id is null then raise exception 'You are not assigned to this application'; end if;
  select a.organization_id into v_org_id
  from public.submissions s join public.applications a on a.id=s.application_id
  where s.id=p_submission_id;
  if v_org_id is null then raise exception 'Application not found'; end if;
  update public.submissions set decision=p_decision where id=p_submission_id returning * into v_row;
  update public.review_assignments set status='completed', updated_at=now() where id=v_assignment.id;
  insert into public.review_audit_logs(review_assignment_id,action,from_status,to_status,previous_score,new_score,actor_id,organization_id,metadata)
  values(v_assignment.id,'decision',v_assignment.status,'completed',v_assignment.score,v_assignment.score,v_actor,v_org_id,jsonb_build_object('decision',p_decision));
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION private.update_review_assignment(p_assignment_id uuid, p_status text, p_score numeric, p_notes text)
 RETURNS review_assignments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.review_assignments;
  v_org_id uuid;
  v_is_admin boolean;
  v_is_reviewer boolean;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select a.organization_id
    into v_org_id
  from public.review_assignments ra
  join public.submissions s on s.id = ra.submission_id
  join public.applications a on a.id = s.application_id
  where ra.id = p_assignment_id;

  if v_org_id is null then
    raise exception 'Review assignment not found';
  end if;

  v_is_admin := private.is_org_admin(v_org_id);

  select exists (
    select 1 from public.review_assignments
    where id = p_assignment_id
      and reviewer_id = (select auth.uid())
  ) into v_is_reviewer;

  if not v_is_admin and not v_is_reviewer then
    raise exception 'You are not allowed to update this review';
  end if;

  if p_status not in ('assigned','in_progress','completed') then
    raise exception 'Invalid review status';
  end if;

  update public.review_assignments
  set status = p_status,
      score = p_score,
      notes = p_notes,
      updated_at = now()
  where id = p_assignment_id
  returning * into v_row;

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION private.update_review_assignment(p_assignment_id uuid, p_status text, p_score numeric, p_notes text, p_decision text)
 RETURNS review_assignments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.review_assignments;
  v_org_id uuid;
  v_is_admin boolean;
  v_is_reviewer boolean;
  v_previous_status text;
  v_previous_score numeric;
  v_actor uuid;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
  v_actor := (select auth.uid());
  if v_actor is null then raise exception 'Authentication required'; end if;

  select a.organization_id, ra.status, ra.score
    into v_org_id, v_previous_status, v_previous_score
  from public.review_assignments ra
  join public.submissions s on s.id = ra.submission_id
  join public.applications a on a.id = s.application_id
  where ra.id = p_assignment_id;

  if v_org_id is null then raise exception 'Review assignment not found'; end if;

  v_is_admin := private.is_org_admin(v_org_id);
  select exists(
    select 1 from public.review_assignments
    where id=p_assignment_id and reviewer_id=v_actor
  ) into v_is_reviewer;

  if not v_is_admin and not v_is_reviewer then
    raise exception 'You are not allowed to update this review';
  end if;
  if p_status not in ('assigned','in_progress','completed') then raise exception 'Invalid review status'; end if;
  if p_decision is not null and p_decision not in ('eligible','ineligible') then raise exception 'Invalid review decision'; end if;

  update public.review_assignments
  set status=p_status, score=p_score, notes=p_notes, decision=p_decision, updated_at=now()
  where id=p_assignment_id
  returning * into v_row;

  insert into public.review_audit_logs(
    review_assignment_id, action, from_status, to_status, previous_score, new_score,
    actor_id, organization_id, metadata
  ) values (
    v_row.id, 'updated', v_previous_status, v_row.status, v_previous_score, v_row.score,
    v_actor, v_org_id, jsonb_build_object('decision', v_row.decision)
  );

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_team_invite_link(p_token text, p_full_name text, p_username text, p_birth_month integer, p_birth_day integer)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_link public.team_invite_links;
  v_profile public.profiles;
  v_username text:=lower(trim(p_username));
  v_email text;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;

  update public.team_invite_links
  set used_at=now()
  where token=p_token
    and revoked_at is null
    and used_at is null
    and expires_at>now()
  returning * into v_link;

  if v_link.id is null then raise exception 'This invitation link is invalid, expired, revoked, or already used.'; end if;
  if length(trim(coalesce(p_full_name,'')))<2 then raise exception 'Enter your full name.'; end if;
  if v_username !~ '^[a-z0-9_]{3,30}$' then raise exception 'Username must be 3–30 characters and use only letters, numbers, or underscores.'; end if;
  if p_birth_month not between 1 and 12 or p_birth_day not between 1 and 31 then raise exception 'Select a valid date of birth.'; end if;
  if exists(select 1 from public.profiles where lower(username)=v_username and id<>auth.uid()) then raise exception 'That username is already in use.'; end if;

  select email into v_email from auth.users where id=auth.uid();

  insert into public.profiles(id,full_name,username,birth_month,birth_day,email,organization_id,role,invitation_status,updated_at)
  values(auth.uid(),trim(p_full_name),v_username,p_birth_month,p_birth_day,v_email,v_link.organization_id,v_link.role,'active',now())
  on conflict(id) do update set
    full_name=excluded.full_name,
    username=excluded.username,
    birth_month=excluded.birth_month,
    birth_day=excluded.birth_day,
    email=excluded.email,
    organization_id=excluded.organization_id,
    role=excluded.role,
    invitation_status='active',
    updated_at=now()
  returning * into v_profile;

  update public.team_invite_links set used_by=auth.uid() where id=v_link.id;
  return v_profile;
end $function$;

CREATE OR REPLACE FUNCTION public.bulk_set_participant_staff_assignment(p_participant_ids uuid[], p_staff_id uuid, p_assigned boolean DEFAULT true)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_admin public.profiles; v_staff public.profiles; v_count integer:=0;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
 select * into v_admin from public.profiles where id=auth.uid();
 if v_admin.id is null or v_admin.role not in('owner','admin') then raise exception 'Only an Owner or Admin can assign participants.'; end if;
 select * into v_staff from public.profiles where id=p_staff_id and organization_id=v_admin.organization_id and role in('admin','reviewer');
 if v_staff.id is null then raise exception 'Staff member not found.'; end if;
 if p_participant_ids is null or cardinality(p_participant_ids)=0 then return 0; end if;
 if exists(select 1 from public.participants p where p.id=any(p_participant_ids) and p.organization_id<>v_admin.organization_id) then raise exception 'One or more participants are outside your workspace.'; end if;
 if p_assigned then
  insert into public.participant_staff_assignments(organization_id,application_id,participant_id,staff_id,assigned_by)
  select p.organization_id,p.application_id,p.id,p_staff_id,auth.uid() from public.participants p where p.id=any(p_participant_ids) and p.organization_id=v_admin.organization_id on conflict(participant_id,staff_id) do nothing;
  get diagnostics v_count=row_count;
 else
  delete from public.participant_staff_assignments psa where psa.staff_id=p_staff_id and psa.participant_id=any(p_participant_ids) and psa.organization_id=v_admin.organization_id;
  get diagnostics v_count=row_count;
 end if;
 return v_count;
end $function$;

CREATE OR REPLACE FUNCTION public.complete_invited_member_profile(p_full_name text, p_username text, p_birth_month integer, p_birth_day integer)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_profile public.profiles; v_username text:=lower(trim(p_username));
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
 if auth.uid() is null then raise exception 'Not authenticated.'; end if;
 select * into v_profile from public.profiles where id=auth.uid();
 if v_profile.id is null or v_profile.invitation_status<>'pending' then raise exception 'A pending team invitation was not found.'; end if;
 if length(trim(coalesce(p_full_name,'')))<2 then raise exception 'Enter your full name.'; end if;
 if v_username !~ '^[a-z0-9_]{3,30}$' then raise exception 'Username must be 3–30 characters and use only letters, numbers, or underscores.'; end if;
 if p_birth_month not between 1 and 12 or p_birth_day not between 1 and 31 then raise exception 'Select a valid date of birth.'; end if;
 if exists(select 1 from public.profiles where lower(username)=v_username and id<>auth.uid()) then raise exception 'That username is already in use.'; end if;
 update public.profiles set full_name=trim(p_full_name),username=v_username,birth_month=p_birth_month,birth_day=p_birth_day,invitation_status='active',updated_at=now() where id=auth.uid() returning * into v_profile;
 return v_profile;
end $function$;

CREATE OR REPLACE FUNCTION public.create_attendance_session(p_application_id uuid, p_title text, p_session_date date)
 RETURNS attendance_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org_id uuid;
  v_role text;
  v_base text;
  v_slug text;
  v_row public.attendance_sessions;
  v_attempt integer:=0;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  if length(trim(coalesce(p_title,''))) < 2 then raise exception 'Enter a session title.'; end if;
  if p_session_date is null then raise exception 'Choose a session date.'; end if;

  select a.organization_id into v_org_id
  from public.applications a
  where a.id=p_application_id;

  if v_org_id is null then raise exception 'Programme not found.'; end if;

  select p.role::text into v_role
  from public.profiles p
  where p.id=auth.uid() and p.organization_id=v_org_id;

  if coalesce(v_role,'') not in ('owner','admin') then
    raise exception 'Only an Owner or Admin can create attendance sessions.';
  end if;

  v_base:=left(public.normalize_attendance_slug(p_title),36);
  if length(v_base)<2 then v_base:='session'; end if;

  loop
    v_attempt:=v_attempt+1;
    v_slug:=v_base||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,4);
    exit when not exists(select 1 from public.attendance_sessions s where s.check_in_slug=v_slug);
    if v_attempt>12 then raise exception 'Could not generate a unique attendance link. Please try again.'; end if;
  end loop;

  insert into public.attendance_sessions(
    organization_id,application_id,title,session_date,created_by,check_in_slug
  ) values (
    v_org_id,p_application_id,trim(p_title),p_session_date,auth.uid(),v_slug
  )
  returning * into v_row;

  return v_row;
end
$function$;

CREATE OR REPLACE FUNCTION public.create_team_invite_link(p_organization_id uuid, p_role text, p_expires_hours integer DEFAULT 168)
 RETURNS TABLE(id uuid, token text, role text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_token text;
  v_expires timestamptz;
  v_actor_role text;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;

  select p.role into v_actor_role
  from public.profiles p
  where p.id=auth.uid()
    and p.organization_id=p_organization_id;

  if v_actor_role not in ('owner','admin') then
    raise exception 'Only an Owner or Admin can create invitation links.';
  end if;

  if p_role not in ('admin','reviewer') then
    raise exception 'Choose Admin or Programme Staff.';
  end if;

  if p_role='admin' and v_actor_role<>'owner' then
    raise exception 'Only the workspace Owner can invite an Admin.';
  end if;

  if p_expires_hours not between 1 and 720 then
    raise exception 'Expiry must be between 1 hour and 30 days.';
  end if;

  v_expires:=now()+make_interval(hours=>p_expires_hours);

  insert into public.team_invite_links(organization_id,role,created_by,expires_at)
  values(p_organization_id,p_role,auth.uid(),v_expires)
  returning team_invite_links.id,team_invite_links.token into v_id,v_token;

  return query select v_id,v_token,p_role,v_expires;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_application(p_application_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_org_id uuid;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select organization_id
    into v_org_id
  from public.applications
  where id = p_application_id;

  if not found then
    raise exception 'Application not found.';
  end if;

  if not private.is_org_admin(v_org_id) then
    raise exception 'Only an Owner or Admin can delete programmes.';
  end if;

  perform set_config('app.allow_published_form_delete','on',true);
  delete from public.applications where id = p_application_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_assignment_leaderboard(p_application_id uuid)
 RETURNS TABLE(participant_record_id uuid, participant_id text, full_name text, graded_assignments bigint, submitted_assignments bigint, total_assignments bigint, average_percentage numeric, completion_percentage numeric, rank bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
 with me as(
   select p.organization_id,p.role
   from public.profiles p
   join public.applications a on a.organization_id=p.organization_id
   where private.has_active_user_session()
     and p.id=auth.uid()
     and a.id=p_application_id
     and p.role in('owner','admin','reviewer')
 ),
 programme_assignments as(
   select a.id,a.max_score
   from public.assignments a,me
   where a.application_id=p_application_id
     and a.status in('published','closed')
 ),
 totals as(
   select count(*)::bigint total from programme_assignments
 ),
 visible_participants as(
   select p.*
   from public.participants p,me
   where p.application_id=p_application_id
 ),
 scores as(
   select
     p.id participant_record_id,
     p.participant_id,
     ap.full_name,
     count(s.id) filter(where s.status='graded')::bigint graded_assignments,
     count(s.id)::bigint submitted_assignments,
     avg(case when s.status='graded' and pa.max_score>0 then(s.score/pa.max_score)*100 end) average_percentage
   from visible_participants p
   left join public.applicants ap on ap.id=p.applicant_id
   left join public.assignment_submissions s on s.participant_id=p.id
   left join programme_assignments pa on pa.id=s.assignment_id
   group by p.id,p.participant_id,ap.full_name
 ),
 prepared as(
   select
     scores.*,
     totals.total total_assignments,
     case when totals.total=0 then 0::numeric
          else(scores.submitted_assignments::numeric/totals.total::numeric)*100 end completion_percentage
   from scores cross join totals
 )
 select
   participant_record_id,
   participant_id,
   full_name,
   graded_assignments,
   submitted_assignments,
   total_assignments,
   round(average_percentage,2),
   round(completion_percentage,2),
   case when graded_assignments>0 then
     dense_rank() over(order by average_percentage desc nulls last,completion_percentage desc,participant_id asc)
   end rank
 from prepared
 order by(graded_assignments>0) desc,rank nulls last,participant_id
$function$;

CREATE OR REPLACE FUNCTION public.grade_assignment_submission(p_submission_id uuid, p_score numeric, p_feedback text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s public.assignment_submissions; a public.assignments; old_score numeric; old_feedback text; v_profile public.profiles;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
 select * into s from public.assignment_submissions where id=p_submission_id;
 if s.id is null then raise exception 'Submission not found.'; end if;
 select * into v_profile from public.profiles where id=auth.uid() and organization_id=s.organization_id;
 if v_profile.id is null or v_profile.role not in ('owner','admin','reviewer') then raise exception 'You do not have permission to grade this submission.'; end if;
 if v_profile.role='reviewer' and not exists(select 1 from public.participant_staff_assignments psa where psa.participant_id=s.participant_id and psa.staff_id=auth.uid()) then raise exception 'This participant is not assigned to you.'; end if;
 select * into a from public.assignments where id=s.assignment_id;
 if p_score is null or p_score<0 or p_score>a.max_score then raise exception 'Score must be between 0 and %.',a.max_score; end if;
 old_score:=s.score; old_feedback:=s.feedback;
 update public.assignment_submissions set score=p_score,feedback=nullif(trim(p_feedback),''),graded_by=auth.uid(),graded_at=now(),status='graded',updated_at=now() where id=s.id;
 insert into public.assignment_grade_history(organization_id,submission_id,changed_by,previous_score,new_score,previous_feedback,new_feedback)
 values(s.organization_id,s.id,auth.uid(),old_score,p_score,old_feedback,nullif(trim(p_feedback),''));
 return jsonb_build_object('submission_id',s.id,'score',p_score,'feedback',nullif(trim(p_feedback),''),'status','graded','graded_at',now());
end $function$;

CREATE OR REPLACE FUNCTION public.import_google_form_batch(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org_id uuid;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select organization_id
    into v_org_id
  from public.form_import_batches
  where id = p_batch_id;

  if v_org_id is null then
    raise exception 'Import batch not found';
  end if;

  if not private.is_org_admin(v_org_id) then
    raise exception 'Only an Owner or Admin can import application data.';
  end if;

  return private.import_google_form_batch_internal(p_batch_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_assignment_storage_paths(p_assignment_id uuid)
 RETURNS TABLE(storage_bucket text, storage_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org_id uuid;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select a.organization_id
    into v_org_id
  from public.assignments a
  where a.id=p_assignment_id;

  if v_org_id is null then
    raise exception 'Assignment not found';
  end if;

  if not private.is_org_admin(v_org_id) then
    raise exception 'Only an Owner or Admin can manage assignment files.';
  end if;

  return query
  select o.bucket_id::text,o.name::text
  from storage.objects o
  where o.bucket_id='application-files'
    and (storage.foldername(o.name))[1]='assignment-submissions'
    and (storage.foldername(o.name))[2]=p_assignment_id::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_programme_storage_paths(p_application_id uuid)
 RETURNS TABLE(storage_bucket text, storage_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org_id uuid;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select a.organization_id
    into v_org_id
  from public.applications a
  where a.id=p_application_id;

  if v_org_id is null then
    raise exception 'Programme not found';
  end if;

  if not private.is_org_admin(v_org_id) then
    raise exception 'Only an Owner or Admin can manage programme files.';
  end if;

  return query
  select o.bucket_id::text,o.name::text
  from storage.objects o
  where o.bucket_id='application-files'
    and (
      (
        (storage.foldername(o.name))[1]='public-submissions'
        and (storage.foldername(o.name))[2]=p_application_id::text
      )
      or (
        (storage.foldername(o.name))[1]='assignment-submissions'
        and exists (
          select 1
          from public.assignments a
          where a.id::text=(storage.foldername(o.name))[2]
            and a.application_id=p_application_id
        )
      )
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_my_team_invitation()
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare v_profile public.profiles; v_user auth.users;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
 if auth.uid() is null then raise exception 'Not authenticated.'; end if;
 select * into v_user from auth.users where id=auth.uid();
 select * into v_profile from public.profiles where id=auth.uid();
 if v_profile.id is null then raise exception 'Profile not found.'; end if;
 if v_profile.invitation_status='pending' and v_user.email_confirmed_at is not null and v_user.last_sign_in_at is not null then
  update public.profiles set invitation_status='active',updated_at=now() where id=auth.uid() returning * into v_profile;
 end if;
 return v_profile;
end $function$;

CREATE OR REPLACE FUNCTION public.revoke_team_invite_link(p_link_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_link_role text;
  v_actor_role text;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
  select organization_id,role into v_org,v_link_role
  from public.team_invite_links
  where id=p_link_id;

  if v_org is null then raise exception 'Invitation link not found.'; end if;

  select p.role into v_actor_role
  from public.profiles p
  where p.id=auth.uid()
    and p.organization_id=v_org;

  if v_actor_role not in ('owner','admin') then
    raise exception 'Only an Owner or Admin can revoke invitation links.';
  end if;

  if v_link_role='admin' and v_actor_role<>'owner' then
    raise exception 'Only the workspace Owner can revoke an Admin invitation.';
  end if;

  update public.team_invite_links
  set revoked_at=now()
  where id=p_link_id and used_at is null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_participant_staff_assignment(p_participant_id uuid, p_staff_id uuid, p_assigned boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_participant public.participants; v_staff public.profiles; v_admin public.profiles;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
 select * into v_participant from public.participants where id=p_participant_id;
 if v_participant.id is null then raise exception 'Participant not found.'; end if;
 select * into v_admin from public.profiles where id=auth.uid();
 if v_admin.organization_id<>v_participant.organization_id or v_admin.role not in ('owner','admin') then raise exception 'Only an Owner or Admin can assign participants.'; end if;
 select * into v_staff from public.profiles where id=p_staff_id and organization_id=v_participant.organization_id and role in('admin','reviewer');
 if v_staff.id is null then raise exception 'Staff member not found.'; end if;
 if p_assigned then insert into public.participant_staff_assignments(organization_id,application_id,participant_id,staff_id,assigned_by) values(v_participant.organization_id,v_participant.application_id,v_participant.id,v_staff.id,auth.uid()) on conflict(participant_id,staff_id) do nothing;
 else delete from public.participant_staff_assignments where participant_id=p_participant_id and staff_id=p_staff_id; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.set_submission_decision(p_submission_id uuid, p_decision text)
 RETURNS TABLE(submission_id uuid, decision text, participant_id text, participant_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_organization_id uuid;
  v_role text;
  v_saved_decision text;
  v_participant_id text;
  v_participant_status text;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  if p_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  select a.organization_id
    into v_organization_id
  from public.submissions s
  join public.applications a on a.id = s.application_id
  where s.id = p_submission_id;

  if v_organization_id is null then
    raise exception 'Submission not found.';
  end if;

  select p.role::text
    into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.organization_id = v_organization_id;

  if coalesce(v_role,'') not in ('owner','admin','reviewer') then
    raise exception 'You do not have permission to make this application decision.';
  end if;

  if v_role = 'reviewer' and not exists (
    select 1
    from public.review_assignments ra
    where ra.submission_id = p_submission_id
      and ra.reviewer_id = auth.uid()
  ) then
    raise exception 'This application is not assigned to you.';
  end if;

  update public.submissions
  set decision = p_decision
  where id = p_submission_id
  returning public.submissions.decision::text into v_saved_decision;

  if v_saved_decision is null then
    raise exception 'The application decision was not saved.';
  end if;

  select p.participant_id, p.status::text
    into v_participant_id, v_participant_status
  from public.participants p
  where p.submission_id = p_submission_id
  limit 1;

  return query
  select p_submission_id, v_saved_decision, v_participant_id, v_participant_status;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_attendance_checkin_slug(p_session_id uuid, p_slug text)
 RETURNS attendance_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.attendance_sessions;
  v_role text;
  v_slug text;
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;

  select s.* into v_row
  from public.attendance_sessions s
  where s.id=p_session_id;

  if v_row.id is null then raise exception 'Attendance session not found.'; end if;

  select p.role::text into v_role
  from public.profiles p
  where p.id=auth.uid() and p.organization_id=v_row.organization_id;

  if coalesce(v_role,'') not in ('owner','admin') then
    raise exception 'Only an Owner or Admin can edit the attendance link.';
  end if;

  v_slug:=public.normalize_attendance_slug(p_slug);
  if length(v_slug)<3 or length(v_slug)>48 then
    raise exception 'Link name must be 3–48 characters.';
  end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Use only letters, numbers, and hyphens.';
  end if;

  if exists(
    select 1 from public.attendance_sessions s
    where s.check_in_slug=v_slug and s.id<>p_session_id
  ) then
    raise exception 'That attendance link is already in use. Choose another.';
  end if;

  update public.attendance_sessions
  set check_in_slug=v_slug
  where id=p_session_id
  returning * into v_row;

  return v_row;
end
$function$;
