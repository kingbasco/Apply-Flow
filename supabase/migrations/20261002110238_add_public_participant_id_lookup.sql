create or replace function public.lookup_participant_id_by_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_matches jsonb;
begin
  if length(v_email)>320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    return jsonb_build_object('error','Enter a valid registration email address.');
  end if;

  if not private.record_public_attempt('participant_id_lookup_global',null,120,600)
     or not private.record_public_attempt('participant_id_lookup_email',v_email,10,600) then
    return jsonb_build_object('error','Too many attempts. Please wait a few minutes and try again.');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'programme_name',a.name,
        'participant_id',p.participant_id
      )
      order by p.joined_at desc,a.name
    ),
    '[]'::jsonb
  )
  into v_matches
  from public.participants p
  join public.applicants ap on ap.id=p.applicant_id
  join public.applications a on a.id=p.application_id
  where p.status='active'
    and lower(trim(coalesce(ap.email,'')))=v_email;

  if jsonb_array_length(v_matches)=0 then
    return jsonb_build_object('error','No active participant record was found for this email address.');
  end if;

  return jsonb_build_object('matches',v_matches);
end;
$function$;

revoke all on function public.lookup_participant_id_by_email(text) from public;
grant execute on function public.lookup_participant_id_by_email(text) to anon,authenticated;
