create or replace function public.mark_application_document_uploaded(p_submission_id uuid,p_storage_path text)
returns void language plpgsql security definer set search_path to 'pg_catalog','public'
as $function$
begin
 update public.uploaded_documents d
 set status='uploaded',updated_at=now()
 where d.submission_id=p_submission_id
   and d.storage_path=p_storage_path
   and d.status='pending'
   and exists (
     select 1 from public.submissions s
     join public.applications a on a.id=s.application_id
     where s.id=d.submission_id and s.status='submitted' and a.status='published'
   );
 if not found then raise exception 'Application document not found.'; end if;
end;
$function$;
revoke execute on function public.mark_application_document_uploaded(uuid,text) from public;
grant execute on function public.mark_application_document_uploaded(uuid,text) to anon,authenticated;
