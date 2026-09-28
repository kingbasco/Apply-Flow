-- Friendly, editable attendance check-in links.
-- Owner/Admin can create sessions and edit globally unique check-in slugs.

create or replace function public.normalize_attendance_slug(p_value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(trim(coalesce(p_value,''))), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.create_attendance_session(
  p_application_id uuid,
  p_title text,
  p_session_date date
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path=''
as $$
declare
  v_org_id uuid;
  v_role text;
  v_base text;
  v_slug text;
  v_row public.attendance_sessions;
  v_attempt integer:=0;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;
  if length(trim(coalesce(p_title,''))) < 2 then raise exception 'Enter a session title.'; end if;
  if p_session_date is null then raise exception 'Choose a session date.'; end if;

  select a.organization_id into v_org_id
  from public.applications a
  where a.id=p_application_id;

  if v_org_id is null then raise exception 'Programme not found.'; end if;

  select p.role::text into v_role
  from public.profiles p
  where p.id=auth.uid() and p.organization_id=v_org_id;

  if coalesce(v_role,'') not in ('owner','admin') then
    raise exception 'Only an Owner or Admin can create attendance sessions.';
  end if;

  v_base:=left(public.normalize_attendance_slug(p_title),36);
  if length(v_base)<2 then v_base:='session'; end if;

  loop
    v_attempt:=v_attempt+1;
    v_slug:=v_base||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,4);
    exit when not exists(select 1 from public.attendance_sessions s where s.check_in_slug=v_slug);
    if v_attempt>12 then raise exception 'Could not generate a unique attendance link. Please try again.'; end if;
  end loop;

  insert into public.attendance_sessions(
    organization_id,application_id,title,session_date,created_by,check_in_slug
  ) values (
    v_org_id,p_application_id,trim(p_title),p_session_date,auth.uid(),v_slug
  )
  returning * into v_row;

  return v_row;
end
$$;

create or replace function public.update_attendance_checkin_slug(
  p_session_id uuid,
  p_slug text
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row public.attendance_sessions;
  v_role text;
  v_slug text;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;

  select s.* into v_row
  from public.attendance_sessions s
  where s.id=p_session_id;

  if v_row.id is null then raise exception 'Attendance session not found.'; end if;

  select p.role::text into v_role
  from public.profiles p
  where p.id=auth.uid() and p.organization_id=v_row.organization_id;

  if coalesce(v_role,'') not in ('owner','admin') then
    raise exception 'Only an Owner or Admin can edit the attendance link.';
  end if;

  v_slug:=public.normalize_attendance_slug(p_slug);
  if length(v_slug)<3 or length(v_slug)>48 then
    raise exception 'Link name must be 3–48 characters.';
  end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Use only letters, numbers, and hyphens.';
  end if;

  if exists(
    select 1 from public.attendance_sessions s
    where s.check_in_slug=v_slug and s.id<>p_session_id
  ) then
    raise exception 'That attendance link is already in use. Choose another.';
  end if;

  update public.attendance_sessions
  set check_in_slug=v_slug
  where id=p_session_id
  returning * into v_row;

  return v_row;
end
$$;

revoke all on function public.create_attendance_session(uuid,text,date) from public,anon;
revoke all on function public.update_attendance_checkin_slug(uuid,text) from public,anon;
grant execute on function public.create_attendance_session(uuid,text,date) to authenticated;
grant execute on function public.update_attendance_checkin_slug(uuid,text) to authenticated;
