create table if not exists public.team_invite_links(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('admin','reviewer')),
  token text not null unique default encode(gen_random_bytes(24),'hex'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles(id),
  revoked_at timestamptz
);

alter table public.team_invite_links enable row level security;

drop policy if exists "Admins can view team invite links" on public.team_invite_links;
create policy "Admins can view team invite links"
on public.team_invite_links for select
using (private.is_org_admin(organization_id));

create or replace function public.create_team_invite_link(
  p_organization_id uuid,
  p_role text,
  p_expires_hours integer default 168
)
returns table(id uuid,token text,role text,expires_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_token text; v_expires timestamptz;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  if not private.is_org_admin(p_organization_id) then raise exception 'Only an Owner or Admin can create invitation links.'; end if;
  if p_role not in ('admin','reviewer') then raise exception 'Choose Admin or Programme Staff.'; end if;
  if p_expires_hours not between 1 and 720 then raise exception 'Expiry must be between 1 hour and 30 days.'; end if;
  v_expires:=now()+make_interval(hours=>p_expires_hours);
  insert into public.team_invite_links(organization_id,role,created_by,expires_at)
  values(p_organization_id,p_role,auth.uid(),v_expires)
  returning team_invite_links.id,team_invite_links.token into v_id,v_token;
  return query select v_id,v_token,p_role,v_expires;
end $$;
grant execute on function public.create_team_invite_link(uuid,text,integer) to authenticated;

create or replace function public.get_team_invite_link_details(p_token text)
returns table(organization_name text,role text,expires_at timestamptz,is_valid boolean,invalid_reason text)
language plpgsql security definer set search_path=''
as $$
declare v_link public.team_invite_links; v_org text;
begin
  select * into v_link from public.team_invite_links where token=p_token limit 1;
  if v_link.id is null then return query select null::text,null::text,null::timestamptz,false,'Invitation link not found.'::text; return; end if;
  select name into v_org from public.organizations where id=v_link.organization_id;
  if v_link.revoked_at is not null then
    return query select v_org,v_link.role,v_link.expires_at,false,'This invitation link has been revoked.'::text;
  elsif v_link.used_at is not null then
    return query select v_org,v_link.role,v_link.expires_at,false,'This invitation link has already been used.'::text;
  elsif v_link.expires_at<=now() then
    return query select v_org,v_link.role,v_link.expires_at,false,'This invitation link has expired.'::text;
  else
    return query select v_org,v_link.role,v_link.expires_at,true,null::text;
  end if;
end $$;
grant execute on function public.get_team_invite_link_details(text) to anon,authenticated;

create or replace function public.revoke_team_invite_link(p_link_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.team_invite_links where id=p_link_id;
  if v_org is null then raise exception 'Invitation link not found.'; end if;
  if not private.is_org_admin(v_org) then raise exception 'Only an Owner or Admin can revoke invitation links.'; end if;
  update public.team_invite_links set revoked_at=now() where id=p_link_id and used_at is null;
end $$;
grant execute on function public.revoke_team_invite_link(uuid) to authenticated;

create or replace function public.claim_team_invite_link(
  p_token text,p_user_id uuid,p_full_name text,p_username text,p_birth_month integer,p_birth_day integer,p_email text
)
returns public.profiles language plpgsql security definer set search_path=''
as $$
declare v_link public.team_invite_links; v_profile public.profiles; v_username text:=lower(trim(p_username));
begin
  if current_user not in ('service_role','postgres') then raise exception 'Not allowed.'; end if;
  update public.team_invite_links set used_at=now()
  where token=p_token and revoked_at is null and used_at is null and expires_at>now()
  returning * into v_link;
  if v_link.id is null then raise exception 'This invitation link is invalid, expired, revoked, or already used.'; end if;
  if length(trim(coalesce(p_full_name,'')))<2 then raise exception 'Enter your full name.'; end if;
  if v_username !~ '^[a-z0-9_]{3,30}$' then raise exception 'Username must be 3–30 characters and use only letters, numbers, or underscores.'; end if;
  if p_birth_month not between 1 and 12 or p_birth_day not between 1 and 31 then raise exception 'Select a valid date of birth.'; end if;
  if exists(select 1 from public.profiles where lower(username)=v_username and id<>p_user_id) then raise exception 'That username is already in use.'; end if;
  insert into public.profiles(id,full_name,username,birth_month,birth_day,email,organization_id,role,invitation_status,updated_at)
  values(p_user_id,trim(p_full_name),v_username,p_birth_month,p_birth_day,lower(trim(p_email)),v_link.organization_id,v_link.role,'active',now())
  on conflict(id) do update set full_name=excluded.full_name,username=excluded.username,birth_month=excluded.birth_month,birth_day=excluded.birth_day,email=excluded.email,organization_id=excluded.organization_id,role=excluded.role,invitation_status='active',updated_at=now()
  returning * into v_profile;
  update public.team_invite_links set used_by=p_user_id where id=v_link.id;
  return v_profile;
end $$;
revoke all on function public.claim_team_invite_link(text,uuid,text,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.claim_team_invite_link(text,uuid,text,text,integer,integer,text) to service_role;
