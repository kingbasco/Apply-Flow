-- Enforce team hierarchy at the server boundary: Admins may invite Programme
-- Staff, but only the workspace Owner may create or revoke Admin invitations.

create or replace function public.create_team_invite_link(
  p_organization_id uuid,
  p_role text,
  p_expires_hours integer default 168
)
returns table(id uuid, token text, role text, expires_at timestamptz)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_token text;
  v_expires timestamptz;
  v_actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;

  select p.role into v_actor_role
  from public.profiles p
  where p.id=auth.uid()
    and p.organization_id=p_organization_id;

  if v_actor_role not in ('owner','admin') then
    raise exception 'Only an Owner or Admin can create invitation links.';
  end if;

  if p_role not in ('admin','reviewer') then
    raise exception 'Choose Admin or Programme Staff.';
  end if;

  if p_role='admin' and v_actor_role<>'owner' then
    raise exception 'Only the workspace Owner can invite an Admin.';
  end if;

  if p_expires_hours not between 1 and 720 then
    raise exception 'Expiry must be between 1 hour and 30 days.';
  end if;

  v_expires:=now()+make_interval(hours=>p_expires_hours);

  insert into public.team_invite_links(organization_id,role,created_by,expires_at)
  values(p_organization_id,p_role,auth.uid(),v_expires)
  returning team_invite_links.id,team_invite_links.token into v_id,v_token;

  return query select v_id,v_token,p_role,v_expires;
end;
$$;

create or replace function public.revoke_team_invite_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_org uuid;
  v_link_role text;
  v_actor_role text;
begin
  select organization_id,role into v_org,v_link_role
  from public.team_invite_links
  where id=p_link_id;

  if v_org is null then raise exception 'Invitation link not found.'; end if;

  select p.role into v_actor_role
  from public.profiles p
  where p.id=auth.uid()
    and p.organization_id=v_org;

  if v_actor_role not in ('owner','admin') then
    raise exception 'Only an Owner or Admin can revoke invitation links.';
  end if;

  if v_link_role='admin' and v_actor_role<>'owner' then
    raise exception 'Only the workspace Owner can revoke an Admin invitation.';
  end if;

  update public.team_invite_links
  set revoked_at=now()
  where id=p_link_id and used_at is null;
end;
$$;
