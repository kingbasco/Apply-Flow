-- ApplyFlow Phase 2: secure public assignment access and submission
create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted','graded')),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assignment_id,participant_id)
);
create table if not exists public.assignment_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.assignment_submissions(id) on delete cascade,
  question_id uuid not null references public.assignment_questions(id) on delete restrict,
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  unique(submission_id,question_id)
);
create index if not exists assignment_submissions_assignment_id_idx on public.assignment_submissions(assignment_id);
create index if not exists assignment_submissions_participant_id_idx on public.assignment_submissions(participant_id);
create index if not exists assignment_answers_submission_id_idx on public.assignment_answers(submission_id);
alter table public.assignment_submissions enable row level security;
alter table public.assignment_answers enable row level security;

create policy "assignment_submissions_staff_select" on public.assignment_submissions for select to authenticated using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=assignment_submissions.organization_id and p.role in ('owner','admin','reviewer'))
);
create policy "assignment_answers_staff_select" on public.assignment_answers for select to authenticated using (
  exists(select 1 from public.assignment_submissions s join public.profiles p on p.organization_id=s.organization_id where s.id=assignment_answers.submission_id and p.id=auth.uid() and p.role in ('owner','admin','reviewer'))
);
grant select on public.assignment_submissions to authenticated;
grant select on public.assignment_answers to authenticated;

-- Public callers never receive participant rows. This RPC returns only the
-- published assignment after a programme-scoped active Participant ID matches.
create or replace function public.open_assignment_for_participant(p_slug text,p_participant_code text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare a public.assignments; p public.participants; qs jsonb;
begin
  select * into a from public.assignments where public_slug=p_slug and status='published';
  if a.id is null then raise exception 'Assignment is not available.'; end if;
  if a.deadline is not null and now()>a.deadline then raise exception 'This assignment deadline has passed.'; end if;
  select * into p from public.participants where application_id=a.application_id and upper(participant_id)=upper(trim(p_participant_code)) and status='active';
  if p.id is null then raise exception 'Participant ID is not valid for this programme.'; end if;
  if exists(select 1 from public.assignment_submissions s where s.assignment_id=a.id and s.participant_id=p.id) then raise exception 'This assignment has already been submitted.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'type',q.type,'label',q.label,'description',q.description,'required',q.required,'position',q.position,'config',q.config) order by q.position),'[]'::jsonb) into qs from public.assignment_questions q where q.assignment_id=a.id;
  return jsonb_build_object('access_token',encode(gen_random_bytes(24),'hex'),'assignment_id',a.id,'participant_record_id',p.id,'participant_code',p.participant_id,'title',a.title,'description',a.description,'instructions',a.instructions,'deadline',a.deadline,'max_score',a.max_score,'questions',qs);
end $$;

-- Revalidates assignment, participant, deadline and duplicate status at submit
-- time. The opaque values returned above are not trusted on their own.
create or replace function public.submit_public_assignment(p_slug text,p_participant_code text,p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare a public.assignments; p public.participants; s_id uuid; q public.assignment_questions; answer jsonb;
begin
  select * into a from public.assignments where public_slug=p_slug and status='published';
  if a.id is null then raise exception 'Assignment is not available.'; end if;
  if a.deadline is not null and now()>a.deadline then raise exception 'This assignment deadline has passed.'; end if;
  select * into p from public.participants where application_id=a.application_id and upper(participant_id)=upper(trim(p_participant_code)) and status='active';
  if p.id is null then raise exception 'Participant ID is not valid for this programme.'; end if;
  if exists(select 1 from public.assignment_submissions where assignment_id=a.id and participant_id=p.id) then raise exception 'This assignment has already been submitted.'; end if;
  for q in select * from public.assignment_questions where assignment_id=a.id order by position loop
    answer:=p_answers->q.id::text;
    if q.required and (answer is null or answer='null'::jsonb or answer='""'::jsonb or answer='[]'::jsonb) then raise exception 'Please answer all required questions.'; end if;
  end loop;
  insert into public.assignment_submissions(assignment_id,participant_id,organization_id,application_id) values(a.id,p.id,a.organization_id,a.application_id) returning id into s_id;
  insert into public.assignment_answers(submission_id,question_id,value)
    select s_id,q.id,coalesce(p_answers->q.id::text,'null'::jsonb) from public.assignment_questions q where q.assignment_id=a.id;
  return jsonb_build_object('submission_id',s_id,'participant_code',p.participant_id,'submitted_at',now(),'title',a.title);
end $$;
revoke all on function public.open_assignment_for_participant(text,text) from public;
revoke all on function public.submit_public_assignment(text,text,jsonb) from public;
grant execute on function public.open_assignment_for_participant(text,text) to anon,authenticated;
grant execute on function public.submit_public_assignment(text,text,jsonb) to anon,authenticated;
