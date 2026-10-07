-- Group-scoped leaderboards
-- Participants see only their assigned staff group in the public result portal.
-- Internal staff can view the overall leaderboard; group views are restricted to
-- the staff member's own group for Programme Staff and any group for Admin/Owner.

create or replace function public.get_assignment_leaderboard(p_application_id uuid)
returns table(
  participant_record_id uuid,
  participant_id text,
  full_name text,
  graded_assignments bigint,
  submitted_assignments bigint,
  total_assignments bigint,
  average_percentage numeric,
  completion_percentage numeric,
  assignment_points numeric,
  attendance_points numeric,
  bonus_points numeric,
  total_points numeric,
  rank bigint
)
language sql
security definer
set search_path to 'public'
as $function$
  with me as (
    select p.id as user_id,p.organization_id,p.role,o.attendance_points_per_session
    from public.profiles p
    join public.applications a on a.organization_id=p.organization_id
    join public.organizations o on o.id=p.organization_id
    where p.id=auth.uid()
      and a.id=p_application_id
      and p.role in ('owner','admin','reviewer')
      and private.has_active_user_session()
  ),
  programme_assignments as (
    select a.id,a.max_score
    from public.assignments a,me
    where a.application_id=p_application_id
      and a.status in ('published','closed')
      and a.results_released=true
  ),
  assignment_total as (
    select count(*)::bigint total from programme_assignments
  ),
  assignment_stats as (
    select s.participant_id,
      count(*) filter (where s.status='graded' and s.score is not null)::bigint graded_assignments,
      count(*)::bigint submitted_assignments,
      avg(case when s.status='graded' and s.score is not null and pa.max_score>0 then (s.score/pa.max_score)*100 end) average_percentage,
      coalesce(sum(case when s.status='graded' and s.score is not null then s.score else 0 end),0)::numeric assignment_points
    from public.assignment_submissions s
    join programme_assignments pa on pa.id=s.assignment_id
    group by s.participant_id
  ),
  attendance_stats as (
    select ar.participant_id,
      coalesce(sum(case when ar.status='present' then me.attendance_points_per_session else 0 end),0)::numeric attendance_points
    from public.attendance_records ar
    join public.attendance_sessions ats on ats.id=ar.attendance_session_id
    join me on true
    where ats.application_id=p_application_id
    group by ar.participant_id
  ),
  bonus_stats as (
    select pa.participant_id,
      coalesce(sum(pa.points),0)::numeric bonus_points
    from public.participant_point_awards pa
    where pa.application_id=p_application_id
      and pa.revoked_at is null
    group by pa.participant_id
  ),
  prepared as (
    select p.id participant_record_id,p.participant_id,ap.full_name,
      coalesce(ast.graded_assignments,0)::bigint graded_assignments,
      coalesce(ast.submitted_assignments,0)::bigint submitted_assignments,
      at.total total_assignments,
      round(ast.average_percentage,2) average_percentage,
      round(case when at.total=0 then 0::numeric else (coalesce(ast.submitted_assignments,0)::numeric/at.total::numeric)*100 end,2) completion_percentage,
      coalesce(ast.assignment_points,0)::numeric assignment_points,
      coalesce(att.attendance_points,0)::numeric attendance_points,
      coalesce(bs.bonus_points,0)::numeric bonus_points,
      (coalesce(ast.assignment_points,0)+coalesce(att.attendance_points,0)+coalesce(bs.bonus_points,0))::numeric total_points
    from public.participants p
    join me on true
    left join public.applicants ap on ap.id=p.applicant_id
    cross join assignment_total at
    left join assignment_stats ast on ast.participant_id=p.id
    left join attendance_stats att on att.participant_id=p.id
    left join bonus_stats bs on bs.participant_id=p.id
    where p.application_id=p_application_id
      and p.status='active'
  )
  select participant_record_id,participant_id,full_name,graded_assignments,submitted_assignments,total_assignments,
    average_percentage,completion_percentage,round(assignment_points,2),round(attendance_points,2),round(bonus_points,2),round(total_points,2),
    dense_rank() over(order by total_points desc)::bigint rank
  from prepared
  order by rank,participant_id;
