# Known Limitations and Roadmap

This document records known product/operational gaps. It is not a promise of delivery order.

## Assignment deletion safety

Current assignment deletion is hard delete.

Recommended next step:

- Archive/Trash state.
- Restore window.
- Explicit permanent-delete action.
- Protection when submissions exist.
- Backup/recovery runbook.

The existing recovery UI is useful for incident reconstruction but is not a replacement for recoverable deletion.

## Backup and disaster recovery

Define and periodically verify:

- Database backup availability for the current Supabase tier.
- Recovery objectives.
- Storage backup expectations.
- Export/restore runbook.
- Incident ownership.

Do not assume point-in-time recovery is available unless the current project plan explicitly provides it.

## Automated test coverage

Current automated tests are narrow.

Recommended coverage:

- Roles/permission matrix.
- Programme publish/submission.
- Screening/final decision.
- Participant assignment/unassignment.
- Attendance.
- Assignment multi-file submission.
- Grading/result release.
- Group-scoped leaderboards.
- Email batch reporting.
- WhatsApp consent/campaign rules.

## Security advisor cleanup

Continue reviewing:

- SECURITY DEFINER exposure.
- Function EXECUTE grants.
- RLS performance warnings.
- Missing indexes.
- Storage policies.
- Public endpoint rate limits.
- Session invalidation.
- MFA strategy for privileged accounts.

## Participant email correction

The browser-accessible email-correction feature is currently disabled.

If reintroduced, it should be re-reviewed with:

- Identity collision handling.
- Portal authentication effects.
- Audit history.
- Communication delivery behavior.
- Admin-only permission tests.

## Communications

Email:

- Real inbox delivery should be tested when provider configuration changes.
- Durable queue/idempotency would improve large/bulk sends.
- Provider acceptance is not the same as delivery.

WhatsApp:

- Production use depends on valid Meta configuration, approved templates and explicit consent.
- Webhook delivery/read reporting should be monitored against real production campaigns.

## Document extraction

Uploaded-document extraction infrastructure exists, but complete PDF/document extraction quality should be treated as an area for continuing QA.

## Benefits module

Benefits/distribution structures exist but are not as heavily validated as the core application/participant/assignment flows.

## Documentation discipline

Every meaningful feature or permission change should update:

- Relevant feature doc.
- `docs/README.md` if navigation changes.
- Root README only when the product overview or setup changes.
