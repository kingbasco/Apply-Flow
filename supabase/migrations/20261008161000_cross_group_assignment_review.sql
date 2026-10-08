-- Review assignments are independent of participant group ownership.
-- Existing graded submissions are retained; only submitted/ungraded work is shuffled.
create table if not exists public.assignment_review_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  submission_id uuid not null unique references public.assignment_submissions(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now()
);
create index if not exists assignment_review_allocations_by_reviewer
  on public.assignment_review_allocations(reviewer_id,assignment_id);
create index if not exists assignment_review_allocations_by_assignment
  on public.assignment_review_allocations(assignment_id,assigned_at);

alter table public.assignment_review_allocations enable row level security;
revoke all on public.assignment_review_allocations from anon;
revoke insert, update, delete on public.assignment_review_allocations from authenticated;
grant select on public.assignment_review_allocations to authenticated;
drop policy if exists "review allocations restricted read" on public.assignment_review_allocations;
create policy "review allocations restricted read" on public.assignment_review_allocations
 for select to authenticated using (
  private.has_active_user_session()
  and (
   reviewer_id = (select auth.uid())
   or exists (
    select 1 from public.profiles p where p.id=(select auth.uid())
      and p.organization_id=assignment_review_allocations.organization_id
      and p.role in ('owner','admin')
   )
  )
 );

-- This internal allocator is not exposed to the Data API.
create or replace function private.allocate_assignment_reviewer(p_submission_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
  v_submission public.assignment_submissions;
  v_reviewer uuid;
begin
  select * into v_submission from public.assignment_submissions where id=p_submission_id;
  if v_submission.id is null or v_submission.status<>'submitted' then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_submission.assignment_id::text,2026));
  select reviewer_id into v_reviewer
    from public.assignment_review_allocations where submission_id=p_submission_id;
  if found then return v_reviewer; end if;

  -- Prefer staff outside the participant's regular group, then the lightest review workload.
  -- Counts are per assignment to avoid mixing different marking workloads.
  select p.id into v_reviewer
    from public.profiles p
   where p.organization_id=v_submission.organization_id
     and p.role='reviewer' and p.invitation_status='active'
   order by
     case when exists (
       select 1 from public.participant_staff_assignments psa
       where psa.participant_id=v_submission.participant_id and psa.staff_id=p.id
     ) then 1 else 0 end,
     (select count(*) from public.assignment_review_allocations ra
       where ra.assignment_id=v_submission.assignment_id and ra.reviewer_id=p.id),
     pg_catalog.random()
   limit 1;

  if v_reviewer is not null then
    insert into public.assignment_review_allocations
      (organization_id,assignment_id,submission_id,reviewer_id,assigned_by)
    values(v_submission.organization_id,v_submission.assignment_id,p_submission_id,v_reviewer,null)
    on conflict(submission_id) do nothing;
  end if;
  return v_reviewer;
end;
$function$;
revoke all on function private.allocate_assignment_reviewer(uuid) from public,anon,authenticated;

-- Incoming work is assigned when it becomes a real submitted assignment.
create or replace function private.auto_allocate_assignment_submission()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if new.status='submitted' then
    perform private.allocate_assignment_reviewer(new.id);
  end if;
  return new;
end;
$function$;
revoke all on function private.auto_allocate_assignment_submission() from public,anon,authenticated;
drop trigger if exists allocate_assignment_submission_for_review on public.assignment_submissions;
create trigger allocate_assignment_submission_for_review
  after insert or update of status on public.assignment_submissions
  for each row when (new.status='submitted')
  execute function private.auto_allocate_assignment_submission();

-- Admin/Owner can distribute historic ungraded work or explicitly re-shuffle pending allocations.
-- Already graded work and grades are never altered by this RPC.
create or replace function public.shuffle_assignment_reviews(p_assignment_id uuid,p_reshuffle boolean default false)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_assignment public.assignments;
 v_count integer := 0;
 v_row record;
 v_assigned uuid;
begin
 if not private.has_active_user_session() then raise exception 'Authentication required'; end if;
 select * into v_assignment from public.assignments where id=p_assignment_id;
 if v_assignment.id is null then raise exception 'Assignment not found'; end if;
 if not exists (
   select 1 from public.profiles p
   where p.id=auth.uid() and p.organization_id=v_assignment.organization_id and p.role in ('owner','admin')
 ) then raise exception 'Only Owner and Admin can shuffle assignment reviews'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_assignment_id::text,2026));
 if p_reshuffle then
   delete from public.assignment_review_allocations ra
   using public.assignment_submissions s
   where ra.submission_id=s.id and ra.assignment_id=p_assignment_id and s.status='submitted';
 end if;
 for v_row in
   select s.id from public.assignment_submissions s
   left join public.assignment_review_allocations ra on ra.submission_id=s.id
   where s.assignment_id=p_assignment_id and s.status='submitted' and ra.id is null
   order by pg_catalog.random()
 loop
   v_assigned:=private.allocate_assignment_reviewer(v_row.id);
   if v_assigned is not null then
     update public.assignment_review_allocations set assigned_by=auth.uid() where submission_id=v_row.id;
     v_count:=v_count+1;
   end if;
 end loop;
 return pg_catalog.jsonb_build_object('assigned',v_count,'pending',
   (select count(*) from public.assignment_submissions where assignment_id=p_assignment_id and status='submitted'));
end;
$function$;
revoke all on function public.shuffle_assignment_reviews(uuid,boolean) from public,anon;
grant execute on function public.shuffle_assignment_reviews(uuid,boolean) to authenticated;

