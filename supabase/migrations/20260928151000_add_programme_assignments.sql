-- ApplyFlow Phase 1: programme assignments foundation
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null,
  description text,
  instructions text,
  deadline timestamptz,
  max_score numeric(10,2) not null default 100 check (max_score > 0),
  status text not null default 'draft' check (status in ('draft','published','closed')),
  public_slug text not null unique,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assignment_questions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  type text not null check (type in ('short_text','long_text','number','single_choice','multiple_choice','file','url')),
  label text not null,
  description text,
  required boolean not null default true,
  position integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assignments_organization_id_idx on public.assignments(organization_id);
create index if not exists assignments_application_id_idx on public.assignments(application_id);
create index if not exists assignment_questions_assignment_id_idx on public.assignment_questions(assignment_id);

alter table public.assignments enable row level security;
alter table public.assignment_questions enable row level security;

create policy "assignment_staff_select" on public.assignments for select to authenticated using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=assignments.organization_id and p.role in ('owner','admin','reviewer'))
);
create policy "assignment_staff_insert" on public.assignments for insert to authenticated with check (
  created_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=assignments.organization_id and p.role in ('owner','admin','reviewer'))
  and exists(select 1 from public.applications a where a.id=assignments.application_id and a.organization_id=assignments.organization_id)
);
create policy "assignment_staff_update" on public.assignments for update to authenticated using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=assignments.organization_id and p.role in ('owner','admin','reviewer'))
) with check (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=assignments.organization_id and p.role in ('owner','admin','reviewer'))
);
create policy "assignment_admin_delete" on public.assignments for delete to authenticated using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=assignments.organization_id and p.role in ('owner','admin'))
);

create policy "assignment_questions_staff_select" on public.assignment_questions for select to authenticated using (
  exists(select 1 from public.assignments a join public.profiles p on p.organization_id=a.organization_id where a.id=assignment_questions.assignment_id and p.id=auth.uid() and p.role in ('owner','admin','reviewer'))
);
create policy "assignment_questions_staff_insert" on public.assignment_questions for insert to authenticated with check (
  exists(select 1 from public.assignments a join public.profiles p on p.organization_id=a.organization_id where a.id=assignment_questions.assignment_id and a.status='draft' and p.id=auth.uid() and p.role in ('owner','admin','reviewer'))
);
create policy "assignment_questions_staff_update" on public.assignment_questions for update to authenticated using (
  exists(select 1 from public.assignments a join public.profiles p on p.organization_id=a.organization_id where a.id=assignment_questions.assignment_id and a.status='draft' and p.id=auth.uid() and p.role in ('owner','admin','reviewer'))
) with check (
  exists(select 1 from public.assignments a join public.profiles p on p.organization_id=a.organization_id where a.id=assignment_questions.assignment_id and a.status='draft' and p.id=auth.uid() and p.role in ('owner','admin','reviewer'))
);
create policy "assignment_questions_staff_delete" on public.assignment_questions for delete to authenticated using (
  exists(select 1 from public.assignments a join public.profiles p on p.organization_id=a.organization_id where a.id=assignment_questions.assignment_id and a.status='draft' and p.id=auth.uid() and p.role in ('owner','admin','reviewer'))
);

grant select,insert,update,delete on public.assignments to authenticated;
grant select,insert,update,delete on public.assignment_questions to authenticated;
