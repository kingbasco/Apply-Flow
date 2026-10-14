-- Allow multiple reusable certificate templates per organization.
-- Preserves the existing certificate row as the first saved template.

alter table public.certificate_settings
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists name text not null default 'Certificate Template',
  add column if not exists created_at timestamptz not null default now();

update public.certificate_settings
set id=gen_random_uuid()
where id is null;

alter table public.certificate_settings
  alter column id set not null;

alter table public.certificate_settings
  drop constraint if exists certificate_settings_pkey;

alter table public.certificate_settings
  add constraint certificate_settings_pkey primary key (id);

create index if not exists certificate_settings_organization_updated_idx
  on public.certificate_settings(organization_id,updated_at desc);

notify pgrst, 'reload schema';