-- Queue RPC never reveals another group's reviewer or source group to Programme Staff.
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
 from public.assignment_review_allocations ra
 join public.assignment_submissions s on s.id=ra.submission_id
 join public.participants pt on pt.id=s.participant_id
 left join public.applicants ap on ap.id=pt.applicant_id
 left join public.profiles rp on rp.id=ra.reviewer_id
 where ra.assignment_id=p_assignment_id and ra.organization_id=v_org
   and (v_admin or ra.reviewer_id=auth.uid())
 order by (s.status='graded'),s.submitted_at,ra.assigned_at;
end;
$function$;
revoke all on function public.get_assignment_review_queue(uuid) from public,anon;
grant execute on function public.get_assignment_review_queue(uuid) to authenticated;

-- Cross-group reviewers can read assigned answers, uploaded document metadata and files.
-- The original participant-group SELECT policies stay intact for read-only status visibility.
drop policy if exists "cross group allocated submission read" on public.assignment_submissions;
create policy "cross group allocated submission read" on public.assignment_submissions
 for select to authenticated using (
 private.has_active_user_session() and exists (
   select 1 from public.assignment_review_allocations ra
   where ra.submission_id=assignment_submissions.id and ra.reviewer_id=(select auth.uid())
 )
);
drop policy if exists "cross group allocated answer read" on public.assignment_answers;
create policy "cross group allocated answer read" on public.assignment_answers
 for select to authenticated using (
 private.has_active_user_session() and exists (
   select 1 from public.assignment_review_allocations ra
   where ra.submission_id=assignment_answers.submission_id and ra.reviewer_id=(select auth.uid())
 )
);
drop policy if exists "cross group allocated document read" on public.assignment_documents;
create policy "cross group allocated document read" on public.assignment_documents
 for select to authenticated using (
 private.has_active_user_session() and exists (
   select 1 from public.assignment_review_allocations ra
   where ra.submission_id=assignment_documents.submission_id and ra.reviewer_id=(select auth.uid())
 )
);
drop policy if exists "cross group allocated assignment file read" on storage.objects;
create policy "cross group allocated assignment file read" on storage.objects
 for select to authenticated using (
 bucket_id='application-files' and (storage.foldername(name))[1]='assignment-submissions'
 and private.has_active_user_session()
 and exists (
   select 1 from public.assignment_documents d
   join public.assignment_review_allocations ra on ra.submission_id=d.submission_id
   where d.storage_bucket=bucket_id and d.storage_path=name and ra.reviewer_id=(select auth.uid())
 )
);

-- Only a reviewer allocated to this submission may grade; admin/owner retain overrides.
create or replace function public.grade_assignment_submission(p_submission_id uuid,p_score numeric,p_feedback text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_submission public.assignment_submissions;
 v_assignment public.assignments;
 v_profile public.profiles;
 v_prior_score numeric;
 v_prior_feedback text;
begin
 if not private.has_active_user_session() then raise exception 'Authentication required'; end if;
 select * into v_submission from public.assignment_submissions where id=p_submission_id for update;
 if v_submission.id is null then raise exception 'Submission not found'; end if;
 select * into v_profile from public.profiles
 where id=auth.uid() and organization_id=v_submission.organization_id;
 if v_profile.id is null or v_profile.role not in ('owner','admin','reviewer') then
   raise exception 'You do not have permission to grade this submission';
 end if;
 if v_profile.role='reviewer' then
   if not exists (
      select 1 from public.assignment_review_allocations ra
      where ra.submission_id=p_submission_id and ra.reviewer_id=auth.uid()
   ) then raise exception 'This submission is not in your review queue'; end if;
   if v_submission.status='graded' then raise exception 'This work was already graded. Ask an Admin to make corrections'; end if;
 end if;
 select * into v_assignment from public.assignments where id=v_submission.assignment_id;
 if p_score is null or p_score<0 or p_score>v_assignment.max_score
    or p_score='NaN'::numeric then raise exception 'Score must be between 0 and %',v_assignment.max_score; end if;
 v_prior_score:=v_submission.score; v_prior_feedback:=v_submission.feedback;
 update public.assignment_submissions
 set score=p_score,feedback=nullif(pg_catalog.btrim(p_feedback),''),
     graded_by=auth.uid(),graded_at=now(),status='graded',updated_at=now()
 where id=p_submission_id;
 insert into public.assignment_grade_history
  (organization_id,submission_id,changed_by,previous_score,new_score,previous_feedback,new_feedback)
 values (v_submission.organization_id,p_submission_id,auth.uid(),v_prior_score,p_score,
         v_prior_feedback,nullif(pg_catalog.btrim(p_feedback),''));
 return pg_catalog.jsonb_build_object('submission_id',p_submission_id,'score',p_score,
  'feedback',nullif(pg_catalog.btrim(p_feedback),''),'status','graded','graded_at',now());
end;
$function$;
revoke all on function public.grade_assignment_submission(uuid,numeric,text) from public,anon;
grant execute on function public.grade_assignment_submission(uuid,numeric,text) to authenticated;

-- Existing submitted but ungraded work is automatically allocated once, without changing grades.
do $backfill$
declare v_row record;
begin
 for v_row in
  select s.id from public.assignment_submissions s
  where s.status='submitted'
  order by pg_catalog.random()
 loop
  perform private.allocate_assignment_reviewer(v_row.id);
 end loop;
end;
$backfill$;
