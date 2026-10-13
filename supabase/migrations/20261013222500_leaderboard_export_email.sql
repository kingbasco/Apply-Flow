-- Admin/Owner-only contact lookup for Overall Leaderboard export.
-- Keeps participant email out of the leaderboard RPCs used by Programme Staff.

create or replace function public.get_leaderboard_export_contacts(p_application_id uuid)
returns table(
  participant_record_id uuid,
  email text
)
language sql
stable
security definer
set search_path=''
as $function$
  with me as (
    select p.organization_id
    from public.profiles p
    join public.applications a on a.organization_id=p.organization_id
    where p.id=auth.uid()
      and a.id=p_application_id
      and p.role in ('owner','admin')
      and private.has_active_user_session()
  )
  select
    pt.id as participant_record_id,
    ap.email
  from public.participants pt
  join me on true
  left join public.applicants ap on ap.id=pt.applicant_id
  where pt.application_id=p_application_id
    and pt.status='active';
$function$;

revoke all on function public.get_leaderboard_export_contacts(uuid) from public,anon;
grant execute on function public.get_leaderboard_export_contacts(uuid) to authenticated;

notify pgrst, 'reload schema';
