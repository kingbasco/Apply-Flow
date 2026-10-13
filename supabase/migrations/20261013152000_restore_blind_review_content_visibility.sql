-- Keep blind grading anonymous while making submission content explicit in the
-- Programme Staff queue. Counts make it obvious that each anonymous row still
-- has submitted work, while the detail RPC continues to return the full answers
-- and attachments without participant identity.

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
 source_group text,
 assigned_at timestamptz
)
language plpgsql stable security definer set search_path=''
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

 v_admin:=v_role in ('owner','admin');

 return query
 select
   s.id,
   s.assignment_id,
   case when v_admin then s.participant_id else null end,
   case when v_admin then pt.participant_id else null end,
   case when v_admin then ap.full_name else null end,
   case
     when ra.reviewer_id is null then null
     else 'Submission '||pg_catalog.lpad(coalesce(ra.blind_number,1)::text,2,'0')
   end,
   (select count(*) from public.assignment_answers aa where aa.submission_id=s.id),
   (select count(*) from public.assignment_documents ad where ad.submission_id=s.id),
   s.status,
   case when v_admin then s.submitted_at else null end,
   s.score,
   s.feedback,
   s.graded_at,
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

notify pgrst, 'reload schema';
