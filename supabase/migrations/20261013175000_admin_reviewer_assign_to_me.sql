-- Reviewer allocation update:
-- 1) Enable Seyi Tytler (Admin) as an explicit assignment reviewer.
-- 2) Disable the Cyril test reviewer again.
-- 3) Keep Test-group participant submissions excluded.
-- 4) Allow active Programme Staff to appear automatically.
-- 5) Add Admin "Assign to Me" support.
-- 6) Do not preselect reviewers in the UI (handled in frontend).

insert into public.assignment_review_staff_settings(staff_id,organization_id,is_eligible,reason,updated_at)
values
('2c4e331b-882c-455c-9563-bb9f118a1cb8'::uuid,'1e4c3430-b4e6-4055-88fc-755e32a0c14d'::uuid,true,'Admin reviewer enabled for assignment marking',now())
on conflict (staff_id) do update
set is_eligible=true,
    reason='Admin reviewer enabled for assignment marking',
    updated_at=now();

insert into public.assignment_review_staff_settings(staff_id,organization_id,is_eligible,reason,updated_at)
values
('d66e0790-fabc-491a-922b-3d361d469b8f'::uuid,'1e4c3430-b4e6-4055-88fc-755e32a0c14d'::uuid,false,'Test account excluded from assignment review',now())
on conflict (staff_id) do update
set is_eligible=false,
    reason='Test account excluded from assignment review',
    updated_at=now();

drop function if exists public.get_assignment_review_staff(uuid);

create function public.get_assignment_review_staff(p_assignment_id uuid)
returns table(
  staff_id uuid,
  staff_name text,
  staff_role text,
  is_eligible boolean,
  participant_count bigint,
  exclusion_reason text
)
language plpgsql stable security definer set search_path=''
as $function$
declare v_org uuid;
begin
 if not private.has_active_user_session() then raise exception 'Authentication required'; end if;

 select a.organization_id into v_org
 from public.assignments a
 where a.id=p_assignment_id;

 if v_org is null or not exists(
   select 1 from public.profiles p
   where p.id=auth.uid()
     and p.organization_id=v_org
     and p.role in ('owner','admin')
 ) then raise exception 'Access denied'; end if;

 return query
 select
   p.id,
   p.full_name,
   p.role,
   case
     when p.role='admin' then coalesce(ss.is_eligible,false) and p.invitation_status='active'
     else coalesce(ss.is_eligible,true) and p.invitation_status='active'
   end,
   (select count(distinct psa.participant_id)
      from public.participant_staff_assignments psa
      where psa.staff_id=p.id
        and psa.application_id=(select a.application_id from public.assignments a where a.id=p_assignment_id)),
   case
     when p.invitation_status<>'active' then 'Inactive account'
     when p.role='admin' and coalesce(ss.is_eligible,false)=false then 'Admin not enabled for marking'
     else ss.reason
   end
 from public.profiles p
 left join public.assignment_review_staff_settings ss on ss.staff_id=p.id
 where p.organization_id=v_org
   and (
     p.role='reviewer'
     or (p.role='admin' and coalesce(ss.is_eligible,false)=true)
   )
 order by case when p.role='admin' then 0 else 1 end,p.full_name,p.id;
end;
$function$;

