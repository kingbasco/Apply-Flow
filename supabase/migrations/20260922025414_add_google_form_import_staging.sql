create table if not exists public.form_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  source_type text not null default 'google_forms_csv' check (source_type='google_forms_csv'),
  file_name text not null,
  question_headers jsonb not null default '[]'::jsonb,
  row_count integer not null default 0 check (row_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'previewed' check (status in ('previewed','ready','imported','failed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.form_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.form_import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(batch_id,row_number)
);

alter table public.form_import_batches enable row level security;
alter table public.form_import_rows enable row level security;

drop policy if exists "Members can view form import batches" on public.form_import_batches;
create policy "Members can view form import batches" on public.form_import_batches for select to authenticated using (private.is_org_member(organization_id));

drop policy if exists "Members can create form import batches" on public.form_import_batches;
create policy "Members can create form import batches" on public.form_import_batches for insert to authenticated with check (private.is_org_member(organization_id) and created_by=(select auth.uid()));

drop policy if exists "Members can update form import batches" on public.form_import_batches;
create policy "Members can update form import batches" on public.form_import_batches for update to authenticated using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id));

drop policy if exists "Members can view form import rows" on public.form_import_rows;
create policy "Members can view form import rows" on public.form_import_rows for select to authenticated using (exists (select 1 from public.form_import_batches b where b.id=form_import_rows.batch_id and private.is_org_member(b.organization_id)));

drop policy if exists "Members can create form import rows" on public.form_import_rows;
create policy "Members can create form import rows" on public.form_import_rows for insert to authenticated with check (exists (select 1 from public.form_import_batches b where b.id=form_import_rows.batch_id and private.is_org_member(b.organization_id)));

create index if not exists form_import_batches_application_id_idx on public.form_import_batches(application_id);
create index if not exists form_import_rows_batch_id_idx on public.form_import_rows(batch_id);