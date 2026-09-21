create extension if not exists "pgcrypto";

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  organization_id uuid references public.organizations(id) on delete set null,
  role text not null default 'owner' check (role in ('owner','admin','reviewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','published','screening','closed')),
  deadline date,
  target_count integer check (target_count is null or target_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists organizations_created_by_idx on public.organizations(created_by);
create index if not exists profiles_organization_id_idx on public.profiles(organization_id);
create index if not exists applications_organization_id_idx on public.applications(organization_id);
create index if not exists applications_created_by_idx on public.applications(created_by);
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.applications enable row level security;
create policy "Users can view their organizations" on public.organizations for select to authenticated using ((select auth.uid()) = created_by);
create policy "Users can create organizations" on public.organizations for insert to authenticated with check ((select auth.uid()) = created_by);
create policy "Owners can update organizations" on public.organizations for update to authenticated using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);
create policy "Users can view their profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Users can create their profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users can update their profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Users can view their applications" on public.applications for select to authenticated using ((select auth.uid()) = created_by);
create policy "Users can create applications" on public.applications for insert to authenticated with check ((select auth.uid()) = created_by);
create policy "Users can update their applications" on public.applications for update to authenticated using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);
create policy "Users can delete their applications" on public.applications for delete to authenticated using ((select auth.uid()) = created_by);
grant select, insert, update on public.organizations to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.applications to authenticated;

-- Form builder foundation
create table if not exists public.form_versions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  version_number integer not null,
  status text not null default 'draft' check (status in ('draft','published')),
  title text not null default 'Application form',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique(application_id, version_number)
);
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  form_version_id uuid not null references public.form_versions(id) on delete cascade,
  type text not null check (type in ('short_text','long_text','email','phone','number','date','dropdown','single_choice','multiple_choice','yes_no','file','image','rating')),
  label text not null,
  description text,
  required boolean not null default false,
  placeholder text,
  position integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  conditional_rules jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label text not null,
  value text not null,
  position integer not null default 0
);
create index if not exists form_versions_application_id_idx on public.form_versions(application_id);
create index if not exists questions_form_version_id_idx on public.questions(form_version_id);
create index if not exists question_options_question_id_idx on public.question_options(question_id);
alter table public.form_versions enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
create policy "form_versions_select_own" on public.form_versions for select using (exists (select 1 from public.applications a where a.id=form_versions.application_id and a.created_by=auth.uid()));
create policy "form_versions_insert_own" on public.form_versions for insert with check (exists (select 1 from public.applications a where a.id=form_versions.application_id and a.created_by=auth.uid()) and created_by=auth.uid());
create policy "form_versions_update_own" on public.form_versions for update using (exists (select 1 from public.applications a where a.id=form_versions.application_id and a.created_by=auth.uid())) with check (exists (select 1 from public.applications a where a.id=form_versions.application_id and a.created_by=auth.uid()));
create policy "form_versions_delete_own" on public.form_versions for delete using (exists (select 1 from public.applications a where a.id=form_versions.application_id and a.created_by=auth.uid()));
create policy "questions_select_own" on public.questions for select using (exists (select 1 from public.form_versions v join public.applications a on a.id=v.application_id where v.id=questions.form_version_id and a.created_by=auth.uid()));
create policy "questions_insert_own" on public.questions for insert with check (exists (select 1 from public.form_versions v join public.applications a on a.id=v.application_id where v.id=questions.form_version_id and a.created_by=auth.uid()));
create policy "questions_update_own" on public.questions for update using (exists (select 1 from public.form_versions v join public.applications a on a.id=v.application_id where v.id=questions.form_version_id and a.created_by=auth.uid())) with check (exists (select 1 from public.form_versions v join public.applications a on a.id=v.application_id where v.id=questions.form_version_id and a.created_by=auth.uid()));
create policy "questions_delete_own" on public.questions for delete using (exists (select 1 from public.form_versions v join public.applications a on a.id=v.application_id where v.id=questions.form_version_id and a.created_by=auth.uid()));
create policy "question_options_select_own" on public.question_options for select using (exists (select 1 from public.questions q join public.form_versions v on v.id=q.form_version_id join public.applications a on a.id=v.application_id where q.id=question_options.question_id and a.created_by=auth.uid()));
create policy "question_options_insert_own" on public.question_options for insert with check (exists (select 1 from public.questions q join public.form_versions v on v.id=q.form_version_id join public.applications a on a.id=v.application_id where q.id=question_options.question_id and a.created_by=auth.uid()));
create policy "question_options_update_own" on public.question_options for update using (exists (select 1 from public.questions q join public.form_versions v on v.id=q.form_version_id join public.applications a on a.id=v.application_id where q.id=question_options.question_id and a.created_by=auth.uid())) with check (exists (select 1 from public.questions q join public.form_versions v on v.id=q.form_version_id join public.applications a on a.id=v.application_id where q.id=question_options.question_id and a.created_by=auth.uid()));
create policy "question_options_delete_own" on public.question_options for delete using (exists (select 1 from public.questions q join public.form_versions v on v.id=q.form_version_id join public.applications a on a.id=v.application_id where q.id=question_options.question_id and a.created_by=auth.uid()));
grant select,insert,update,delete on public.form_versions to authenticated;
grant select,insert,update,delete on public.questions to authenticated;
grant select,insert,update,delete on public.question_options to authenticated;


create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  form_version_id uuid not null references public.form_versions(id) on delete restrict,
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  status text not null default 'submitted' check (status in ('draft','submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  unique(submission_id, question_id)
);
create index if not exists applicants_application_id_idx on public.applicants(application_id);
create index if not exists submissions_application_id_idx on public.submissions(application_id);
create index if not exists submissions_applicant_id_idx on public.submissions(applicant_id);
create index if not exists answers_submission_id_idx on public.answers(submission_id);
alter table public.applicants enable row level security;
alter table public.submissions enable row level security;
alter table public.answers enable row level security;
grant select on public.applicants to authenticated;
grant select,insert,update on public.submissions to authenticated;
grant select,insert,update on public.answers to authenticated;
create policy "applicants_owner_select" on public.applicants for select to authenticated using (exists(select 1 from public.applications a where a.id=application_id and a.created_by=auth.uid()));
create policy "submissions_owner_select" on public.submissions for select to authenticated using (exists(select 1 from public.applications a where a.id=application_id and a.created_by=auth.uid()));
create policy "submissions_owner_insert" on public.submissions for insert to authenticated with check (exists(select 1 from public.applications a where a.id=application_id and a.created_by=auth.uid()));
create policy "submissions_owner_update" on public.submissions for update to authenticated using (exists(select 1 from public.applications a where a.id=application_id and a.created_by=auth.uid())) with check (exists(select 1 from public.applications a where a.id=application_id and a.created_by=auth.uid()));
create policy "answers_owner_select" on public.answers for select to authenticated using (exists(select 1 from public.submissions s join public.applications a on a.id=s.application_id where s.id=submission_id and a.created_by=auth.uid()));
create policy "answers_owner_insert" on public.answers for insert to authenticated with check (exists(select 1 from public.submissions s join public.applications a on a.id=s.application_id where s.id=submission_id and a.created_by=auth.uid()));
create policy "answers_owner_update" on public.answers for update to authenticated using (exists(select 1 from public.submissions s join public.applications a on a.id=s.application_id where s.id=submission_id and a.created_by=auth.uid())) with check (exists(select 1 from public.submissions s join public.applications a on a.id=s.application_id where s.id=submission_id and a.created_by=auth.uid()));