revoke all on function public.get_assignment_review_staff(uuid) from public,anon;
grant execute on function public.get_assignment_review_staff(uuid) to authenticated;

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
 v_blind_number integer;
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
 if v_selected_count=0 or v_staff_count=0 then raise exception 'Select at least one ungraded submission and one reviewer'; end if;
 if v_selected_count>5000 then raise exception 'Maximum 5000 submissions per shuffle'; end if;
 if v_selected_count<>(select count(distinct x) from unnest(p_submission_ids) as x)
    or v_staff_count<>(select count(distinct x) from unnest(p_reviewer_ids) as x) then
   raise exception 'Duplicate IDs in selection';
 end if;

 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_assignment_id::text,2026));

 if (select count(*) from public.assignment_submissions s
     where s.id=any(p_submission_ids)
       and s.assignment_id=p_assignment_id
       and s.organization_id=v_org
       and s.status='submitted'
       and private.is_assignment_review_participant_eligible(s.participant_id,v_org)
    )<>v_selected_count then
    raise exception 'Your selection contains an invalid, graded or excluded participant submission';
 end if;

 if (
   select count(*)
   from public.profiles p
   left join public.assignment_review_staff_settings ss on ss.staff_id=p.id
   where p.id=any(p_reviewer_ids)
     and p.organization_id=v_org
     and p.invitation_status='active'
     and (
       (p.role='reviewer' and coalesce(ss.is_eligible,true))
       or
       (p.role='admin' and coalesce(ss.is_eligible,false))
     )
 )<>v_staff_count then
   raise exception 'Your reviewer selection includes an inactive or excluded account';
 end if;

 perform 1 from public.assignment_submissions s
 where s.id=any(p_submission_ids) order by s.id for update;

 if exists (
   select 1 from public.assignment_submissions s
   where s.id=any(p_submission_ids) and s.status<>'submitted'
 ) then raise exception 'A selected submission was graded during allocation. Refresh and retry'; end if;

 insert into public.assignment_review_allocation_events
  (organization_id,assignment_id,submission_id,reviewer_before,reviewer_after,assigned_by,action,batch_id)
 select ra.organization_id,ra.assignment_id,ra.submission_id,ra.reviewer_id,null,auth.uid(),'manual_reassignment',v_batch
 from public.assignment_review_allocations ra
 where ra.submission_id=any(p_submission_ids);

 delete from public.assignment_review_allocations ra
 where ra.submission_id=any(p_submission_ids);

 for v_row in
   select s.id,s.participant_id
   from public.assignment_submissions s
   where s.id=any(p_submission_ids)
   order by pg_catalog.random()
 loop
   select p.id into v_reviewer
   from public.profiles p
   left join public.assignment_review_staff_settings ss on ss.staff_id=p.id
   where p.id=any(p_reviewer_ids)
     and p.organization_id=v_org
     and p.invitation_status='active'
     and (
       (p.role='reviewer' and coalesce(ss.is_eligible,true))
       or
       (p.role='admin' and coalesce(ss.is_eligible,false))
     )
     and not exists (
       select 1 from public.participant_staff_assignments psa
       where psa.participant_id=v_row.participant_id and psa.staff_id=p.id
     )
   order by
     (select count(*) from public.assignment_review_allocations ra
      where ra.assignment_id=p_assignment_id and ra.reviewer_id=p.id),
     pg_catalog.random()
   limit 1;

   if v_reviewer is null then
     raise exception 'Selected reviewers cannot review all these submissions without marking their own group; choose more reviewers';
   end if;

   select coalesce(max(ra.blind_number),0)+1 into v_blind_number
   from public.assignment_review_allocations ra
   where ra.assignment_id=p_assignment_id and ra.reviewer_id=v_reviewer;

   insert into public.assignment_review_allocations
      (organization_id,assignment_id,submission_id,reviewer_id,assigned_by,blind_number)
   values(v_org,p_assignment_id,v_row.id,v_reviewer,auth.uid(),v_blind_number);

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

create or replace function public.assign_assignment_reviews_to_me(
  p_assignment_id uuid,p_submission_ids uuid[]
)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
 v_org uuid;
 v_profile public.profiles;
 v_selected_count integer;
 v_row record;
 v_blind_number integer;
 v_assigned integer:=0;
 v_batch uuid:=gen_random_uuid();
