-- Only workspace Owner/Admin may delete programmes.
-- Programme Staff must never be able to delete an application, even if they originally created it.

drop policy if exists "applications_org_delete" on public.applications;

create policy "applications_org_delete"
on public.applications
for delete
to authenticated
using (private.is_org_admin(organization_id));

create or replace function public.delete_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select organization_id
    into v_org_id
  from public.applications
  where id = p_application_id;

  if not found then
    raise exception 'Application not found.';
  end if;

  if not private.is_org_admin(v_org_id) then
    raise exception 'Only an Owner or Admin can delete programmes.';
  end if;

  perform set_config('app.allow_published_form_delete','on',true);
  delete from public.applications where id = p_application_id;
end;
$function$;

revoke all on function public.delete_application(uuid) from public;
revoke all on function public.delete_application(uuid) from anon;
grant execute on function public.delete_application(uuid) to authenticated;
