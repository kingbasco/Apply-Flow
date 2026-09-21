create extension if not exists "pgcrypto";

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  full_name text,
  role text not null default 'reviewer' check (role in ('owner','admin','reviewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','published','screening','closed','completed')),
  deadline timestamptz,
  target_selected integer not null default 0 check (target_selected >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index if not exists applications_org_idx on public.applications(organization_id);
create index if not exists applications_status_idx on public.applications(status);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.applications enable row level security;

create policy "members can view their organization"
on public.organizations for select
using (id in (select organization_id from public.profiles where id = auth.uid()));

create policy "members can view organization profiles"
on public.profiles for select
using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create policy "members can view organization applications"
on public.applications for select
using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

create policy "admins can manage organization applications"
on public.applications for all
using (
  organization_id in (
    select organization_id from public.profiles
    where id = auth.uid() and role in ('owner','admin')
  )
)
with check (
  organization_id in (
    select organization_id from public.profiles
    where id = auth.uid() and role in ('owner','admin')
  )
);

-- Future phases add form versions, applicants, submissions, answers,
-- documents, eligibility, scoring, AI assessments, reviews, selections,
-- notifications and audit logs.