begin
 if not private.has_active_user_session() then raise exception 'Authentication required'; end if;

 select a.organization_id into v_org from public.assignments a where a.id=p_assignment_id;
 select * into v_profile from public.profiles p
 where p.id=auth.uid() and p.organization_id=v_org;

 if v_profile.id is null
    or v_profile.role<>'admin'
    or v_profile.invitation_status<>'active'
    or not exists (
      select 1 from public.assignment_review_staff_settings ss
      where ss.staff_id=v_profile.id and ss.organization_id=v_org and ss.is_eligible=true
    ) then
   raise exception 'This Admin account is not enabled for assignment marking';
 end if;

 v_selected_count:=coalesce(pg_catalog.array_length(p_submission_ids,1),0);
 if v_selected_count=0 then raise exception 'Select at least one ungraded submission'; end if;
 if v_selected_count>5000 then raise exception 'Maximum 5000 submissions per action'; end if;
 if v_selected_count<>(select count(distinct x) from unnest(p_submission_ids) as x) then raise exception 'Duplicate submission IDs in selection'; end if;

 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_assignment_id::text,2026));

 if (select count(*) from public.assignment_submissions s
     where s.id=any(p_submission_ids)
       and s.assignment_id=p_assignment_id
       and s.organization_id=v_org
       and s.status='submitted'
       and private.is_assignment_review_participant_eligible(s.participant_id,v_org)
    )<>v_selected_count then
   raise exception 'Your selection contains an invalid, graded or excluded participant submission';
 end if;

 perform 1 from public.assignment_submissions s
 where s.id=any(p_submission_ids) order by s.id for update;

 insert into public.assignment_review_allocation_events
  (organization_id,assignment_id,submission_id,reviewer_before,reviewer_after,assigned_by,action,batch_id)
 select ra.organization_id,ra.assignment_id,ra.submission_id,ra.reviewer_id,auth.uid(),auth.uid(),'assign_to_me',v_batch
 from public.assignment_review_allocations ra
 where ra.submission_id=any(p_submission_ids)
   and ra.reviewer_id is distinct from auth.uid();

 delete from public.assignment_review_allocations ra
 where ra.submission_id=any(p_submission_ids)
   and ra.reviewer_id is distinct from auth.uid();

 for v_row in
   select s.id from public.assignment_submissions s
   where s.id=any(p_submission_ids)
   order by s.id
 loop
   if not exists (
     select 1 from public.assignment_review_allocations ra
     where ra.submission_id=v_row.id and ra.reviewer_id=auth.uid()
   ) then
     select coalesce(max(ra.blind_number),0)+1 into v_blind_number
     from public.assignment_review_allocations ra
     where ra.assignment_id=p_assignment_id and ra.reviewer_id=auth.uid();

     insert into public.assignment_review_allocations
       (organization_id,assignment_id,submission_id,reviewer_id,assigned_by,blind_number)
     values(v_org,p_assignment_id,v_row.id,auth.uid(),auth.uid(),v_blind_number);

     insert into public.assignment_review_allocation_events
       (organization_id,assignment_id,submission_id,reviewer_before,reviewer_after,assigned_by,action,batch_id)
     values(v_org,p_assignment_id,v_row.id,null,auth.uid(),auth.uid(),'assign_to_me',v_batch);
   end if;
   v_assigned:=v_assigned+1;
 end loop;

 return pg_catalog.jsonb_build_object('assigned',v_assigned,'batch_id',v_batch);
end;
$function$;

revoke all on function public.assign_assignment_reviews_to_me(uuid,uuid[]) from public,anon;
grant execute on function public.assign_assignment_reviews_to_me(uuid,uuid[]) to authenticated;