$function$;

revoke all on function public.get_assignment_leaderboard(uuid) from public;
revoke all on function public.get_assignment_leaderboard(uuid) from anon;
grant execute on function public.get_assignment_leaderboard(uuid) to authenticated;

create or replace function public.get_assignment_group_leaderboard(p_application_id uuid,p_staff_id uuid)
returns table(
  participant_record_id uuid,
  participant_id text,
  full_name text,
  graded_assignments bigint,
  submitted_assignments bigint,
  total_assignments bigint,
  average_percentage numeric,
  completion_percentage numeric,
  assignment_points numeric,
  attendance_points numeric,
  bonus_points numeric,
  total_points numeric,
  rank bigint
)
language sql
security definer
set search_path to 'public'
as $function$
  with me as (
    select p.id as user_id,p.organization_id,p.role,o.attendance_points_per_session
    from public.profiles p
    join public.applications a on a.organization_id=p.organization_id
    join public.organizations o on o.id=p.organization_id
    where p.id=auth.uid()
      and a.id=p_application_id
      and p.role in ('owner','admin','reviewer')
      and private.has_active_user_session()
      and (p.role in ('owner','admin') or (p.role='reviewer' and p.id=p_staff_id))
  ),
  programme_assignments as (
    select a.id,a.max_score
    from public.assignments a,me
    where a.application_id=p_application_id
      and a.status in ('published','closed')
      and a.results_released=true
  ),
  assignment_total as (
    select count(*)::bigint total from programme_assignments
  ),
  assignment_stats as (
    select s.participant_id,
      count(*) filter (where s.status='graded' and s.score is not null)::bigint graded_assignments,
      count(*)::bigint submitted_assignments,
      avg(case when s.status='graded' and s.score is not null and pa.max_score>0 then (s.score/pa.max_score)*100 end) average_percentage,
      coalesce(sum(case when s.status='graded' and s.score is not null then s.score else 0 end),0)::numeric assignment_points
    from public.assignment_submissions s
    join programme_assignments pa on pa.id=s.assignment_id
    group by s.participant_id
  ),
  attendance_stats as (
    select ar.participant_id,
      coalesce(sum(case when ar.status='present' then me.attendance_points_per_session else 0 end),0)::numeric attendance_points
    from public.attendance_records ar
    join public.attendance_sessions ats on ats.id=ar.attendance_session_id
    join me on true
    where ats.application_id=p_application_id
    group by ar.participant_id
  ),
  bonus_stats as (
    select pa.participant_id,
      coalesce(sum(pa.points),0)::numeric bonus_points
    from public.participant_point_awards pa
    where pa.application_id=p_application_id
      and pa.revoked_at is null
    group by pa.participant_id
  ),
  prepared as (
    select p.id participant_record_id,p.participant_id,ap.full_name,
      coalesce(ast.graded_assignments,0)::bigint graded_assignments,
      coalesce(ast.submitted_assignments,0)::bigint submitted_assignments,
      at.total total_assignments,
      round(ast.average_percentage,2) average_percentage,
      round(case when at.total=0 then 0::numeric else (coalesce(ast.submitted_assignments,0)::numeric/at.total::numeric)*100 end,2) completion_percentage,
      coalesce(ast.assignment_points,0)::numeric assignment_points,
      coalesce(att.attendance_points,0)::numeric attendance_points,
      coalesce(bs.bonus_points,0)::numeric bonus_points,
      (coalesce(ast.assignment_points,0)+coalesce(att.attendance_points,0)+coalesce(bs.bonus_points,0))::numeric total_points
    from public.participants p
    join me on true
    left join public.applicants ap on ap.id=p.applicant_id
    cross join assignment_total at
    left join assignment_stats ast on ast.participant_id=p.id
    left join attendance_stats att on att.participant_id=p.id
    left join bonus_stats bs on bs.participant_id=p.id
    where p.application_id=p_application_id
      and p.status='active'
      and exists (
        select 1
        from public.participant_staff_assignments psa
        where psa.application_id=p_application_id
          and psa.participant_id=p.id
          and psa.staff_id=p_staff_id
      )
  )
  select participant_record_id,participant_id,full_name,graded_assignments,submitted_assignments,total_assignments,
    average_percentage,completion_percentage,round(assignment_points,2),round(attendance_points,2),round(bonus_points,2),round(total_points,2),
    dense_rank() over(order by total_points desc)::bigint rank
  from prepared
  order by rank,participant_id;
