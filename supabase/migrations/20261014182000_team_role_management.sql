-- Allow the workspace Owner to change existing team members between
-- Programme Staff (reviewer) and Admin without recreating the account.

create or replace function public.update_team_member_role(
  p_member_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_owner public.profiles;
  v_member public.profiles;
  v_role text:=pg_catalog.lower(pg_catalog.btrim(p_role));
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;

  select * into v_owner
  from public.profiles
  where id=auth.uid();

  if v_owner.id is null or v_owner.role<>'owner' or v_owner.organization_id is null then
    raise exception 'Only the workspace Owner can change team member roles';
  end if;

  if v_role not in ('admin','reviewer') then
    raise exception 'Role must be Admin or Programme Staff';
  end if;

  select * into v_member
  from public.profiles
  where id=p_member_id
    and organization_id=v_owner.organization_id
  for update;

  if v_member.id is null then
    raise exception 'Team member not found in this workspace';
  end if;

  if v_member.role='owner' then
    raise exception 'The workspace Owner role cannot be changed here';
  end if;

  update public.profiles
  set role=v_role,
      updated_at=now()
  where id=v_member.id;

  return pg_catalog.jsonb_build_object(
    'member_id',v_member.id,
    'previous_role',v_member.role,
    'role',v_role,
    'organization_id',v_owner.organization_id
  );
end;
$function$;

revoke all on function public.update_team_member_role(uuid,text) from public,anon;
grant execute on function public.update_team_member_role(uuid,text) to authenticated;

notify pgrst, 'reload schema';
