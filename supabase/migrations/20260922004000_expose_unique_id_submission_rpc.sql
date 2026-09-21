create or replace function public.submit_application_with_id(
  p_application_id uuid,
  p_form_version_id uuid,
  p_email text,
  p_full_name text,
  p_answers jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_submission_id uuid;
  v_applicant_id uuid;
  v_unique_id text;
begin
  v_submission_id := private.submit_application(
    p_application_id,
    p_form_version_id,
    p_email,
    p_full_name,
    p_answers
  );

  select applicant_id into v_applicant_id
  from public.submissions
  where id = v_submission_id;

  select unique_id into v_unique_id
  from public.applicants
  where id = v_applicant_id;

  return jsonb_build_object(
    'submission_id', v_submission_id,
    'unique_id', v_unique_id
  );
end;
$function$;

revoke execute on function public.submit_application_with_id(uuid,uuid,text,text,jsonb) from public;
revoke execute on function public.submit_application_with_id(uuid,uuid,text,text,jsonb) from authenticated;
grant execute on function public.submit_application_with_id(uuid,uuid,text,text,jsonb) to anon;
