-- Participant identity: owner-defined programme code + creation year + 4-digit sequence.

alter table public.applications
  add column if not exists participant_code text;

update public.applications
set participant_code = coalesce(
  nullif(left(regexp_replace(upper(coalesce(name, 'APP')), '[^A-Z0-9]', '', 'g'), 12), ''),
  'APP'
)
where participant_code is null or btrim(participant_code) = '';

alter table public.applications
  alter column participant_code set default 'APP',
  alter column participant_code set not null;

alter table public.applications
  drop constraint if exists applications_participant_code_format;

alter table public.applications
  add constraint applications_participant_code_format
  check (participant_code ~ '^[A-Z0-9]{2,12}$');

alter table public.participants
  drop constraint if exists participants_participant_code_key;

create unique index if not exists participants_application_code_key
  on public.participants(application_id, participant_code);

create schema if not exists private;

create table if not exists private.participant_sequences (
  application_id uuid not null references public.applications(id) on delete cascade,
  participant_year integer not null,
  last_number bigint not null default 0,
  primary key (application_id, participant_year),
  check (participant_year between 2000 and 9999),
  check (last_number >= 0)
);

revoke all on private.participant_sequences from public, anon, authenticated;

with numbered as (
  select
    p.id,
    p.application_id,
    extract(year from a.created_at)::integer as participant_year,
    row_number() over (
      partition by p.application_id, extract(year from a.created_at)
      order by p.created_at, p.id
    ) as seq
  from public.participants p
  join public.applications a on a.id = p.application_id
)
update public.participants p
set participant_code =
  a.participant_code || '-' ||
  extract(year from a.created_at)::integer::text || '-' ||
  lpad(numbered.seq::text, 4, '0'),
  updated_at = now()
from numbered
join public.applications a on a.id = numbered.application_id
where p.id = numbered.id;

insert into private.participant_sequences(application_id, participant_year, last_number)
select
  a.id,
  extract(year from a.created_at)::integer,
  coalesce(count(p.id), 0)
from public.applications a
left join public.participants p on p.application_id = a.id
group by a.id, extract(year from a.created_at)::integer
on conflict (application_id, participant_year) do update
set last_number = greatest(private.participant_sequences.last_number, excluded.last_number);

create or replace function private.assign_participant_on_selection()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_submission public.submissions%rowtype;
  v_application public.applications%rowtype;
  v_num bigint;
  v_year integer;
  v_code text;
begin
  if new.status <> 'selected' then
    return new;
  end if;

  if exists (select 1 from public.participants where submission_id = new.submission_id) then
    update public.participants
    set status = 'active', updated_at = now()
    where submission_id = new.submission_id;
    return new;
  end if;

  select * into v_submission from public.submissions where id = new.submission_id;
  select * into v_application from public.applications where id = v_submission.application_id;

  v_year := extract(year from v_application.created_at)::integer;

  insert into private.participant_sequences(application_id, participant_year, last_number)
  values (v_application.id, v_year, 1)
  on conflict (application_id, participant_year)
  do update set last_number = private.participant_sequences.last_number + 1
  returning last_number into v_num;

  v_code := v_application.participant_code || '-' || v_year::text || '-' || lpad(v_num::text, 4, '0');

  insert into public.participants (
    organization_id, application_id, submission_id, applicant_id, participant_code, status
  ) values (
    v_application.organization_id, v_application.id, v_submission.id, v_submission.applicant_id, v_code, 'active'
  );

  return new;
end;
$function$;

create or replace function private.sync_participant_codes_on_application_code_change()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if new.participant_code is distinct from old.participant_code then
    update public.participants p
    set participant_code =
      new.participant_code || '-' ||
      extract(year from new.created_at)::integer::text || '-' ||
      lpad(
        row_number() over (
          partition by p.application_id, extract(year from new.created_at)
          order by p.created_at, p.id
        )::text,
        4,
        '0'
      ),
      updated_at = now()
    where p.application_id = new.id;
  end if;
  return new;
end;
$function$;

create or replace function private.normalize_application_participant_code()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  new.participant_code := left(
    regexp_replace(upper(coalesce(new.participant_code, 'APP')), '[^A-Z0-9]', '', 'g'),
    12
  );

  if new.participant_code is null or length(new.participant_code) < 2 then
    raise exception 'Participant code must contain at least 2 letters or numbers.';
  end if;

  if tg_op = 'UPDATE' and new.participant_code is distinct from old.participant_code then
    if not exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.organization_id = new.organization_id
        and p.role = 'owner'
    ) then
      raise exception 'Only the organisation owner can change the participant ID code.';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists applications_normalize_participant_code on public.applications;
create trigger applications_normalize_participant_code
before insert or update of participant_code on public.applications
for each row execute function private.normalize_application_participant_code();

drop trigger if exists applications_sync_participant_codes on public.applications;
create trigger applications_sync_participant_codes
after update of participant_code on public.applications
for each row execute function private.sync_participant_codes_on_application_code_change();
