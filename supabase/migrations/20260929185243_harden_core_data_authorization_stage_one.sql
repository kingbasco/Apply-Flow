-- Harden core programme/application data authorization.

-- Keep the existing Google Form import implementation private and expose only
-- an Owner/Admin-checked wrapper through the Data API.
alter function public.import_google_form_batch(uuid) set schema private;
alter function private.import_google_form_batch(uuid) rename to import_google_form_batch_internal;

revoke all on function private.import_google_form_batch_internal(uuid) from public, anon, authenticated;

create function public.import_google_form_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select organization_id
    into v_org_id
  from public.form_import_batches
  where id = p_batch_id;

  if v_org_id is null then
    raise exception 'Import batch not found';
  end if;

  if not private.is_org_admin(v_org_id) then
    raise exception 'Only an Owner or Admin can import application data.';
  end if;

  return private.import_google_form_batch_internal(p_batch_id);
end;
$$;

revoke all on function public.import_google_form_batch(uuid) from public, anon, authenticated;
grant execute on function public.import_google_form_batch(uuid) to authenticated, service_role;

-- Only Owner/Admin users may assign reviews, and the target must be Programme
-- Staff in the same workspace.
create or replace function private.assign_review_submission(
  p_submission_id uuid,
  p_reviewer_id uuid
)
returns public.review_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_row public.review_assignments;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select a.organization_id
    into v_org_id
  from public.submissions s
  join public.applications a on a.id = s.application_id
  where s.id = p_submission_id;

  if v_org_id is null then
    raise exception 'Submission not found';
  end if;

  if not private.is_org_admin(v_org_id) then
    raise exception 'Only workspace admins can assign reviews';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_reviewer_id
      and p.organization_id = v_org_id
      and p.role = 'reviewer'
  ) then
    raise exception 'Reviewer must be Programme Staff in this workspace';
  end if;

  insert into public.review_assignments(submission_id, reviewer_id, status)
  values (p_submission_id, p_reviewer_id, 'assigned')
  on conflict(submission_id, reviewer_id)
  do update set status='assigned', updated_at=now()
  returning * into v_row;

  insert into public.review_audit_logs(
    review_assignment_id,
    action,
    to_status,
    actor_id,
    organization_id,
    metadata
  )
  values (
    v_row.id,
    'assigned',
    v_row.status,
    (select auth.uid()),
    v_org_id,
    jsonb_build_object('reviewer_id', p_reviewer_id)
  );

  return v_row;
end;
$$;

-- Correct the application join in the admin review UPDATE policy and keep the
-- assigned reviewer constrained to Programme Staff in the same workspace.
drop policy if exists review_assignments_admin_update on public.review_assignments;

create policy review_assignments_admin_update
on public.review_assignments
for update
to authenticated
using (
  exists (
    select 1
    from public.submissions s
    join public.applications a on a.id = s.application_id
    where s.id = review_assignments.submission_id
      and private.is_org_admin(a.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.submissions s
    join public.applications a on a.id = s.application_id
    where s.id = review_assignments.submission_id
      and private.is_org_admin(a.organization_id)
  )
  and exists (
    select 1
    from public.profiles p
    join public.submissions s on s.id = review_assignments.submission_id
    join public.applications a on a.id = s.application_id
    where p.id = review_assignments.reviewer_id
      and p.organization_id = a.organization_id
      and p.role = 'reviewer'
  )
);

-- New public objects created by the normal migration owner are private to
-- browser roles by default. Future migrations must opt in with explicit grants.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, public;