$function$;

revoke all on function public.get_assignment_group_leaderboard(uuid,uuid) from public;
revoke all on function public.get_assignment_group_leaderboard(uuid,uuid) from anon;
grant execute on function public.get_assignment_group_leaderboard(uuid,uuid) to authenticated;

create or replace function public.get_leaderboard_groups(p_application_id uuid)
returns table(staff_id uuid,staff_name text,participant_count bigint)
language sql
security definer
set search_path to 'public'
as $function$
  with me as (
    select p.id as user_id,p.organization_id,p.role
    from public.profiles p
    join public.applications a on a.organization_id=p.organization_id
    where p.id=auth.uid()
      and a.id=p_application_id
      and p.role in ('owner','admin','reviewer')
      and private.has_active_user_session()
  )
  select psa.staff_id,
    coalesce(nullif(trim(pf.full_name),''),pf.email,'Programme Staff') as staff_name,
    count(distinct p.id)::bigint as participant_count
  from public.participant_staff_assignments psa
  join me on true
  join public.participants p on p.id=psa.participant_id and p.application_id=p_application_id and p.status='active'
  join public.profiles pf on pf.id=psa.staff_id
  where psa.application_id=p_application_id
    and (me.role in ('owner','admin') or (me.role='reviewer' and psa.staff_id=me.user_id))
  group by psa.staff_id,pf.full_name,pf.email
  order by staff_name,psa.staff_id;
$function$;

revoke all on function public.get_leaderboard_groups(uuid) from public;
revoke all on function public.get_leaderboard_groups(uuid) from anon;
grant execute on function public.get_leaderboard_groups(uuid) to authenticated;

