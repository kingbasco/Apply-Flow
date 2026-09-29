-- Retire the legacy tokenless application upload and submission entry points.
drop policy if exists "applicant public upload application files" on storage.objects;

revoke execute on function public.submit_application(uuid,uuid,text,text,jsonb)
  from public, anon, authenticated;
revoke execute on function public.submit_application_with_participant_id(uuid,uuid,text,text,jsonb)
  from public, anon, authenticated;

grant execute on function public.submit_application(uuid,uuid,text,text,jsonb)
  to service_role;
grant execute on function public.submit_application_with_participant_id(uuid,uuid,text,text,jsonb)
  to service_role;
