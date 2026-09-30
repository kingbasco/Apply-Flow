# Participant email corrections

Owners/Admins can open Participants → participant profile → Contact details → Correct email. Enter the corrected email twice and a reason after confirming the intended address with the participant.

The protected `correct_participant_email` RPC updates the canonical applicant record and matching email answers in one database transaction. It requires a live authenticated Owner/Admin session in the participant's organisation, validates the address, rejects collisions within the programme and checks the email originally displayed to prevent stale updates. The privileged implementation lives in the private schema; the public wrapper is SECURITY INVOKER. Anonymous execution is revoked.

Participant attendance, assignments and result portals read `applicants.email` together with Participant ID. The corrected address therefore becomes the access address immediately; the previous address no longer opens those portals. Unused assignment upload sessions are revoked, so an already-open assignment must be reopened with the new email. Participant IDs, attendance records, assignment submissions, scores and staff assignments are retained.

Email delivery resolves the canonical applicant address at send time. Participant exports and matching email form answers use the correction. Only email-type answers or questions labelled Email / Email address whose entire value matches the old address are updated. Other contact answers, original import staging data, historical delivery recipients and previous audit entries are not rewritten. Separate applications belonging to another applicant record are not automatically merged or updated on the basis of a shared email string.

This is participant portal identity correction, not a staff Supabase Auth account email change. Participants currently have no applicant-to-auth-user link. A matching email on a staff account must not be used to infer that it belongs to the participant.

Each correction records old/new email, reason, actor, timestamp and number of corrected answers in `participant_email_changes`. Authenticated clients have SELECT only, limited by RLS to organisation Owners/Admins. A profile displays the latest ten changes. No messages are sent automatically and no typo is guessed or corrected in bulk.

Verification: production build and `tests/participant-email-correction.sql`. The SQL regression uses synthetic records in a transaction and rolls back everything. It verifies validation, stale edits, collision detection, staff/cross-organisation/no-session denial, canonical/form synchronization, stable ID, token revocation, audit, and old/new email access through the real assignment portal RPC.
