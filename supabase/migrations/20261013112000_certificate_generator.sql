-- Certificate generator settings and private design assets.
-- Admin/Owner only. Participant data is not stored in this feature; recipient
-- names are pasted into the browser and used only during export.

create table if not exists public.certificate_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  template_path text,
  template_mime_type text,
  font_path text,
  font_family text not null default 'CertificateName',
  x_percent numeric not null default 50 check (x_percent between 0 and 100),
  y_percent numeric not null default 58 check (y_percent between 0 and 100),
  font_size numeric not null default 72 check (font_size between 8 and 300),
  max_width_percent numeric not null default 72 check (max_width_percent between 10 and 100),
  color text not null default '#111827' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now()
);

alter table public.certificate_settings enable row level security;
grant select,insert,update,delete on public.certificate_settings to authenticated;

drop policy if exists "certificate settings read admins" on public.certificate_settings;
create policy "certificate settings read admins"
on public.certificate_settings
for select to authenticated
using (
  private.has_active_user_session()
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.organization_id=certificate_settings.organization_id
      and p.role in ('owner','admin')
  )
);

drop policy if exists "certificate settings insert admins" on public.certificate_settings;
create policy "certificate settings insert admins"
on public.certificate_settings
for insert to authenticated
with check (
  private.has_active_user_session()
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.organization_id=certificate_settings.organization_id
      and p.role in ('owner','admin')
  )
);

drop policy if exists "certificate settings update admins" on public.certificate_settings;
create policy "certificate settings update admins"
on public.certificate_settings
for update to authenticated
using (
  private.has_active_user_session()
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.organization_id=certificate_settings.organization_id
      and p.role in ('owner','admin')
  )
)
with check (
  private.has_active_user_session()
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.organization_id=certificate_settings.organization_id
      and p.role in ('owner','admin')
  )
);

drop policy if exists "certificate settings delete admins" on public.certificate_settings;
create policy "certificate settings delete admins"
on public.certificate_settings
for delete to authenticated
using (
  private.has_active_user_session()
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.organization_id=certificate_settings.organization_id
      and p.role in ('owner','admin')
  )
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'certificate-assets',
  'certificate-assets',
  false,
  20971520,
  array[
    'image/png','image/jpeg','image/svg+xml',
    'font/ttf','font/otf','application/x-font-ttf','application/x-font-opentype',
    'application/font-sfnt','application/octet-stream'
  ]::text[]
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "certificate assets read admins" on storage.objects;
create policy "certificate assets read admins"
on storage.objects
for select to authenticated
using (
  bucket_id='certificate-assets'
  and private.has_active_user_session()
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.role in ('owner','admin')
      and p.organization_id::text=(storage.foldername(name))[1]
  )
);

drop policy if exists "certificate assets insert admins" on storage.objects;
create policy "certificate assets insert admins"
on storage.objects
for insert to authenticated
with check (
  bucket_id='certificate-assets'
  and private.has_active_user_session()
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.role in ('owner','admin')
      and p.organization_id::text=(storage.foldername(name))[1]
  )
);

drop policy if exists "certificate assets update admins" on storage.objects;
create policy "certificate assets update admins"
on storage.objects
for update to authenticated
using (
  bucket_id='certificate-assets'
  and private.has_active_user_session()
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.role in ('owner','admin')
      and p.organization_id::text=(storage.foldername(name))[1]
  )
)
with check (
  bucket_id='certificate-assets'
  and private.has_active_user_session()
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.role in ('owner','admin')
      and p.organization_id::text=(storage.foldername(name))[1]
  )
);

drop policy if exists "certificate assets delete admins" on storage.objects;
create policy "certificate assets delete admins"
on storage.objects
for delete to authenticated
using (
  bucket_id='certificate-assets'
  and private.has_active_user_session()
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.role in ('owner','admin')
      and p.organization_id::text=(storage.foldername(name))[1]
  )
);
