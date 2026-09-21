-- Phase 11: add covering indexes for high-traffic screening/review foreign keys.
create index if not exists answers_question_id_idx on public.answers(question_id);
create index if not exists submissions_form_version_id_idx on public.submissions(form_version_id);
create index if not exists review_audit_logs_actor_id_idx on public.review_audit_logs(actor_id);
create index if not exists submission_eligibility_overridden_by_idx on public.submission_eligibility(overridden_by);
create index if not exists submission_selections_decided_by_idx on public.submission_selections(decided_by);
