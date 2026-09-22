create or replace function private.trigger_evaluate_eligibility_from_answer()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if exists (
    select 1
    from public.submissions
    where id = coalesce(new.submission_id, old.submission_id)
  ) then
    perform private.evaluate_submission_eligibility(coalesce(new.submission_id, old.submission_id));
  end if;
  return coalesce(new, old);
end;
$function$;
