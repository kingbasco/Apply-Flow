-- Require a live Supabase Auth session on every table/storage surface
-- that already has authenticated RLS policies. This is a restrictive layer:
-- existing ownership, role and assignment policies still decide what is allowed.

grant execute on function private.has_active_user_session() to authenticated;

drop policy if exists "ai_screenings_require_active_session" on public."ai_screenings";
create policy "ai_screenings_require_active_session"
on public."ai_screenings"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "answers_require_active_session" on public."answers";
create policy "answers_require_active_session"
on public."answers"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "applicants_require_active_session" on public."applicants";
create policy "applicants_require_active_session"
on public."applicants"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "application_settings_require_active_session" on public."application_settings";
create policy "application_settings_require_active_session"
on public."application_settings"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "applications_require_active_session" on public."applications";
create policy "applications_require_active_session"
on public."applications"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "assignment_answers_require_active_session" on public."assignment_answers";
create policy "assignment_answers_require_active_session"
on public."assignment_answers"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "assignment_documents_require_active_session" on public."assignment_documents";
create policy "assignment_documents_require_active_session"
on public."assignment_documents"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "assignment_grade_history_require_active_session" on public."assignment_grade_history";
create policy "assignment_grade_history_require_active_session"
on public."assignment_grade_history"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "assignment_questions_require_active_session" on public."assignment_questions";
create policy "assignment_questions_require_active_session"
on public."assignment_questions"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "assignment_submissions_require_active_session" on public."assignment_submissions";
create policy "assignment_submissions_require_active_session"
on public."assignment_submissions"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "assignments_require_active_session" on public."assignments";
create policy "assignments_require_active_session"
on public."assignments"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "attendance_records_require_active_session" on public."attendance_records";
create policy "attendance_records_require_active_session"
on public."attendance_records"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "attendance_sessions_require_active_session" on public."attendance_sessions";
create policy "attendance_sessions_require_active_session"
on public."attendance_sessions"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "benefit_distributions_require_active_session" on public."benefit_distributions";
create policy "benefit_distributions_require_active_session"
on public."benefit_distributions"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "benefit_recipients_require_active_session" on public."benefit_recipients";
create policy "benefit_recipients_require_active_session"
on public."benefit_recipients"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "communication_logs_require_active_session" on public."communication_logs";
create policy "communication_logs_require_active_session"
on public."communication_logs"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "communication_templates_require_active_session" on public."communication_templates";
create policy "communication_templates_require_active_session"
on public."communication_templates"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "eligibility_rules_require_active_session" on public."eligibility_rules";
create policy "eligibility_rules_require_active_session"
on public."eligibility_rules"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "form_import_batches_require_active_session" on public."form_import_batches";
create policy "form_import_batches_require_active_session"
on public."form_import_batches"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "form_import_rows_require_active_session" on public."form_import_rows";
create policy "form_import_rows_require_active_session"
on public."form_import_rows"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "form_versions_require_active_session" on public."form_versions";
create policy "form_versions_require_active_session"
on public."form_versions"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "notifications_require_active_session" on public."notifications";
create policy "notifications_require_active_session"
on public."notifications"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "organizations_require_active_session" on public."organizations";
create policy "organizations_require_active_session"
on public."organizations"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "participant_staff_assignments_require_active_session" on public."participant_staff_assignments";
create policy "participant_staff_assignments_require_active_session"
on public."participant_staff_assignments"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "participants_require_active_session" on public."participants";
create policy "participants_require_active_session"
on public."participants"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "profiles_require_active_session" on public."profiles";
create policy "profiles_require_active_session"
on public."profiles"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "programme_requirements_require_active_session" on public."programme_requirements";
create policy "programme_requirements_require_active_session"
on public."programme_requirements"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "question_options_require_active_session" on public."question_options";
create policy "question_options_require_active_session"
on public."question_options"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "questions_require_active_session" on public."questions";
create policy "questions_require_active_session"
on public."questions"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "review_assignments_require_active_session" on public."review_assignments";
create policy "review_assignments_require_active_session"
on public."review_assignments"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "review_audit_logs_require_active_session" on public."review_audit_logs";
create policy "review_audit_logs_require_active_session"
on public."review_audit_logs"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "scoring_criteria_require_active_session" on public."scoring_criteria";
create policy "scoring_criteria_require_active_session"
on public."scoring_criteria"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "selection_audit_logs_require_active_session" on public."selection_audit_logs";
create policy "selection_audit_logs_require_active_session"
on public."selection_audit_logs"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "submission_attempts_require_active_session" on public."submission_attempts";
create policy "submission_attempts_require_active_session"
on public."submission_attempts"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "submission_eligibility_require_active_session" on public."submission_eligibility";
create policy "submission_eligibility_require_active_session"
on public."submission_eligibility"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "submission_scores_require_active_session" on public."submission_scores";
create policy "submission_scores_require_active_session"
on public."submission_scores"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "submission_selections_require_active_session" on public."submission_selections";
create policy "submission_selections_require_active_session"
on public."submission_selections"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "submissions_require_active_session" on public."submissions";
create policy "submissions_require_active_session"
on public."submissions"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "team_invite_links_require_active_session" on public."team_invite_links";
create policy "team_invite_links_require_active_session"
on public."team_invite_links"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "uploaded_documents_require_active_session" on public."uploaded_documents";
create policy "uploaded_documents_require_active_session"
on public."uploaded_documents"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

drop policy if exists "objects_require_active_session" on storage."objects";
create policy "objects_require_active_session"
on storage."objects"
as restrictive
for all
to authenticated
using (private.has_active_user_session())
with check (private.has_active_user_session());

