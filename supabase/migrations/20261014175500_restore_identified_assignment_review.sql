-- Revert blind grading presentation while preserving allocation controls and audit fields.
-- Programme Staff can again see participant identity and normal submission metadata
-- for submissions assigned to them. Actual grader identity remains Admin/Owner-only.

drop function if exists public.get_assignment_review_queue(uuid);

create function public.get_assignment_review_queue(p_assignment_id uuid)
returns table (
 submission_id uuid,
 assignment_id uuid,
 participant_id uuid,
 participant_code text,
 participant_name text,
 blind_label text,
 answer_count bigint,
 document_count bigint,
 status text,
 submitted_at timestamptz,
 score numeric,
 feedback text,
 graded_at timestamptz,
 reviewer_id uuid,
 reviewer_name text,
 graded_by_id uuid,
 graded_by_name text,
 source_group text,
 assigned_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
 v_org uuid;
 v_admin boolean;
 v_role text;
begin
 if not private.has_active_user_session() then raise exception 'Authentication required'; end if;

 select a.organization_id into v_org
 from public.assignments a
 where a.id=p_assignment_id;

 select p.role into v_role
 from public.profiles p
 where p.id=auth.uid()
   and p.organization_id=v_org;

 if v_org is null or v_role not in ('owner','admin','reviewer') then
   raise exception 'Access denied';
 end if;

 if v_role='reviewer' and exists (
   select 1
   from public.assignment_review_staff_settings ss
   where ss.staff_id=auth.uid()
     and ss.organization_id=v_org
     and ss.is_eligible=false
 ) then
   raise exception 'Assignment review access is disabled for this account';
 end if;

 v_admin:=v_role in ('owner','admin');

 return query
 select
   s.id,
   s.assignment_id,
   s.participant_id,
   pt.participant_id,
   ap.full_name,
   case when ra.reviewer_id is null then null else 'Submission '||pg_catalog.lpad(coalesce(ra.blind_number,1)::text,2,'0') end,
   (select count(*) from public.assignment_answers aa where aa.submission_id=s.id),
   (select count(*) from public.assignment_documents ad where ad.submission_id=s.id),
   s.status,
   s.submitted_at,
   s.score,
   s.feedback,
   s.graded_at,
   case when v_admin then ra.reviewer_id else null end,
   case when v_admin then rp.full_name else null end,
   case when v_admin then s.graded_by else null end,
   case when v_admin then gp.full_name else null end,
   (
      select pg_catalog.string_agg(coalesce(group_profile.full_name,'Staff member'),', ' order by group_profile.full_name)
      from public.participant_staff_assignments psa
      join public.profiles group_profile on group_profile.id=psa.staff_id
      where psa.participant_id=s.participant_id
   ),
   ra.assigned_at
 from public.assignment_submissions s
 join public.participants pt on pt.id=s.participant_id
 left join public.applicants ap on ap.id=pt.applicant_id
 left join public.assignment_review_allocations ra on ra.submission_id=s.id
 left join public.profiles rp on rp.id=ra.reviewer_id
 left join public.profiles gp on gp.id=s.graded_by
 where s.assignment_id=p_assignment_id
   and s.organization_id=v_org
   and private.is_assignment_review_participant_eligible(s.participant_id,v_org)
   and (v_admin or ra.reviewer_id=auth.uid())
 order by (s.status='graded'),coalesce(ra.blind_number,2147483647),s.id;
end;
$function$;

revoke all on function public.get_assignment_review_queue(uuid) from public,anon;
grant execute on function public.get_assignment_review_queue(uuid) to authenticated;

create or replace function public.get_assignment_review_submission(p_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
 v_submission public.assignment_submissions;
 v_profile public.profiles;
 v_allocation public.assignment_review_allocations;
 v_answers jsonb;
 v_documents jsonb;
 v_participant_code text;
 v_participant_name text;
 v_source_group text;
begin
 if not private.has_active_user_session() then raise exception 'Authentication required'; end if;

 select * into v_submission from public.assignment_submissions where id=p_submission_id;
 if v_submission.id is null then raise exception 'Submission not found'; end if;

 select * into v_profile
 from public.profiles
 where id=auth.uid()
   and organization_id=v_submission.organization_id;

 if v_profile.id is null or v_profile.role not in ('owner','admin','reviewer') then
   raise exception 'Access denied';
 end if;

 if v_profile.role='reviewer' and exists (
   select 1 from public.assignment_review_staff_settings ss
   where ss.staff_id=auth.uid()
     and ss.organization_id=v_submission.organization_id
     and ss.is_eligible=false
 ) then
   raise exception 'Assignment review access is disabled for this account';
 end if;

 select * into v_allocation
 from public.assignment_review_allocations
 where submission_id=p_submission_id;

 if v_profile.role='reviewer' and (v_allocation.id is null or v_allocation.reviewer_id<>auth.uid()) then
   raise exception 'This submission is not in your review queue';
 end if;

 select pt.participant_id,ap.full_name
 into v_participant_code,v_participant_name
 from public.participants pt
 left join public.applicants ap on ap.id=pt.applicant_id
 where pt.id=v_submission.participant_id;

 select pg_catalog.string_agg(coalesce(gp.full_name,'Staff member'),', ' order by gp.full_name)
 into v_source_group
 from public.participant_staff_assignments psa
 join public.profiles gp on gp.id=psa.staff_id
 where psa.participant_id=v_submission.participant_id;

 select coalesce(
   pg_catalog.jsonb_agg(
     pg_catalog.jsonb_build_object(
       'id',x.id,
       'question_id',x.question_id,
       'value',x.value,
       'assignment_questions',pg_catalog.jsonb_build_object(
         'label',x.label,'type',x.question_type,'position',x.position
       )
     ) order by x.position,x.id
   ),'[]'::jsonb
 )
 into v_answers
 from (
   select aa.id,aa.question_id,aa.value,aq.label,aq.type as question_type,aq.position
   from public.assignment_answers aa
   left join public.assignment_questions aq on aq.id=aa.question_id
   where aa.submission_id=p_submission_id
 ) x;

 select coalesce(
   pg_catalog.jsonb_agg(
     pg_catalog.jsonb_build_object(
       'id',ad.id,
       'question_id',ad.question_id,
       'storage_bucket',ad.storage_bucket,
       'storage_path',ad.storage_path,
       'original_name',ad.original_name,
       'file_size',ad.file_size
     ) order by ad.created_at,ad.id
   ),'[]'::jsonb
 )
 into v_documents
 from public.assignment_documents ad
 where ad.submission_id=p_submission_id;

 return pg_catalog.jsonb_build_object(
   'submission_id',v_submission.id,
   'participant_id',v_submission.participant_id,
   'participant_code',v_participant_code,
   'participant_name',v_participant_name,
   'source_group',v_source_group,
   'submitted_at',v_submission.submitted_at,
   'status',v_submission.status,
   'score',v_submission.score,
   'feedback',v_submission.feedback,
   'graded_at',v_submission.graded_at,
   'answers',v_answers,
   'documents',v_documents
 );
end;
$function$;

revoke all on function public.get_assignment_review_submission(uuid) from public,anon;
grant execute on function public.get_assignment_review_submission(uuid) to authenticated;

notify pgrst, 'reload schema';
