-- Require an active Supabase Auth session for organisation-level authorization.
-- This blocks access tokens from revoked/signed-out sessions immediately at the
-- database helper layer instead of trusting them until JWT expiry.

create or replace function private.has_active_user_session()
returns boolean
language sql
stable
security definer
set search_path='pg_catalog','auth'
as $$
  select
    auth.uid() is not null
    and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false
    and coalesce(auth.jwt()->>'session_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists(
      select 1
      from auth.sessions s
      where s.id=(auth.jwt()->>'session_id')::uuid
        and s.user_id=auth.uid()
        and (s.not_after is null or s.not_after>now())
    )
$$;

revoke all on function private.has_active_user_session() from public,anon,authenticated;

create or replace function private.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path='pg_catalog','public','private'
as $$
  select private.has_active_user_session()
    and p_org is not null
    and exists(
      select 1
      from public.profiles p
      where p.id=(select auth.uid())
        and p.organization_id=p_org
        and p.role in ('owner','admin')
    )
$$;

create or replace function private.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path='pg_catalog','public','private'
as $$
  select private.has_active_user_session()
    and p_org is not null
    and exists(
      select 1
      from public.profiles p
      where p.id=(select auth.uid())
        and p.organization_id=p_org
    )
$$;

create or replace function public.current_session_is_active()
returns boolean
language sql
stable
security definer
set search_path='private'
as $$
  select private.has_active_user_session()
$$;

revoke all on function public.current_session_is_active() from public,anon,authenticated;
grant execute on function public.current_session_is_active() to authenticated,service_role;
