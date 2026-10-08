
-- Admin-controlled assignment grading, independent of participant group ownership.
create table if not exists public.assignment_review_staff_settings (
  staff_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  is_eligible boolean not null default true,
  reason text,
  updated_at timestamptz not null default now()
);
alter table public.assignment_review_staff_settings enable row level security;
revoke all on public.assignment_review_staff_settings from anon,authenticated;

-- Permanently exclude the known one-participant testing group from grading.
insert into public.assignment_review_staff_settings(staff_id,organization_id,is_eligible,reason)
select p.id,p.organization_id,false,'Test account (one-participant group)'
from public.profiles p
where p.id='d66e0790-fabc-491a-922b-3d361d469b8f'::uuid
on conflict(staff_id) do update
set is_eligible=false,reason=excluded.reason,updated_at=now();

create table if not exists public.assignment_review_allocation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  submission_id uuid not null references public.assignment_submissions(id) on delete cascade,
  reviewer_before uuid references public.profiles(id) on delete set null,
  reviewer_after uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  action text not null,
  batch_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists assignment_review_events_assignment_idx
 on public.assignment_review_allocation_events(assignment_id,created_at desc);
alter table public.assignment_review_allocation_events enable row level security;
revoke all on public.assignment_review_allocation_events from anon,authenticated;
grant select on public.assignment_review_allocation_events to authenticated;
drop policy if exists "Admins read review assignment history" on public.assignment_review_allocation_events;
create policy "Admins read review assignment history" on public.assignment_review_allocation_events
for select to authenticated using (
 private.has_active_user_session() and exists (
  select 1 from public.profiles p
  where p.id=(select auth.uid()) and p.organization_id=assignment_review_allocation_events.organization_id and p.role in ('owner','admin')
 )
);

-- Participant eligibility is checked on the server, not inferred from the browser.
-- Exclude members of disabled/test staff groups AND participants who also have
-- Owner/Admin/Programme Staff profiles in the same organization.
create or replace function private.is_assignment_review_participant_eligible(p_participant_id uuid,p_org_id uuid)
returns boolean language sql stable security definer set search_path=''
as $function$
select exists (
 select 1 from public.participants pt
 left join public.applicants ap on ap.id=pt.applicant_id
 where pt.id=p_participant_id and pt.organization_id=p_org_id
   and pt.status in ('active','completed')
   and not exists (
     select 1 from public.participant_staff_assignments psa
     join public.assignment_review_staff_settings ss on ss.staff_id=psa.staff_id
     where psa.participant_id=pt.id and psa.organization_id=pt.organization_id
       and ss.organization_id=pt.organization_id and ss.is_eligible=false
   )
   and not exists (
     select 1 from public.profiles p
     where p.organization_id=pt.organization_id and p.role in ('owner','admin','reviewer')
       and ap.email is not null and p.email is not null
       and pg_catalog.lower(pg_catalog.btrim(p.email))=pg_catalog.lower(pg_catalog.btrim(ap.email))
   )
);
$function$;
revoke all on function private.is_assignment_review_participant_eligible(uuid,uuid) from public,anon,authenticated;

-- Review allocation must be initiated by Owner/Admin. No automatic triggers.
drop trigger if exists allocate_assignment_submission_for_review on public.assignment_submissions;
drop function if exists private.auto_allocate_assignment_submission();
drop function if exists private.allocate_assignment_reviewer(uuid);
drop function if exists public.shuffle_assignment_reviews(uuid,boolean);

-- Revoke current pending reviewer allocations. Graded submissions and grades are intact.
-- Record previous allocations for Owner/Admin audit before removing the pending ones.
insert into public.assignment_review_allocation_events(
  organization_id,assignment_id,submission_id,reviewer_before,reviewer_after,assigned_by,action
)
select ra.organization_id,ra.assignment_id,ra.submission_id,ra.reviewer_id,null,null,'manual_allocation_transition'
from public.assignment_review_allocations ra
join public.assignment_submissions s on s.id=ra.submission_id
where s.status='submitted';
delete from public.assignment_review_allocations ra
using public.assignment_submissions s
where ra.submission_id=s.id and s.status='submitted';

