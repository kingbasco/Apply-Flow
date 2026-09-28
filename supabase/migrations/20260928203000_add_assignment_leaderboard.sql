-- ApplyFlow Phase 4: programme performance and leaderboard
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
  rank bigint
)
language sql
security definer
set search_path=public
as $$
  with allowed as (
    select a.organization_id
    from public.applications a
    join public.profiles p on p.organization_id=a.organization_id
    where a.id=p_application_id and p.id=auth.uid() and p.role in ('owner','admin','reviewer')
  ),
  programme_assignments as (
    select a.id,a.max_score
    from public.assignments a,allowed
    where a.application_id=p_application_id and a.status in ('published','closed')
  ),
  totals as (select count(*)::bigint total from programme_assignments),
  scores as (
    select p.id participant_record_id,p.participant_id,ap.full_name,
      count(s.id) filter(where s.status='graded')::bigint graded_assignments,
      count(s.id)::bigint submitted_assignments,
      avg(case when s.status='graded' and pa.max_score>0 then (s.score/pa.max_score)*100 end) average_percentage
    from public.participants p
    join allowed al on true
    left join public.applicants ap on ap.id=p.applicant_id
    left join public.assignment_submissions s on s.participant_id=p.id
    left join programme_assignments pa on pa.id=s.assignment_id
    where p.application_id=p_application_id
    group by p.id,p.participant_id,ap.full_name
  ),
  prepared as (
    select scores.*,totals.total total_assignments,
      case when totals.total=0 then 0::numeric else (scores.submitted_assignments::numeric/totals.total::numeric)*100 end completion_percentage
    from scores cross join totals
  )
  select participant_record_id,participant_id,full_name,graded_assignments,submitted_assignments,total_assignments,
    round(average_percentage,2),
    round(completion_percentage,2),
    case when graded_assignments>0 then dense_rank() over(order by average_percentage desc nulls last,completion_percentage desc,participant_id asc) end rank
  from prepared
  order by (graded_assignments>0) desc,rank nulls last,participant_id;
$$;
revoke all on function public.get_assignment_leaderboard(uuid) from public;
grant execute on function public.get_assignment_leaderboard(uuid) to authenticated;
