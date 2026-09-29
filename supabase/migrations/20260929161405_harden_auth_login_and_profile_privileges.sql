create table if not exists private.auth_login_rate_limits (
  key_hash text primary key,
  failure_count integer not null default 0 check (failure_count >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  last_attempt_at timestamptz not null default now(),
  constraint auth_login_rate_limits_key_hash_check check (key_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists auth_login_rate_limits_last_attempt_idx
  on private.auth_login_rate_limits(last_attempt_at);

revoke all on table private.auth_login_rate_limits from public, anon, authenticated;

create or replace function public.check_login_rate_limit(
  p_key_hash text,
  p_limit integer default 5,
  p_window_seconds integer default 900,
  p_block_seconds integer default 900
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.auth_login_rate_limits%rowtype;
  v_now timestamptz := now();
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'Not allowed.';
  end if;
  if p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit not between 1 and 1000
     or p_window_seconds not between 60 and 86400
     or p_block_seconds not between 60 and 86400 then
    raise exception 'Invalid rate limit parameters.';
  end if;

  select * into v_row
  from private.auth_login_rate_limits
  where key_hash = p_key_hash;

  if not found then
    return query select true, 0;
    return;
  end if;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return query
      select false, greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer);
    return;
  end if;

  if v_row.window_started_at < v_now - make_interval(secs => p_window_seconds) then
    update private.auth_login_rate_limits
      set failure_count = 0,
          window_started_at = v_now,
          blocked_until = null,
          last_attempt_at = v_now
    where key_hash = p_key_hash;
  end if;

  return query select true, 0;
end;
$$;

create or replace function public.record_login_rate_limit(
  p_key_hash text,
  p_success boolean,
  p_limit integer default 5,
  p_window_seconds integer default 900,
  p_block_seconds integer default 900
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.auth_login_rate_limits%rowtype;
  v_now timestamptz := now();
  v_count integer;
  v_window_started timestamptz;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'Not allowed.';
  end if;
  if p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit not between 1 and 1000
     or p_window_seconds not between 60 and 86400
     or p_block_seconds not between 60 and 86400 then
    raise exception 'Invalid rate limit parameters.';
  end if;

  if p_success then
    delete from private.auth_login_rate_limits where key_hash = p_key_hash;
    return;
  end if;

  insert into private.auth_login_rate_limits(
    key_hash, failure_count, window_started_at, blocked_until, last_attempt_at
  )
  values (p_key_hash, 0, v_now, null, v_now)
  on conflict (key_hash) do nothing;

  select * into v_row
  from private.auth_login_rate_limits
  where key_hash = p_key_hash
  for update;

  if v_row.window_started_at < v_now - make_interval(secs => p_window_seconds) then
    v_count := 1;
    v_window_started := v_now;
  else
    v_count := v_row.failure_count + 1;
    v_window_started := v_row.window_started_at;
  end if;

  update private.auth_login_rate_limits
  set failure_count = v_count,
      window_started_at = v_window_started,
      blocked_until = case
        when v_count >= p_limit then v_now + make_interval(secs => p_block_seconds)
        else null
      end,
      last_attempt_at = v_now
  where key_hash = p_key_hash;

  delete from private.auth_login_rate_limits
  where last_attempt_at < v_now - interval '24 hours';
end;
$$;

revoke all on function public.check_login_rate_limit(text,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.record_login_rate_limit(text,boolean,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.check_login_rate_limit(text,integer,integer,integer) to service_role;
grant execute on function public.record_login_rate_limit(text,boolean,integer,integer,integer) to service_role;

revoke delete on public.profiles from authenticated;
revoke update(role, organization_id, email, invitation_status, id, created_at) on public.profiles from authenticated;
grant update(full_name, username, birth_month, birth_day, avatar_url, updated_at) on public.profiles to authenticated;