create or replace function public.get_assignment_review_staff(p_assignment_id uuid)
returns table (
 staff_id uuid, staff_name text, is_eligible boolean,
 participant_count bigint, exclusion_reason text
)
language plpgsql stable security definer set search_path=''
as $function$
declare v_org uuid;
begin
 if not private.has_active_user_session() then raise exception 'Authentication required'; end if;
 select a.organization_id into v_org from public.assignments a where a.id=p_assignment_id;
 if v_org is null or not exists(
   select 1 from public.profiles p where p.id=auth.uid()
   and p.organization_id=v_org and p.role in ('owner','admin')
 ) then raise exception 'Access denied'; end if;
 return query
 select p.id,p.full_name,
   coalesce(ss.is_eligible,true) and p.invitation_status='active',
   (select count(distinct psa.participant_id) from public.participant_staff_assignments psa
      where psa.staff_id=p.id and psa.application_id=(select a.application_id from public.assignments a where a.id=p_assignment_id)),
   case when p.invitation_status<>'active' then 'Inactive account' else ss.reason end
 from public.profiles p
 left join public.assignment_review_staff_settings ss on ss.staff_id=p.id
 where p.organization_id=v_org and p.role='reviewer'
 order by p.full_name,p.id;
end;
$function$;
revoke all on function public.get_assignment_review_staff(uuid) from public,anon;
grant execute on function public.get_assignment_review_staff(uuid) to authenticated;

-- Selectable submission queue includes unallocated eligible work for Owner/Admin.
-- Programme Staff still only see work explicitly allocated to them.
create or replace function public.get_assignment_review_queue(p_assignment_id uuid)
returns table (
 submission_id uuid, assignment_id uuid, participant_id uuid,
 participant_code text, participant_name text,
 status text, submitted_at timestamptz, score numeric, feedback text, graded_at timestamptz,
 reviewer_id uuid, reviewer_name text, source_group text, assigned_at timestamptz
) language plpgsql stable security definer set search_path=''
as $function$
declare v_org uuid; v_admin boolean; v_role text;
begin
 if not private.has_active_user_session() then raise exception 'Authentication required'; end if;
 select a.organization_id into v_org from public.assignments a where a.id=p_assignment_id;
 select p.role into v_role from public.profiles p where p.id=auth.uid() and p.organization_id=v_org;
 if v_org is null or v_role not in ('owner','admin','reviewer') then raise exception 'Access denied'; end if;
 v_admin:=v_role in ('owner','admin');
 return query
 select s.id,s.assignment_id,s.participant_id,pt.participant_id,ap.full_name,s.status,s.submitted_at,
        s.score,s.feedback,s.graded_at,
        case when v_admin then ra.reviewer_id else null end,
        case when v_admin then rp.full_name else null end,
        case when v_admin then (
          select pg_catalog.string_agg(coalesce(gp.full_name,'Staff member'),', ' order by gp.full_name)
          from public.participant_staff_assignments psa
          join public.profiles gp on gp.id=psa.staff_id
          where psa.participant_id=s.participant_id
        ) else null end,
        ra.assigned_at
 from public.assignment_submissions s
 join public.participants pt on pt.id=s.participant_id
 left join public.applicants ap on ap.id=pt.applicant_id
 left join public.assignment_review_allocations ra on ra.submission_id=s.id
 left join public.profiles rp on rp.id=ra.reviewer_id
 where s.assignment_id=p_assignment_id and s.organization_id=v_org
   and private.is_assignment_review_participant_eligible(s.participant_id,v_org)
   and (v_admin or ra.reviewer_id=auth.uid())
 order by (s.status='graded'),s.submitted_at,s.id;
end;
$function$;
revoke all on function public.get_assignment_review_queue(uuid) from public,anon;
grant execute on function public.get_assignment_review_queue(uuid) to authenticated;

