create or replace function public.accept_team_invite_link(
  p_token text,
  p_full_name text,
  p_username text,
  p_birth_month integer,
  p_birth_day integer
)
returns public.profiles
language plpgsql security definer set search_path=''
as $$
declare
  v_link public.team_invite_links;
  v_profile public.profiles;
  v_username text:=lower(trim(p_username));
  v_email text;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  update public.team_invite_links set used_at=now()
  where token=p_token and revoked_at is null and used_at is null and expires_at>now()
  returning * into v_link;
  if v_link.id is null then raise exception 'This invitation link is invalid, expired, revoked, or already used.'; end if;
  if length(trim(coalesce(p_full_name,'')))<2 then raise exception 'Enter your full name.'; end if;
  if v_username !~ '^[a-z0-9_]{3,30}$' then raise exception 'Username must be 3–30 characters and use only letters, numbers, or underscores.'; end if;
  if p_birth_month not between 1 and 12 or p_birth_day not between 1 and 31 then raise exception 'Select a valid date of birth.'; end if;
  if exists(select 1 from public.profiles where lower(username)=v_username and id<>auth.uid()) then raise exception 'That username is already in use.'; end if;
  select email into v_email from auth.users where id=auth.uid();
  insert into public.profiles(id,full_name,username,birth_month,birth_day,email,organization_id,role,invitation_status,updated_at)
  values(auth.uid(),trim(p_full_name),v_username,p_birth_month,p_birth_day,v_email,v_link.organization_id,v_link.role,'active',now())
  on conflict(id) do update set full_name=excluded.full_name,username=excluded.username,birth_month=excluded.birth_month,birth_day=excluded.birth_day,email=excluded.email,organization_id=excluded.organization_id,role=excluded.role,invitation_status='active',updated_at=now()
  returning * into v_profile;
  update public.team_invite_links set used_by=auth.uid() where id=v_link.id;
  return v_profile;
end $$;
grant execute on function public.accept_team_invite_link(text,text,text,integer,integer) to authenticated;