-- Disabled reviewer accounts must not be able to open their old review queue.
create or replace function public.get_assignment_review_queue(p_assignment_id uuid)
returns table (
 submission_id uuid,assignment_id uuid,participant_id uuid,participant_code text,participant_name text,
 blind_label text,answer_count bigint,document_count bigint,status text,submitted_at timestamptz,
 score numeric,feedback text,graded_at timestamptz,reviewer_id uuid,reviewer_name text,source_group text,assigned_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $function$
declare v_org uuid;v_admin boolean;v_role text;
begin
 if not private.has_active_user_session() then raise exception 'Authentication required'; end if;
 select a.organization_id into v_org from public.assignments a where a.id=p_assignment_id;
 select p.role into v_role from public.profiles p where p.id=auth.uid() and p.organization_id=v_org;
 if v_org is null or v_role not in ('owner','admin','reviewer') then raise exception 'Access denied'; end if;
 if v_role='reviewer' and exists (
   select 1 from public.assignment_review_staff_settings ss
   where ss.staff_id=auth.uid() and ss.organization_id=v_org and ss.is_eligible=false
 ) then raise exception 'Assignment review access is disabled for this account'; end if;
 v_admin:=v_role in ('owner','admin');

 return query
 select
   s.id,s.assignment_id,
   case when v_admin then s.participant_id else null end,
   case when v_admin then pt.participant_id else null end,
   case when v_admin then ap.full_name else null end,
   case when ra.reviewer_id is null then null else 'Submission '||pg_catalog.lpad(coalesce(ra.blind_number,1)::text,2,'0') end,
   (select count(*) from public.assignment_answers aa where aa.submission_id=s.id),
   (select count(*) from public.assignment_documents ad where ad.submission_id=s.id),
   s.status,case when v_admin then s.submitted_at else null end,s.score,s.feedback,s.graded_at,
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
 where s.assignment_id=p_assignment_id
   and s.organization_id=v_org
   and private.is_assignment_review_participant_eligible(s.participant_id,v_org)
   and (v_admin or ra.reviewer_id=auth.uid())
 order by (s.status='graded'),coalesce(ra.blind_number,2147483647),s.id;
end;
$function$;

revoke all on function public.get_assignment_review_queue(uuid) from public,anon;
grant execute on function public.get_assignment_review_queue(uuid) to authenticated;

-- Detail and grading calls also enforce disabled reviewer status.
create or replace function public.get_assignment_review_submission(p_submission_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare
 v_submission public.assignment_submissions;v_profile public.profiles;v_allocation public.assignment_review_allocations;
 v_admin boolean;v_answers jsonb;v_documents jsonb;
begin
 if not private.has_active_user_session() then raise exception 'Authentication required'; end if;
 select * into v_submission from public.assignment_submissions where id=p_submission_id;
 if v_submission.id is null then raise exception 'Submission not found'; end if;
 select * into v_profile from public.profiles where id=auth.uid() and organization_id=v_submission.organization_id;
 if v_profile.id is null or v_profile.role not in ('owner','admin','reviewer') then raise exception 'Access denied'; end if;
 if v_profile.role='reviewer' and exists (
   select 1 from public.assignment_review_staff_settings ss
   where ss.staff_id=auth.uid() and ss.organization_id=v_submission.organization_id and ss.is_eligible=false
 ) then raise exception 'Assignment review access is disabled for this account'; end if;
 v_admin:=v_profile.role in ('owner','admin');
 select * into v_allocation from public.assignment_review_allocations where submission_id=p_submission_id;
 if not v_admin and (v_allocation.id is null or v_allocation.reviewer_id<>auth.uid()) then raise exception 'This submission is not in your review queue'; end if;

 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'id',x.id,'question_id',x.question_id,'value',x.value,
   'assignment_questions',pg_catalog.jsonb_build_object('label',x.label,'type',x.question_type,'position',x.position)
 ) order by x.position,x.id),'[]'::jsonb)
 into v_answers
 from (
   select aa.id,aa.question_id,aa.value,aq.label,aq.type as question_type,aq.position
   from public.assignment_answers aa
   left join public.assignment_questions aq on aq.id=aa.question_id
   where aa.submission_id=p_submission_id
 ) x;

 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'id',d.id,'question_id',d.question_id,'storage_bucket',d.storage_bucket,'storage_path',d.storage_path,
   'original_name',case when v_admin then d.original_name else 'Attachment '||d.file_number||coalesce(d.extension,'') end,
   'file_size',d.file_size
 ) order by d.file_number),'[]'::jsonb)
 into v_documents
 from (
   select ad.id,ad.question_id,ad.storage_bucket,ad.storage_path,ad.original_name,ad.file_size,
     row_number() over(order by ad.created_at,ad.id)::integer as file_number,
     case when pg_catalog.strpos(ad.original_name,'.')>0
       then '.'||pg_catalog.lower(pg_catalog.split_part(ad.original_name,'.',pg_catalog.array_length(pg_catalog.string_to_array(ad.original_name,'.'),1)))
       else '' end as extension
   from public.assignment_documents ad
   where ad.submission_id=p_submission_id
 ) d;

 return pg_catalog.jsonb_build_object(
   'submission_id',v_submission.id,
   'blind_label',case when v_allocation.reviewer_id is null then null else 'Submission '||pg_catalog.lpad(coalesce(v_allocation.blind_number,1)::text,2,'0') end,
   'participant_id',case when v_admin then v_submission.participant_id else null end,
   'submitted_at',case when v_admin then v_submission.submitted_at else null end,
   'status',v_submission.status,'score',v_submission.score,'feedback',v_submission.feedback,'graded_at',v_submission.graded_at,
   'answers',v_answers,'documents',v_documents
 );
