alter table public.organizations
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('organization-avatars', 'organization-avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Organisation avatars are publicly readable" on storage.objects;
create policy "Organisation avatars are publicly readable"
on storage.objects for select
to public
using (bucket_id = 'organization-avatars');

drop policy if exists "Organisation admins can upload avatars" on storage.objects;
create policy "Organisation admins can upload avatars"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'organization-avatars'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.organization_id::text = (storage.foldername(name))[1]
      and p.role in ('owner','admin')
  )
);

drop policy if exists "Organisation admins can update avatars" on storage.objects;
create policy "Organisation admins can update avatars"
on storage.objects for update
to authenticated
using (
  bucket_id = 'organization-avatars'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.organization_id::text = (storage.foldername(name))[1]
      and p.role in ('owner','admin')
  )
)
with check (
  bucket_id = 'organization-avatars'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.organization_id::text = (storage.foldername(name))[1]
      and p.role in ('owner','admin')
  )
);

drop policy if exists "Organisation admins can delete avatars" on storage.objects;
create policy "Organisation admins can delete avatars"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'organization-avatars'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.organization_id::text = (storage.foldername(name))[1]
      and p.role in ('owner','admin')
  )
);