create or replace function public.get_public_assignment_result(p_slug text,p_participant_code text,p_email text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_assignment public.assignments;
  v_participant public.participants;
  v_applicant public.applicants;
  v_submission public.assignment_submissions;
  v_rows jsonb;
  v_attendance_points numeric:=5;
  v_group_staff_id uuid;
  v_group_name text;
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

    select attendance_points_per_session into v_attendance_points
    from public.organizations where id=v_assignment.organization_id;

    select p.* into v_participant
    from public.participants p
    join public.applicants a on a.id=p.applicant_id
    where p.application_id=v_assignment.application_id
      and upper(p.participant_id)=upper(trim(p_participant_code))
      and lower(trim(coalesce(a.email,'')))=v_email
    limit 1;

    if v_participant.id is null then raise exception 'Participant ID or email is not valid for this programme.'; end if;

    select * into v_applicant from public.applicants where id=v_participant.applicant_id;

    select * into v_submission
    from public.assignment_submissions
    where assignment_id=v_assignment.id and participant_id=v_participant.id;

    if v_submission.id is null then raise exception 'No submission was found for this participant.'; end if;
    if v_submission.status<>'graded' or v_submission.score is null then raise exception 'Your result has not been graded yet.'; end if;

    select psa.staff_id,coalesce(nullif(trim(pf.full_name),''),'Your group')
      into v_group_staff_id,v_group_name
    from public.participant_staff_assignments psa
    left join public.profiles pf on pf.id=psa.staff_id
    where psa.application_id=v_assignment.application_id
      and psa.participant_id=v_participant.id
    limit 1;

    if v_group_name is null then v_group_name:='Your group'; end if;

    with programme_assignments as (
      select a.id,a.max_score
      from public.assignments a
      where a.application_id=v_assignment.application_id
        and a.results_released=true
        and a.status in ('published','closed')
    ),
    assignment_stats as (
      select s.participant_id,
        coalesce(sum(case when s.status='graded' and s.score is not null then s.score else 0 end),0)::numeric assignment_points
      from public.assignment_submissions s
      join programme_assignments pa on pa.id=s.assignment_id
      group by s.participant_id
    ),
    attendance_stats as (
      select ar.participant_id,
        coalesce(sum(case when ar.status='present' then v_attendance_points else 0 end),0)::numeric attendance_points
      from public.attendance_records ar
      join public.attendance_sessions ats on ats.id=ar.attendance_session_id
      where ats.application_id=v_assignment.application_id
      group by ar.participant_id
    ),
    bonus_stats as (
      select pa.participant_id,
        coalesce(sum(pa.points),0)::numeric bonus_points
      from public.participant_point_awards pa
      where pa.application_id=v_assignment.application_id
        and pa.revoked_at is null
      group by pa.participant_id
    ),
    prepared as (
      select p.id participant_record_id,p.participant_id,coalesce(ap.full_name,p.participant_id) display_name,
        coalesce(ast.assignment_points,0)::numeric assignment_points,
        coalesce(att.attendance_points,0)::numeric attendance_points,
        coalesce(bs.bonus_points,0)::numeric bonus_points,
        (coalesce(ast.assignment_points,0)+coalesce(att.attendance_points,0)+coalesce(bs.bonus_points,0))::numeric total_points
      from public.participants p
      left join public.applicants ap on ap.id=p.applicant_id
      left join assignment_stats ast on ast.participant_id=p.id
      left join attendance_stats att on att.participant_id=p.id
      left join bonus_stats bs on bs.participant_id=p.id
      where p.application_id=v_assignment.application_id
        and p.status='active'
        and (
          (
            v_group_staff_id is not null
            and exists (
              select 1
              from public.participant_staff_assignments psa
              where psa.application_id=v_assignment.application_id
                and psa.participant_id=p.id
                and psa.staff_id=v_group_staff_id
            )
          )
          or (v_group_staff_id is null and p.id=v_participant.id)
        )
    ),
    ranked as (
      select prepared.*,dense_rank() over(order by total_points desc)::bigint rnk
      from prepared
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'rank',r.rnk,
      'participant_id',r.participant_id,
      'display_name',r.display_name,
      'assignment_points',round(r.assignment_points,2),
      'attendance_points',round(r.attendance_points,2),
      'bonus_points',round(r.bonus_points,2),
      'points',round(r.total_points,2),
      'is_you',r.participant_record_id=v_participant.id
    ) order by r.rnk,r.participant_id),'[]'::jsonb)
    into v_rows from ranked r;

    return jsonb_build_object(
      'title',v_assignment.title,
      'participant_name',coalesce(v_applicant.full_name,'Participant'),
      'participant_code',v_participant.participant_id,
      'score',v_submission.score,
      'max_score',v_assignment.max_score,
      'percentage',round((v_submission.score/nullif(v_assignment.max_score,0))*100,2),
      'pass_mark',v_assignment.pass_mark,
      'passed',v_submission.score>=v_assignment.pass_mark,
      'feedback',v_submission.feedback,
      'submitted_at',v_submission.submitted_at,
      'graded_at',v_submission.graded_at,
      'leaderboard_scope','group',
      'leaderboard_group_id',v_group_staff_id,
      'leaderboard_group_name',v_group_name,
      'leaderboard',v_rows
    );
  exception
    when raise_exception then return jsonb_build_object('error',sqlerrm);
    when others then return jsonb_build_object('error','Could not load this result. Please try again.');
  end;
end;
$function$;

revoke all on function public.get_public_assignment_result(text,text,text) from public;
revoke all on function public.get_public_assignment_result(text,text,text) from authenticated;
grant execute on function public.get_public_assignment_result(text,text,text) to anon,authenticated;
