create or replace function private.log_review_assignment_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org_id uuid;
begin
  if tg_op = 'INSERT' then
    select a.organization_id into v_org_id
    from public.submissions s
    join public.applications a on a.id = s.application_id
    where s.id = new.submission_id;

    insert into public.review_audit_logs
      (review_assignment_id, organization_id, action, to_status, new_score, actor_id, metadata)
    values
      (new.id, v_org_id, 'assigned', new.status, new.score, (select auth.uid()),
       jsonb_build_object('reviewer_id', new.reviewer_id, 'submission_id', new.submission_id,
                          'decision', new.decision));
    return new;

  elsif tg_op = 'UPDATE' then
    select a.organization_id into v_org_id
    from public.submissions s
    join public.applications a on a.id = s.application_id
    where s.id = new.submission_id;

    if old.status is distinct from new.status
       or old.score is distinct from new.score
       or old.notes is distinct from new.notes
       or old.reviewer_id is distinct from new.reviewer_id
       or old.submission_id is distinct from new.submission_id
       or old.decision is distinct from new.decision then
      insert into public.review_audit_logs
        (review_assignment_id, organization_id, action, from_status, to_status,
         previous_score, new_score, actor_id, metadata)
      values
        (new.id, v_org_id, 'updated', old.status, new.status, old.score, new.score,
         (select auth.uid()),
         jsonb_build_object(
           'notes_changed', old.notes is distinct from new.notes,
           'reviewer_changed', old.reviewer_id is distinct from new.reviewer_id,
           'submission_changed', old.submission_id is distinct from new.submission_id,
           'decision_changed', old.decision is distinct from new.decision,
           'from_decision', old.decision,
           'to_decision', new.decision
         ));
    end if;
    return new;

  elsif tg_op = 'DELETE' then
    select a.organization_id into v_org_id
    from public.submissions s
    join public.applications a on a.id = s.application_id
    where s.id = old.submission_id;

    insert into public.review_audit_logs
      (review_assignment_id, organization_id, action, from_status, previous_score, actor_id, metadata)
    values
      (null, v_org_id, 'deleted', old.status, old.score, (select auth.uid()),
       jsonb_build_object('reviewer_id', old.reviewer_id, 'submission_id', old.submission_id,
                          'decision', old.decision, 'review_assignment_id', old.id));
    return old;
  end if;
  return null;
end;
$function$;
