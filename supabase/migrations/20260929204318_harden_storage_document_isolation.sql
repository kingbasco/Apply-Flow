-- Harden private document isolation and give Owner/Admin users a safe Storage
-- cleanup path before deleting programmes or assignments.

drop policy if exists "assignment documents staff read" on storage.objects;
drop policy if exists "assignment documents scoped staff read" on storage.objects;

create policy "assignment documents scoped staff read"
on storage.objects
for select
to authenticated
using (
  bucket_id='application-files'
  and (storage.foldername(name))[1]='assignment-submissions'
  and exists (
    select 1
    from public.assignment_documents d
    join public.assignment_submissions s on s.id=d.submission_id
    where d.storage_bucket=storage.objects.bucket_id
      and d.storage_path=storage.objects.name
      and (
        exists (
          select 1
          from public.profiles p
          where p.id=(select auth.uid())
            and p.organization_id=d.organization_id
            and p.role in ('owner','admin')
        )
        or exists (
          select 1
          from public.participant_staff_assignments psa
          where psa.participant_id=s.participant_id
            and psa.staff_id=(select auth.uid())
        )
      )
  )
);

drop policy if exists "Avatar images are publicly readable" on storage.objects;
drop policy if exists "Organisation avatars are publicly readable" on storage.objects;

drop policy if exists "Organisation admins can read avatar metadata" on storage.objects;
create policy "Organisation admins can read avatar metadata"
on storage.objects
for select
to authenticated
using (
  bucket_id='organization-avatars'
  and exists (
    select 1
    from public.profiles p
    where p.id=(select auth.uid())
      and p.organization_id::text=(storage.foldername(storage.objects.name))[1]
      and p.role in ('owner','admin')
  )
);

drop policy if exists "Programme admins can inspect application files" on storage.objects;
create policy "Programme admins can inspect application files"
on storage.objects
for select
to authenticated
using (
  bucket_id='application-files'
  and (
    (
      (storage.foldername(name))[1]='public-submissions'
      and exists (
        select 1
        from public.applications a
        where a.id::text=(storage.foldername(storage.objects.name))[2]
          and private.is_org_admin(a.organization_id)
      )
    )
    or
    (
      (storage.foldername(name))[1]='assignment-submissions'
      and exists (
        select 1
        from public.assignments a
        where a.id::text=(storage.foldername(storage.objects.name))[2]
          and private.is_org_admin(a.organization_id)
      )
    )
  )
);

drop policy if exists "Programme admins can delete application files" on storage.objects;
create policy "Programme admins can delete application files"
on storage.objects
for delete
to authenticated
using (
  bucket_id='application-files'
  and (
    (
      (storage.foldername(name))[1]='public-submissions'
      and exists (
        select 1
        from public.applications a
        where a.id::text=(storage.foldername(storage.objects.name))[2]
          and private.is_org_admin(a.organization_id)
      )
    )
    or
    (
      (storage.foldername(name))[1]='assignment-submissions'
      and exists (
        select 1
        from public.assignments a
        where a.id::text=(storage.foldername(storage.objects.name))[2]
          and private.is_org_admin(a.organization_id)
      )
    )
  )
);

create or replace function public.list_assignment_storage_paths(p_assignment_id uuid)
returns table(storage_bucket text, storage_path text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select a.organization_id into v_org_id from public.assignments a where a.id=p_assignment_id;
  if v_org_id is null then raise exception 'Assignment not found'; end if;
  if not private.is_org_admin(v_org_id) then
    raise exception 'Only an Owner or Admin can manage assignment files.';
  end if;

  return query
  select o.bucket_id::text,o.name::text
  from storage.objects o
  where o.bucket_id='application-files'
    and (storage.foldername(o.name))[1]='assignment-submissions'
    and (storage.foldername(o.name))[2]=p_assignment_id::text;
end;
$$;

revoke all on function public.list_assignment_storage_paths(uuid) from public,anon,authenticated;
grant execute on function public.list_assignment_storage_paths(uuid) to authenticated,service_role;

create or replace function public.list_programme_storage_paths(p_application_id uuid)
returns table(storage_bucket text, storage_path text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select a.organization_id into v_org_id from public.applications a where a.id=p_application_id;
  if v_org_id is null then raise exception 'Programme not found'; end if;
  if not private.is_org_admin(v_org_id) then
    raise exception 'Only an Owner or Admin can manage programme files.';
  end if;

  return query
  select o.bucket_id::text,o.name::text
  from storage.objects o
  where o.bucket_id='application-files'
    and (
      (
        (storage.foldername(o.name))[1]='public-submissions'
        and (storage.foldername(o.name))[2]=p_application_id::text
      )
      or (
        (storage.foldername(o.name))[1]='assignment-submissions'
        and exists (
          select 1
          from public.assignments a
          where a.id::text=(storage.foldername(o.name))[2]
            and a.application_id=p_application_id
        )
      )
    );
end;
$$;

revoke all on function public.list_programme_storage_paths(uuid) from public,anon,authenticated;
grant execute on function public.list_programme_storage_paths(uuid) to authenticated,service_role;
