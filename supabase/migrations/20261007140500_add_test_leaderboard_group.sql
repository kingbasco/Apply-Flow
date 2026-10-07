-- Add a dedicated Test leaderboard group for the test Programme Staff account.
-- Keeps Group 1-5 unchanged while giving the test account a custom label.

alter table private.programme_leaderboard_groups
  add column if not exists display_label text;

insert into private.programme_leaderboard_groups(application_id,staff_id,group_number,display_label)
values (
  '03a8ef8a-9f53-46a3-81f3-00162dbbad18'::uuid,
  'd66e0790-fabc-491a-922b-3d361d469b8f'::uuid,
  6,
  'Test'
)
on conflict (application_id,staff_id)
do update set
  group_number=excluded.group_number,
  display_label=excluded.display_label;

drop function if exists public.get_leaderboard_groups(uuid);

create function public.get_leaderboard_groups(p_application_id uuid)
returns table(
  staff_id uuid,
  staff_name text,
  participant_count bigint,
  group_number integer,
  group_label text
)
language sql
security definer
set search_path to 'public'
as $function$
  with me as (
    select p.id as user_id,p.organization_id,p.role
    from public.profiles p
    join public.applications a on a.organization_id=p.organization_id
    where p.id=auth.uid()
      and a.id=p_application_id
      and p.role in ('owner','admin','reviewer')
      and private.has_active_user_session()
  )
  select
    g.staff_id,
    coalesce(nullif(trim(pf.full_name),''),pf.email,'Programme Staff') as staff_name,
    count(distinct p.id)::bigint as participant_count,
    g.group_number,
    coalesce(nullif(trim(g.display_label),''),('Group '||g.group_number)::text) as group_label
  from private.programme_leaderboard_groups g
  join me on true
  join public.profiles pf on pf.id=g.staff_id
  left join public.participant_staff_assignments psa
    on psa.application_id=g.application_id
   and psa.staff_id=g.staff_id
  left join public.participants p
    on p.id=psa.participant_id
   and p.application_id=g.application_id
   and p.status='active'
  where g.application_id=p_application_id
    and (
      me.role in ('owner','admin')
      or (me.role='reviewer' and g.staff_id=me.user_id)
    )
  group by g.staff_id,pf.full_name,pf.email,g.group_number,g.display_label
  order by g.group_number;
$function$;

revoke all on function public.get_leaderboard_groups(uuid) from public;
revoke all on function public.get_leaderboard_groups(uuid) from anon;
grant execute on function public.get_leaderboard_groups(uuid) to authenticated;

-- Preserve the existing public-result function and only replace the generated
-- "Group N" label with the configured custom display label when present.
do $$
declare
  v_sql text;
begin
  v_sql := pg_get_functiondef('public.get_public_assignment_result(text,text,text)'::regprocedure);
  v_sql := replace(
    v_sql,
    '(''Group ''||g.group_number)::text,',
    'coalesce(nullif(trim(g.display_label),''''),(''Group ''||g.group_number)::text),'
  );
  execute v_sql;
end $$;

revoke all on function public.get_public_assignment_result(text,text,text) from public;
revoke all on function public.get_public_assignment_result(text,text,text) from authenticated;
grant execute on function public.get_public_assignment_result(text,text,text) to anon,authenticated;
