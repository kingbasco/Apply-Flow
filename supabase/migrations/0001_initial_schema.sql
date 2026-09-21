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