drop policy if exists participant_point_awards_admin_select on public.participant_point_awards;
drop policy if exists participant_point_awards_staff_select on public.participant_point_awards;

create policy participant_point_awards_staff_select
on public.participant_point_awards
for select
to authenticated
using (
  private.has_active_user_session()
  and (
    private.is_org_admin(organization_id)
    or exists (
      select 1
      from public.profiles p
      where p.id=auth.uid()
        and p.organization_id=participant_point_awards.organization_id
        and p.role='reviewer'
        and exists (
          select 1
          from public.participant_staff_assignments psa
          where psa.participant_id=participant_point_awards.participant_id
            and psa.staff_id=auth.uid()
        )
    )
  )
);

create or replace function public.award_participant_points(
  p_participant_id uuid,
  p_points numeric,
  p_category text,
  p_reason text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_participant public.participants;
  v_award public.participant_point_awards;
  v_awarder_name text;
  v_category text:=lower(trim(coalesce(p_category,'')));
  v_reason text:=trim(coalesce(p_reason,''));
  v_note text:=nullif(trim(coalesce(p_note,'')),'');
  v_allowed boolean:=false;
begin
  if auth.uid() is null or not private.has_active_user_session() then
    raise exception 'You must be signed in to award points.';
  end if;

  select * into v_participant
  from public.participants
  where id=p_participant_id;

  if v_participant.id is null then
    raise exception 'Participant not found.';
  end if;

  v_allowed:=private.is_org_admin(v_participant.organization_id);

  if not v_allowed then
    select exists (
      select 1
      from public.profiles p
      join public.participant_staff_assignments psa
        on psa.staff_id=p.id
       and psa.participant_id=v_participant.id
      where p.id=auth.uid()
        and p.organization_id=v_participant.organization_id
        and p.role='reviewer'
        and psa.application_id=v_participant.application_id
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'You can only award points to participants assigned to you.';
  end if;

  if p_points is null or p_points<=0 or p_points>10000 then
    raise exception 'Points must be greater than 0 and no more than 10000.';
  end if;

  if v_category not in ('class_activity','group_activity','participation','leadership','helpfulness','other') then
    raise exception 'Choose a valid point category.';
  end if;

  if char_length(v_reason)<2 or char_length(v_reason)>200 then
    raise exception 'Reason must be between 2 and 200 characters.';
  end if;

  if v_note is not null and char_length(v_note)>1000 then
    raise exception 'Note must be 1000 characters or fewer.';
  end if;

  select coalesce(nullif(trim(full_name),''),nullif(trim(username),''),'Staff member')
    into v_awarder_name
  from public.profiles
  where id=auth.uid();

  insert into public.participant_point_awards(
    organization_id,application_id,participant_id,points,category,reason,note,awarded_by,awarded_by_name
  )
  values(
    v_participant.organization_id,v_participant.application_id,v_participant.id,
    p_points,v_category,v_reason,v_note,auth.uid(),coalesce(v_awarder_name,'Staff member')
  )
  returning * into v_award;

  return jsonb_build_object(
    'id',v_award.id,
    'points',v_award.points,
    'category',v_award.category,
    'reason',v_award.reason,
    'note',v_award.note,
    'awarded_by',v_award.awarded_by,
    'awarded_by_name',v_award.awarded_by_name,
    'created_at',v_award.created_at,
    'revoked_at',v_award.revoked_at
  );
end;
$function$;

create or replace function public.revoke_participant_point_award(
  p_award_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_award public.participant_point_awards;
  v_reason text:=nullif(trim(coalesce(p_reason,'')),'');
  v_allowed boolean:=false;
begin
  if auth.uid() is null or not private.has_active_user_session() then
    raise exception 'You must be signed in to revoke points.';
  end if;

  select * into v_award
  from public.participant_point_awards
  where id=p_award_id;

  if v_award.id is null then
    raise exception 'Point award not found.';
  end if;

  v_allowed:=private.is_org_admin(v_award.organization_id);

  if not v_allowed then
    select exists (
      select 1
      from public.profiles p
      join public.participant_staff_assignments psa
        on psa.staff_id=p.id
       and psa.participant_id=v_award.participant_id
      where p.id=auth.uid()
        and p.organization_id=v_award.organization_id
        and p.role='reviewer'
        and psa.application_id=v_award.application_id
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'You can only revoke point awards for participants assigned to you.';
  end if;

  if v_award.revoked_at is not null then
    raise exception 'This point award has already been revoked.';
  end if;

  if v_reason is not null and char_length(v_reason)>500 then
    raise exception 'Revocation reason must be 500 characters or fewer.';
  end if;

  update public.participant_point_awards
  set revoked_at=now(),revoked_by=auth.uid(),revoked_reason=v_reason
  where id=v_award.id
  returning * into v_award;

  return jsonb_build_object(
    'id',v_award.id,
    'revoked_at',v_award.revoked_at,
    'revoked_by',v_award.revoked_by,
    'revoked_reason',v_award.revoked_reason
  );
end;
$function$;

revoke all on function public.award_participant_points(uuid,numeric,text,text,text) from public,anon;
grant execute on function public.award_participant_points(uuid,numeric,text,text,text) to authenticated;

revoke all on function public.revoke_participant_point_award(uuid,text) from public,anon;
grant execute on function public.revoke_participant_point_award(uuid,text) to authenticated;
