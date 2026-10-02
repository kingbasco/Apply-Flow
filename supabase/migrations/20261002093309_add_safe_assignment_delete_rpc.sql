create or replace function public.delete_assignment(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_assignment public.assignments;
  v_answer_count integer:=0;
  v_document_count integer:=0;
begin
  if auth.uid() is null or not private.has_active_user_session() then
    raise exception 'Authentication required.';
  end if;

  select * into v_assignment
  from public.assignments
  where id=p_assignment_id;

  if v_assignment.id is null then
    raise exception 'Assignment not found.';
  end if;

  if not private.is_org_admin(v_assignment.organization_id) then
    raise exception 'Only Owner or Admin can delete assignments.';
  end if;

  delete from public.assignment_documents d
  using public.assignment_submissions s
  where d.submission_id=s.id
    and s.assignment_id=p_assignment_id;
  get diagnostics v_document_count = row_count;

  delete from public.assignment_answers a
  using public.assignment_submissions s
  where a.submission_id=s.id
    and s.assignment_id=p_assignment_id;
  get diagnostics v_answer_count = row_count;

  delete from public.assignments
  where id=p_assignment_id;

  return jsonb_build_object(
    'deleted',true,
    'answers_deleted',v_answer_count,
    'documents_deleted',v_document_count
  );
end;
$function$;

revoke all on function public.delete_assignment(uuid) from public,anon;
grant execute on function public.delete_assignment(uuid) to authenticated;
