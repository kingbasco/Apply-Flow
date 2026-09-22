-- Keep the public RPCs callable only by signed-in workspace users.
-- The functions remain SECURITY DEFINER because they perform privileged,
-- cross-table writes, but anonymous callers must not be able to invoke them.
REVOKE ALL ON FUNCTION public.import_google_form_batch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_google_form_batch(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_google_form_batch(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.reviewer_set_submission_decision(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reviewer_set_submission_decision(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reviewer_set_submission_decision(uuid, text) TO authenticated;