-- Explicit, atomic admin-selected shuffle across selected submissions and reviewers.
-- Prevent own-group marking rather than silently falling back to biased allocation.
create or replace function public.assign_and_shuffle_assignment_reviews(
  p_assignment_id uuid,p_submission_ids uuid[],p_reviewer_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_org uuid;
 v_selected_count integer;
 v_staff_count integer;
 v_row record;
 v_reviewer uuid;
 v_allocated integer:=0;
 v_batch uuid:=gen_random_uuid();
begin
 if not private.has_active_user_session() then raise exception 'Authentication required'; end if;
 select a.organization_id into v_org from public.assignments a where a.id=p_assignment_id;
 if v_org is null or not exists (
  select 1 from public.profiles p where p.id=auth.uid()
   and p.organization_id=v_org and p.role in ('owner','admin')
 ) then raise exception 'Only an Owner or Admin can assign grading'; end if;
 v_selected_count:=coalesce(pg_catalog.array_length(p_submission_ids,1),0);
 v_staff_count:=coalesce(pg_catalog.array_length(p_reviewer_ids,1),0);
 if v_selected_count=0 or v_staff_count=0 then
   raise exception 'Select at least one ungraded submission and one reviewer'; end if;
 if v_selected_count>5000 then raise exception 'Maximum 5000 submissions per shuffle'; end if;
 if v_selected_count<>(select count(distinct x) from unnest(p_submission_ids) as x) or
    v_staff_count<>(select count(distinct x) from unnest(p_reviewer_ids) as x) then
   raise exception 'Duplicate IDs in selection'; end if;

 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_assignment_id::text,2026));

 -- Validate all records before any reassignment. Race-safe revalidation under row lock.
 if (select count(*) from public.assignment_submissions s
     where s.id=any(p_submission_ids) and s.assignment_id=p_assignment_id
       and s.organization_id=v_org and s.status='submitted'
       and private.is_assignment_review_participant_eligible(s.participant_id,v_org)
    )<>v_selected_count then
    raise exception 'Your selection contains an invalid, graded or excluded participant submission'; end if;

 if (select count(*) from public.profiles p
     left join public.assignment_review_staff_settings ss on ss.staff_id=p.id
     where p.id=any(p_reviewer_ids) and p.organization_id=v_org
       and p.role='reviewer' and p.invitation_status='active'
       and coalesce(ss.is_eligible,true)
    )<>v_staff_count then
    raise exception 'Your reviewer selection includes an inactive or excluded test staff member'; end if;

 perform 1 from public.assignment_submissions s
 where s.id=any(p_submission_ids) order by s.id for update;

 -- Recheck status after locks; a grade arriving during the shuffle aborts the batch.
 if exists (
   select 1 from public.assignment_submissions s
   where s.id=any(p_submission_ids) and s.status<>'submitted'
 ) then raise exception 'A selected submission was graded during allocation. Refresh and retry'; end if;

 -- Log previous allocations before reassigning. The action and reallocation share a batch ID.
 insert into public.assignment_review_allocation_events
  (organization_id,assignment_id,submission_id,reviewer_before,reviewer_after,assigned_by,action,batch_id)
 select ra.organization_id,ra.assignment_id,ra.submission_id,ra.reviewer_id,null,auth.uid(),'manual_reassignment',v_batch
 from public.assignment_review_allocations ra
 where ra.submission_id=any(p_submission_ids);
 -- Remove only the selected pending allocations before balancing the chosen pool.
 delete from public.assignment_review_allocations ra
 where ra.submission_id=any(p_submission_ids);
 for v_row in
   select s.id,s.participant_id from public.assignment_submissions s
   where s.id=any(p_submission_ids)
   order by pg_catalog.random()
 loop
   select p.id into v_reviewer
   from public.profiles p
   where p.id=any(p_reviewer_ids) and p.organization_id=v_org
     and p.role='reviewer' and p.invitation_status='active'
     and not exists (
       select 1 from public.participant_staff_assignments psa
       where psa.participant_id=v_row.participant_id and psa.staff_id=p.id
     )
   order by (select count(*) from public.assignment_review_allocations ra
             where ra.assignment_id=p_assignment_id and ra.reviewer_id=p.id),
            pg_catalog.random()
   limit 1;
   if v_reviewer is null then
     raise exception 'Selected staff cannot review all these submissions without marking their own group; choose more reviewers'; end if;
   -- Audit records are written in this transaction before commit.
   insert into public.assignment_review_allocations
      (organization_id,assignment_id,submission_id,reviewer_id,assigned_by)
   values(v_org,p_assignment_id,v_row.id,v_reviewer,auth.uid());
   insert into public.assignment_review_allocation_events
      (organization_id,assignment_id,submission_id,reviewer_before,reviewer_after,assigned_by,action,batch_id)
   values(v_org,p_assignment_id,v_row.id,null,v_reviewer,auth.uid(),'assign_and_shuffle',v_batch);
   v_allocated:=v_allocated+1;
 end loop;
 return pg_catalog.jsonb_build_object('assigned',v_allocated,'reviewers',v_staff_count,'batch_id',v_batch);
end;
$function$;
revoke all on function public.assign_and_shuffle_assignment_reviews(uuid,uuid[],uuid[]) from public,anon;
grant execute on function public.assign_and_shuffle_assignment_reviews(uuid,uuid[],uuid[]) to authenticated;
