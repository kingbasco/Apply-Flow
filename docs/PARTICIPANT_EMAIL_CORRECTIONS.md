# Participant Email Corrections

**Current status: disabled for browser-authenticated users.**

A participant email-correction feature was implemented historically, including:

- Canonical applicant email update.
- Matching email-answer update.
- Collision validation.
- Expected-old-email/stale-edit protection.
- Assignment upload-session revocation.
- Audit history in participant_email_changes.
- Owner/Admin authorization logic.

However, migration:

**20260930150000_disable_participant_email_correction.sql**

explicitly revoked browser-authenticated execution of:

**public.correct_participant_email(uuid,text,text,text)**

As a result, the normal authenticated ApplyFlow frontend should **not** be documented as currently supporting participant email correction.

## Why this matters

Participant public portals use the canonical applicant email together with Participant ID.

Changing that email affects access to:

- Attendance.
- Assignments.
- Results.

Because of the identity impact, this workflow was removed from normal browser use pending further review.

## Historical implementation

The earlier implementation attempted to update, in one controlled transaction:

- applicants.email
- matching email-type form answers
- correction audit record
- unused assignment upload sessions

It intentionally did not rewrite unrelated free-text/contact answers or historical provider delivery logs.

## Current operational guidance

Do not instruct staff to use a "Correct email" frontend action unless that feature is explicitly re-enabled and re-verified.

If an exceptional correction is required, treat it as a controlled admin/data-maintenance task with:

- Identity verification.
- Collision check.
- Audit note.
- Portal-access verification.
- Communication/export follow-up checks.

## Re-enablement checklist

Before restoring browser access:

1. Re-review RPC permissions.
2. Confirm Owner/Admin-only enforcement.
3. Re-run collision/stale-edit tests.
4. Verify old email can no longer open participant portals.
5. Verify new email can open them.
6. Verify participant ID and programme records remain unchanged.
7. Verify audit history.
8. Run production build and controlled browser QA.

Historical regression coverage exists in:

**tests/participant-email-correction.sql**

See [PARTICIPANTS_AND_OPERATIONS.md](./PARTICIPANTS_AND_OPERATIONS.md) for the current participant workflow.
