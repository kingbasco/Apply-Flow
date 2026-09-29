-- Restrict anonymous public-form reads to the columns required by the public UI.

revoke select on table public.application_settings from anon;
revoke select on table public.applications from anon;
revoke select on table public.form_versions from anon;
revoke select on table public.questions from anon;
revoke select on table public.question_options from anon;

grant select(
  application_id,
  public_slug,
  confirmation_message,
  start_date,
  applicant_instructions
) on table public.application_settings to anon;

grant select(
  id,
  name,
  description,
  deadline,
  status
) on table public.applications to anon;

grant select(
  id,
  application_id,
  status,
  version_number
) on table public.form_versions to anon;

grant select(
  id,
  form_version_id,
  type,
  label,
  description,
  required,
  placeholder,
  position,
  config,
  conditional_rules
) on table public.questions to anon;

grant select(
  id,
  question_id,
  label,
  value,
  position
) on table public.question_options to anon;
