-- Allow programme deletion to cascade through immutable published forms
-- only through the authenticated, authorization-checked delete RPC.

create or replace function private.prevent_published_form_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if tg_table_name='form_versions' then
    if old.status='published' and tg_op='UPDATE' then
      raise exception 'Published form versions are immutable.';
    end if;
    if old.status='published' and tg_op='DELETE'
      and coalesce(current_setting('app.allow_published_form_delete', true),'off') <> 'on' then
      raise exception 'Published form versions are immutable.';
    end if;
  elsif tg_table_name='questions' then
    if exists(
      select 1 from public.form_versions v
      where v.id=old.form_version_id and v.status='published'
    ) then
      if tg_op='UPDATE'
        or (tg_op='DELETE' and coalesce(current_setting('app.allow_published_form_delete', true),'off') <> 'on') then
        raise exception 'Published form questions are immutable. Create a new form version.';
      end if;
    end if;
  elsif tg_table_name='question_options' then
    if exists(
      select 1
      from public.questions q
      join public.form_versions v on v.id=q.form_version_id
      where q.id=old.question_id and v.status='published'
    ) then
      if tg_op='UPDATE'
        or (tg_op='DELETE' and coalesce(current_setting('app.allow_published_form_delete', true),'off') <> 'on') then
        raise exception 'Published question options are immutable. Create a new form version.';
      end if;
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$function$;

create or replace function public.delete_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_created_by uuid;
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select created_by, organization_id
    into v_created_by, v_org_id
  from public.applications
  where id = p_application_id;

  if not found then
    raise exception 'Application not found.';
  end if;

  if v_created_by <> auth.uid() and not private.is_org_admin(v_org_id) then
    raise exception 'You do not have permission to delete this application.';
  end if;

  perform set_config('app.allow_published_form_delete','on',true);
  delete from public.applications where id = p_application_id;
end;
$function$;

revoke execute on function public.delete_application(uuid) from public, anon;
grant execute on function public.delete_application(uuid) to authenticated;
