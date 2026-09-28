-- ApplyFlow Phase 3: assignment grading and audit history
alter table public.assignment_submissions
  add column if not exists score numeric(10,2),
  add column if not exists feedback text,
  add column if not exists graded_by uuid references auth.users(id) on delete set null,
  add column if not exists graded_at timestamptz,
  add constraint assignment_submission_score_nonnegative check (score is null or score>=0);

create table if not exists public.assignment_grade_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submission_id uuid not null references public.assignment_submissions(id) on delete cascade,
  changed_by uuid not null references auth.users(id) on delete restrict,
  previous_score numeric(10,2),
  new_score numeric(10,2),
  previous_feedback text,
  new_feedback text,
  changed_at timestamptz not null default now()
);
create index if not exists assignment_grade_history_submission_idx on public.assignment_grade_history(submission_id);
alter table public.assignment_grade_history enable row level security;
create policy "assignment_grade_history_staff_select" on public.assignment_grade_history for select to authenticated using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=assignment_grade_history.organization_id and p.role in ('owner','admin','reviewer'))
);
grant select on public.assignment_grade_history to authenticated;

create or replace function public.grade_assignment_submission(p_submission_id uuid,p_score numeric,p_feedback text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare s public.assignment_submissions; a public.assignments; old_score numeric; old_feedback text;
begin
  select * into s from public.assignment_submissions where id=p_submission_id;
  if s.id is null then raise exception 'Submission not found.'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=s.organization_id and p.role in ('owner','admin','reviewer')) then
    raise exception 'You do not have permission to grade this submission.';
  end if;
  select * into a from public.assignments where id=s.assignment_id;
  if p_score is null or p_score<0 or p_score>a.max_score then raise exception 'Score must be between 0 and %.',a.max_score; end if;
  old_score:=s.score; old_feedback:=s.feedback;
  update public.assignment_submissions
    set score=p_score,feedback=nullif(trim(p_feedback),''),graded_by=auth.uid(),graded_at=now(),status='graded',updated_at=now()
    where id=s.id;
  insert into public.assignment_grade_history(organization_id,submission_id,changed_by,previous_score,new_score,previous_feedback,new_feedback)
    values(s.organization_id,s.id,auth.uid(),old_score,p_score,old_feedback,nullif(trim(p_feedback),''));
  return jsonb_build_object('submission_id',s.id,'score',p_score,'feedback',nullif(trim(p_feedback),''),'status','graded','graded_at',now());
end $$;
revoke all on function public.grade_assignment_submission(uuid,numeric,text) from public;
grant execute on function public.grade_assignment_submission(uuid,numeric,text) to authenticated;
