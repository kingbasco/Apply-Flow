-- Public applicant pages need to read published programme metadata.
-- Keep the policy read-only and limited to published applications.
drop policy if exists public_applications_select on public.applications;
create policy public_applications_select
  on public.applications
  for select
  to anon
  using (status = 'published');
