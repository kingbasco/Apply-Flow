-- Enable the dedicated Test Programme Staff account for blind-grading verification
-- while keeping the Test participant out of real grading source pools. Also add
-- an Admin/Owner-only RPC to unassign pending review allocations.

update public.assignment_review_staff_settings
set is_eligible=true,
    reason='Test reviewer enabled for blind-grading verification',
    updated_at=now()
where staff_id='d66e0790-fabc-491a-922b-3d361d469b8f'::uuid;

create or replace function private.is_assignment_review_participant_eligible(p_participant_id uuid,p_org_id uuid)
returns boolean language sql stable security definer set search_path=''
as $function$
select exists (
 select 1
 from public.participants pt
 left join public.applicants ap on ap.id=pt.applicant_id
 where pt.id=p_participant_id
   and pt.organization_id=p_org_id
   and pt.status in ('active','completed')
   and not exists (
     select 1
     from public.participant_staff_assignments psa
     join private.programme_leaderboard_groups lg
       on lg.application_id=psa.application_id
      and lg.staff_id=psa.staff_id
     where psa.participant_id=pt.id
       and psa.organization_id=pt.organization_id
       and pg_catalog.lower(coalesce(lg.display_label,''))='test'
   )
   and not exists (
     select 1
     from public.profiles p
     where p.organization_id=pt.organization_id
       and p.role in ('owner','admin','reviewer')
       and ap.email is not null
       and p.email is not null
       and pg_catalog.lower(pg_catalog.btrim(p.email))=pg_catalog.lower(pg_catalog.btrim(ap.email))
   )
);
$function$;

revoke all on function private.is_assignment_review_participant_eligible(uuid,uuid) from public,anon,authenticated;

create or replace function public.unassign_assignment_reviews(
  p_assignment_id uuid,
  p_submission_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_org uuid;
  v_selected_count integer;
  v_unassigned integer;
  v_batch uuid:=gen_random_uuid();
begin
  if not private.has_active_user_session() then
    raise exception 'Authentication required';
  end if;

  select a.organization_id into v_org
  from public.assignments a
  where a.id=p_assignment_id;

  if v_org is null or not exists (
    select 1
    from public.profiles p
    where p.id=auth.uid()
      and p.organization_id=v_org
      and p.role in ('owner','admin')
  ) then
    raise exception 'Only an Owner or Admin can unassign grading';
  end if;

  v_selected_count:=coalesce(pg_catalog.array_length(p_submission_ids,1),0);
  if v_selected_count=0 then
    raise exception 'Select at least one assigned submission';
  end if;
  if v_selected_count>5000 then
    raise exception 'Maximum 5000 submissions per unassign action';
  end if;
  if v_selected_count<>(select count(distinct x) from unnest(p_submission_ids) as x) then
    raise exception 'Duplicate submission IDs in selection';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_assignment_id::text,2026));

  perform 1
  from public.assignment_submissions s
  where s.id=any(p_submission_ids)
  order by s.id
  for update;

  if exists (
    select 1
    from public.assignment_submissions s
    where s.id=any(p_submission_ids)
      and (
        s.assignment_id<>p_assignment_id
        or s.organization_id<>v_org
        or s.status<>'submitted'
      )
  ) then
    raise exception 'Only pending submissions from this assignment can be unassigned';
  end if;

  insert into public.assignment_review_allocation_events(
    organization_id,assignment_id,submission_id,
    reviewer_before,reviewer_after,assigned_by,action,batch_id
  )
  select
    ra.organization_id,ra.assignment_id,ra.submission_id,
    ra.reviewer_id,null,auth.uid(),'manual_unassignment',v_batch
  from public.assignment_review_allocations ra
  where ra.assignment_id=p_assignment_id
    and ra.submission_id=any(p_submission_ids)
    and ra.reviewer_id is not null;

  delete from public.assignment_review_allocations ra
  where ra.assignment_id=p_assignment_id
    and ra.submission_id=any(p_submission_ids)
    and ra.reviewer_id is not null;

  get diagnostics v_unassigned = row_count;

  return pg_catalog.jsonb_build_object(
    'unassigned',v_unassigned,
    'selected',v_selected_count,
    'batch_id',v_batch
  );
end;
$function$;

revoke all on function public.unassign_assignment_reviews(uuid,uuid[]) from public,anon;
grant execute on function public.unassign_assignment_reviews(uuid,uuid[]) to authenticated;