end;
$function$;

revoke all on function public.get_assignment_review_submission(uuid) from public,anon;
grant execute on function public.get_assignment_review_submission(uuid) to authenticated;

create or replace function public.grade_assignment_submission(p_submission_id uuid,p_score numeric,p_feedback text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_submission public.assignment_submissions;v_assignment public.assignments;v_profile public.profiles;
 v_prior_score numeric;v_prior_feedback text;
begin
 if not private.has_active_user_session() then raise exception 'Authentication required'; end if;
 select * into v_submission from public.assignment_submissions where id=p_submission_id for update;
 if v_submission.id is null then raise exception 'Submission not found'; end if;
 select * into v_profile from public.profiles where id=auth.uid() and organization_id=v_submission.organization_id;
 if v_profile.id is null or v_profile.role not in ('owner','admin','reviewer') then raise exception 'You do not have permission to grade this submission'; end if;

 if v_profile.role='reviewer' then
   if exists (
      select 1 from public.assignment_review_staff_settings ss
      where ss.staff_id=auth.uid() and ss.organization_id=v_submission.organization_id and ss.is_eligible=false
   ) then raise exception 'Assignment review access is disabled for this account'; end if;
   if not exists (
      select 1 from public.assignment_review_allocations ra
      where ra.submission_id=p_submission_id and ra.reviewer_id=auth.uid()
   ) then raise exception 'This submission is not in your review queue'; end if;
   if v_submission.status='graded' then raise exception 'This work was already graded. Ask an Admin to make corrections'; end if;
 end if;

 select * into v_assignment from public.assignments where id=v_submission.assignment_id;
 if p_score is null or p_score<0 or p_score>v_assignment.max_score or p_score='NaN'::numeric then
   raise exception 'Score must be between 0 and %',v_assignment.max_score;
 end if;

 v_prior_score:=v_submission.score;v_prior_feedback:=v_submission.feedback;
 update public.assignment_submissions
 set score=p_score,feedback=nullif(pg_catalog.btrim(p_feedback),''),
     graded_by=auth.uid(),graded_at=now(),status='graded',updated_at=now()
 where id=p_submission_id;

 insert into public.assignment_grade_history
  (organization_id,submission_id,changed_by,previous_score,new_score,previous_feedback,new_feedback)
 values(v_submission.organization_id,p_submission_id,auth.uid(),v_prior_score,p_score,v_prior_feedback,nullif(pg_catalog.btrim(p_feedback),''));

 return pg_catalog.jsonb_build_object(
   'submission_id',p_submission_id,'score',p_score,'feedback',nullif(pg_catalog.btrim(p_feedback),''),
   'status','graded','graded_at',now()
 );
end;
$function$;

revoke all on function public.grade_assignment_submission(uuid,numeric,text) from public,anon;
grant execute on function public.grade_assignment_submission(uuid,numeric,text) to authenticated;

notify pgrst, 'reload schema';
