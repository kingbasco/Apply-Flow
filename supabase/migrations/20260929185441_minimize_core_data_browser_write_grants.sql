-- Minimize browser write privileges for core programme and applicant data.

-- Programme/workspace ownership links should not be client-deletable.
revoke delete on table public.organizations from authenticated;
revoke delete on table public.applications from authenticated;

-- Keep programme identity/ownership immutable while allowing normal editing.
revoke update on table public.applications from authenticated;
grant update(
  name,
  description,
  status,
  deadline,
  target_count,
  participant_id_prefix,
  updated_at
) on table public.applications to authenticated;

-- Application settings are removed only by controlled programme deletion paths.
revoke delete on table public.application_settings from authenticated;

-- Applicant/screening records are server/RPC-owned. Browser users retain only
-- the SELECT rights authorized by RLS.
revoke insert, update, delete on table public.applicants from authenticated;
revoke insert, update, delete on table public.answers from authenticated;
revoke insert, update, delete on table public.ai_screenings from authenticated;
revoke insert, update, delete on table public.submission_eligibility from authenticated;
revoke insert, update, delete on table public.submission_selections from authenticated;

-- Submission creation and final decisions use authorization-aware RPC paths.
revoke insert, update, delete on table public.submissions from authenticated;

-- Review assignment creation/updates use authorization-aware RPC paths.
revoke insert, update, delete on table public.review_assignments from authenticated;
