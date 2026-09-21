-- Phase 10: tighten overlapping RLS policies and keep organisation scope explicit.
-- Removes legacy self-only application/profile policies and avoids ALL policies
-- implicitly overlapping explicit SELECT/UPDATE policies.

drop policy if exists "Users can view their applications" on public.applications;
drop policy if exists "Users can create applications" on public.applications;
drop policy if exists "Users can update their applications" on public.applications;
drop policy if exists "Users can delete their applications" on public.applications;

drop policy if exists "Users can view their profile" on public.profiles;
drop policy if exists "Users can update their profile" on public.profiles;

drop policy if exists answers_org_write on public.answers;
create policy answers_org_write on public.answers
  for insert to authenticated
  with check (exists (
    select 1 from public.submissions s
    join public.applications a on a.id = s.application_id
    where s.id = answers.submission_id and private.is_org_admin(a.organization_id)
  ));
create policy answers_org_update on public.answers
  for update to authenticated
  using (exists (
    select 1 from public.submissions s
    join public.applications a on a.id = s.application_id
    where s.id = answers.submission_id and private.is_org_admin(a.organization_id)
  ))
  with check (exists (
    select 1 from public.submissions s
    join public.applications a on a.id = s.application_id
    where s.id = answers.submission_id and private.is_org_admin(a.organization_id)
  ));
create policy answers_org_delete on public.answers
  for delete to authenticated
  using (exists (
    select 1 from public.submissions s
    join public.applications a on a.id = s.application_id
    where s.id = answers.submission_id and private.is_org_admin(a.organization_id)
  ));

drop policy if exists question_options_org_write on public.question_options;
create policy question_options_org_write on public.question_options
  for insert to authenticated
  with check (exists (
    select 1 from public.questions q
    join public.form_versions v on v.id = q.form_version_id
    join public.applications a on a.id = v.application_id
    where q.id = question_options.question_id and private.is_org_admin(a.organization_id)
  ));
create policy question_options_org_update on public.question_options
  for update to authenticated
  using (exists (
    select 1 from public.questions q
    join public.form_versions v on v.id = q.form_version_id
    join public.applications a on a.id = v.application_id
    where q.id = question_options.question_id and private.is_org_admin(a.organization_id)
  ))
  with check (exists (
    select 1 from public.questions q
    join public.form_versions v on v.id = q.form_version_id
    join public.applications a on a.id = v.application_id
    where q.id = question_options.question_id and private.is_org_admin(a.organization_id)
  ));
create policy question_options_org_delete on public.question_options
  for delete to authenticated
  using (exists (
    select 1 from public.questions q
    join public.form_versions v on v.id = q.form_version_id
    join public.applications a on a.id = v.application_id
    where q.id = question_options.question_id and private.is_org_admin(a.organization_id)
  ));

drop policy if exists questions_org_write on public.questions;
create policy questions_org_write on public.questions
  for insert to authenticated
  with check (exists (
    select 1 from public.form_versions v
    join public.applications a on a.id = v.application_id
    where v.id = questions.form_version_id and private.is_org_admin(a.organization_id)
  ));
create policy questions_org_update on public.questions
  for update to authenticated
  using (exists (
    select 1 from public.form_versions v
    join public.applications a on a.id = v.application_id
    where v.id = questions.form_version_id and private.is_org_admin(a.organization_id)
  ))
  with check (exists (
    select 1 from public.form_versions v
    join public.applications a on a.id = v.application_id
    where v.id = questions.form_version_id and private.is_org_admin(a.organization_id)
  ));
create policy questions_org_delete on public.questions
  for delete to authenticated
  using (exists (
    select 1 from public.form_versions v
    join public.applications a on a.id = v.application_id
    where v.id = questions.form_version_id and private.is_org_admin(a.organization_id)
  ));

drop policy if exists application_settings_org_write on public.application_settings;
create policy application_settings_org_insert on public.application_settings
  for insert to authenticated
  with check (exists (
    select 1 from public.applications a
    where a.id = application_settings.application_id and private.is_org_admin(a.organization_id)
  ));
create policy application_settings_org_delete on public.application_settings
  for delete to authenticated
  using (exists (
    select 1 from public.applications a
    where a.id = application_settings.application_id and private.is_org_admin(a.organization_id)
  ));

drop policy if exists submissions_org_write on public.submissions;
create policy submissions_org_insert on public.submissions
  for insert to authenticated
  with check (exists (
    select 1 from public.applications a
    where a.id = submissions.application_id and private.is_org_admin(a.organization_id)
  ));
create policy submissions_org_update on public.submissions
  for update to authenticated
  using (exists (
    select 1 from public.applications a
    where a.id = submissions.application_id and private.is_org_admin(a.organization_id)
  ))
  with check (exists (
    select 1 from public.applications a
    where a.id = submissions.application_id and private.is_org_admin(a.organization_id)
  ));
create policy submissions_org_delete on public.submissions
  for delete to authenticated
  using (exists (
    select 1 from public.applications a
    where a.id = submissions.application_id and private.is_org_admin(a.organization_id)
  ));


drop policy if exists review_assignments_org_admin_select on public.review_assignments;
drop policy if exists review_assignments_reviewer_select on public.review_assignments;
create policy review_assignments_select on public.review_assignments
  for select to authenticated
  using (
    reviewer_id = (select auth.uid())
    or exists (
      select 1
      from public.submissions s
      join public.applications a on a.id = s.application_id
      where s.id = review_assignments.submission_id
        and private.is_org_admin(a.organization_id)
    )
  );
