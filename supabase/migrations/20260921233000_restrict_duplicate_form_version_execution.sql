revoke execute on function public.duplicate_form_version(uuid) from public;
grant execute on function public.duplicate_form_version(uuid) to authenticated;
alter function public.duplicate_form_version(uuid) security invoker;
