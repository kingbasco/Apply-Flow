# ApplyFlow

> **Application intake, screening, participant operations, communication, attendance, assignments and reporting — in one workspace.**

ApplyFlow is a production-oriented application and programme operations platform for organisations running grants, fellowships, scholarships, training programmes, community initiatives, recruitment drives and other application-based programmes.

The core workflow is:

~~~text
Create programme
→ Build or import form
→ Publish
→ Collect applications
→ Check eligibility
→ Screen / review
→ Approve or reject
→ Approved applicant becomes participant
→ Assign participant to staff
→ Communicate / onboard
→ Track attendance and assignments
→ Analyse outcomes
~~~

AI and automated screening features assist the programme team. Final approval/rejection decisions remain human-controlled.

---

## Current status — 29 September 2026

| Area | Status |
|---|---|
| Workspace foundation | ✅ Built |
| Authentication and profiles | ✅ Built + hardened |
| Organisation branding | ✅ Built |
| Programme management | ✅ Built |
| Form builder and versioning | ✅ Built + verified |
| Google Form CSV import | ✅ Built |
| Public application flow | ✅ Built |
| Eligibility rules | ✅ Built |
| Screening and review | ✅ Built |
| Quick screening profile | ✅ Built |
| Participant management | ✅ Built |
| Participant-to-staff assignment | ✅ Built |
| Participant CSV export | ✅ Built |
| Email Center / Zoho SMTP | ✅ Integrated + mailbox validated |
| Attendance | ✅ Built |
| Programme assignments | ✅ Built |
| Grading and participant results | ✅ Built |
| Programme leaderboard | ✅ Built |
| Team invite links | ✅ Built |
| In-app notifications | ✅ Built |
| Analytics | ✅ Built |
| Security hardening | 🟡 Advanced / ongoing |
| Full end-to-end production QA | 🟡 Ongoing |

**Latest verified commit:** 85f7020baa66cb18ecc915befbd9929af3339193

For that commit:

- TypeScript/Vite production build passed.
- Vercel deployment status passed.
- ApplyFlow QA Supervisor passed.
- Browser smoke check found rendered content and no runtime error overlay.
- The form publishing regression involving legacy conditional rules was fixed and deployed.

---

## Product roles

ApplyFlow currently uses three workspace roles:

### Owner

The Owner has the highest organisation-level control.

Key capabilities include:

- Manage the organisation.
- Manage programmes.
- Manage Admins and Programme Staff.
- Remove Admins safely.
- Publish and manage forms.
- Manage screening and review operations.
- Assign participants to staff.
- Send participant email.
- Manage attendance and assignments.
- Access analytics and settings.

### Admin

Admins can manage normal programme operations but cannot remove or manage an Owner and cannot remove peer Admins where owner-only hierarchy applies.

### Programme Staff

The UI uses **Programme Staff** for the operational reviewer/staff role. Some internal database code still uses the legacy role value **reviewer**.

Programme Staff access is assignment-aware. They can work with applications/participants assigned to them according to the current programme permissions.

---

## Programme lifecycle

Programmes support:

- Name and description.
- Application deadline.
- Target participant count.
- Public application slug.
- Applicant instructions.
- Submission limits.
- Confirmation messages.
- Participant ID prefix.
- Draft / Published / Closed / Completed lifecycle.
- Publish/unpublish and close controls.
- Protected programme deletion.

Programme deletion is restricted to Owner/Admin access and handled through protected database logic.

---

## Form builder and versioning

The form builder supports:

- Short text.
- Long text.
- Email.
- Phone.
- Number.
- Date.
- Dropdown.
- Single choice.
- Multiple choice.
- Yes/No.
- Nigerian State.
- Nigerian LGA.
- File upload.
- Image upload.
- Rating.
- Required fields.
- Descriptions.
- Placeholders.
- Options.
- Conditional questions.
- Preview.
- Reordering.
- Draft and published versions.

### Version integrity

Published form versions are immutable. Editing a published form creates a new draft version.

~~~text
Published v1
→ Draft v2
→ Publish v2
→ Draft v3
~~~

Conditional rules and eligibility references are remapped when a version is cloned.

A September 29 regression exposed older imported conditional-rule values stored as empty JSON objects rather than arrays. The current draft data was repaired, and the frontend now normalises legacy conditional-rule values so preview, loading and publishing do not crash.

---

## Google Form import

ApplyFlow supports importing Google Form responses/data through the import workflow.

Implemented capabilities include:

- CSV-based import.
- Import staging.
- Batch tracking.
- Mapping imported questions.
- Handling imported forms where no local form exists yet.
- Timestamp validation fixes.
- Import into the real application/submission model.

Imported form structures can be edited after import through ApplyFlow's form workflow.

---

## Public application experience

The public application flow supports:

- Published programme validation.
- Start date.
- Deadline.
- Submission-limit enforcement.
- Published form loading.
- Conditional questions.
- State/LGA logic.
- File/image uploads.
- Required-field validation.
- Submission confirmation.
- Participant ID generation.

Public file uploads are validated before upload. Current browser validation allows the supported JPG, PNG, WebP, PDF, DOC and DOCX types with a 15 MB per-file limit.

Submission limits are enforced in protected backend logic rather than trusting a public browser count.

---

## Participant identity

Applicants/participants use a human-readable ID:

~~~text
PREFIX-YEAR-00001
~~~

Example:

~~~text
ECA-2026-00001
~~~

The same public ID is retained through the applicant-to-participant lifecycle while internal UUIDs remain private database identifiers.

---

## Eligibility

Eligibility rules are configured from application questions.

The current system supports:

- Question-based requirements.
- Numeric ranges.
- Single expected values.
- Multi-value matching.
- Enabled/disabled rules.
- Automatic evaluation.
- Pending results when required evidence is missing.

Eligibility is one input to human review; it does not silently make the final programme decision.

---

## Screening and review

The current visible review flow is intentionally simpler than the earlier score-heavy design.

Human reviewer scoring was removed from the main screening UI and analytics.

Current screening/review includes:

- Submitted applications.
- Eligibility state.
- Review modal/full application view.
- Assigned Programme Staff.
- Owner/Admin review assignment management.
- Owner/Admin **Assigned to me** personal queue.
- Final approve/reject action.
- Audit/history records.
- Pagination.
- Page-scoped selection.

### Quick screening profile

The current quick screening action is optimised for fast operational review and extracts only:

1. Age.
2. Residential Address.
3. Trade.

This avoids the previous long recommendation/strength/concern output for routine screening.

Final decisions remain human-controlled.

---

## Participant management

Approved applicants become participants automatically.

Participant lifecycle:

~~~text
Approved
→ Active / Enrolled
→ Completed
   or
→ Withdrawn
~~~

Participant management includes:

- Participant ID.
- Name.
- Email.
- Programme.
- Status.
- Joined date.
- Full-screen participant profile.
- Attendance information.
- Selection checkboxes.
- Bulk staff assignment.
- Page-scoped selection.
- Pagination.

### Pagination

Participant, Screening and Review lists use reusable pagination controls.

Default page size:

- 50 rows.

Supported operational sizes include:

- 50.
- 100.
- 200.
- 300.

The Email Center uses 50-step sizes such as 50, 100, 150, 200 and so on.

---

## Participant-to-staff assignment

ApplyFlow has a dedicated participant staff assignment model.

Owners/Admins can:

- Select participants.
- Assign them to an Admin or Programme Staff member.
- Work in operational groups such as 50 participants per staff member.

These assignments are reused by Email Center. ApplyFlow does not create a separate email grouping system.

---

## Participant export

Participant export supports configurable CSV fields.

Base fields include:

- Participant ID.
- Name.
- Email.
- Programme.
- Status.
- Joined Date.

The export can also include selected answers from the participant's application form, including imported contact fields.

This allows teams to export only the data required for a specific operational task.

---

## Email Center

ApplyFlow includes an Email workspace with:

- Compose.
- Templates.
- Zoho connection.
- Programme selection.
- Audience filtering.
- Assigned-staff filtering.
- Participant search.
- Recipient checkboxes.
- Merge fields.
- WhatsApp group link merge field.
- Template saving.
- Zoho delivery state.

### Zoho transport

ApplyFlow uses a Zoho **application-specific password + SMTP** integration.

The secret values stay in Supabase Edge Function Secrets and are never shipped to React.

The OAuth Self Client path was intentionally abandoned for this single-organisation setup because SMTP App Password authentication is operationally simpler.

Current SMTP configuration:

- Secure direct TLS connection.
- Port 465.
- Organisation/standard Zoho SMTP host fallback.
- Owner/Admin authorization.
- Individual recipient delivery.
- Maximum backend batch size of 50.

The frontend can select more than 50 recipients and automatically sends them in safe groups of 50.

### Assignment-aware email groups

Email recipients can be filtered by the staff member they are assigned to.

Example workflow:

~~~text
Programme
→ Assigned to: Staff A (50)
→ Select all 50
→ Add Staff A WhatsApp group link
→ Send

Then:

Assigned to: Staff B (50)
→ Select all 50
→ Add Staff B WhatsApp group link
→ Send
~~~

Changing the assigned-staff filter clears the previous selection to reduce cross-group mistakes.

**Connection status:** the Zoho mailbox has been successfully validated in production.

**Still to verify:** a real participant email delivery should be exercised and confirmed end-to-end before email delivery is called fully production-verified.

---

## Attendance

Attendance operations include:

- Attendance sessions.
- Session date.
- Friendly editable check-in slug.
- Shareable public check-in link.
- Native date picker support.
- Dark-mode-safe date/calendar controls.
- Participant self check-in.
- Duplicate prevention.
- Attendance records linked to participants.

Public participant check-in requires:

- Participant ID.
- Application email.

This avoids using a participant ID alone as the only lookup secret.

---

## Programme assignments

ApplyFlow includes programme assignment infrastructure:

- Assignment creation.
- Assignment questions.
- Public assignment link.
- Participant submission.
- Secure assignment file uploads.
- One participant submission flow.
- Grading.
- Score.
- Marker feedback.
- Grade history.
- Result release.
- Participant results portal.
- Programme-wide leaderboard.

Participant assignment/results access requires both:

- Participant ID.
- Application email.

Leaderboard behaviour is programme-wide and only released/graded entries are surfaced according to the assignment/result rules.

---

## Team management and invitations

Team operations include:

- Owner.
- Admin.
- Programme Staff.
- Invite team member flow.
- Shareable invitation links.
- Role-specific invite links.
- Expiring links.
- Single-use links.
- Invitee account setup.
- Safe member removal.
- Owner-only Admin removal.

The invite-link endpoint is public by necessity, but validates the invite token and cleans up newly created auth users if the invite claim fails.

---

## Authentication and account security

Supported authentication:

- Email/password.
- Google OAuth.
- Username/password.
- Password reset.
- Profile setup.
- Team invite signup.

Recent hardening includes:

- Minimum 10-character password requirement for new/reset/invited accounts.
- Username login moved behind a server-side Edge Function.
- Generic invalid-credential responses to reduce username/email enumeration.
- Session creation from the authenticated server response.
- Sign out all sessions control.
- Participant public portals require ID + application email.
- Public file upload type/size validation.
- Protected privileged RPC grants.
- Organisation-scoped RLS.
- Owner/Admin hierarchy checks.

Service-role credentials remain server-side only.

---

## Storage and uploaded documents

ApplyFlow separates public branding assets from protected programme/application files.

Uploaded-document infrastructure includes:

- Storage path.
- Original filename.
- MIME type.
- File size.
- Submission/question relationship.
- Extraction status.
- Extracted text.

Document extraction infrastructure supports supported text/data/image cases and authenticated organisation access.

Full PDF extraction/verification remains an area for further production QA and implementation.

---

## In-app notifications

Workspace notifications include:

- Notification bell.
- Unread count.
- Latest notifications list.
- Relative timestamps.
- Mark one as read.
- Mark all as read.
- Supabase Realtime updates.
- Click-through to relevant workspace areas.

---

## Analytics

Analytics follows the current participant lifecycle.

Metrics include:

- Submissions.
- Approved/enrolled.
- Rejected.
- Active participants.
- Completed.
- Withdrawn.
- Approval rate.
- Completion rate.
- Withdrawal rate.
- Submission trend.
- Programme breakdown.

Human reviewer score metrics were removed from the visible product after the review workflow was simplified.

---

## Security architecture

ApplyFlow uses Supabase/Postgres with organisation-scoped access.

Core boundaries include:

- Row Level Security on public tables.
- Protected privileged RPCs.
- Secure Edge Functions.
- Organisation-scoped access checks.
- Role hierarchy.
- Immutable published form versions.
- Public token validation.
- Private server secrets.
- Restricted public participant lookups.
- File validation.
- Audit logs.

Security hardening is advanced but remains an ongoing production discipline. Remaining work includes continued review of:

- SECURITY DEFINER surface.
- RPC grants.
- Storage policies.
- Rate limiting.
- MFA strategy.
- Monitoring/alerting.
- Backup/recovery.
- Security advisor/performance advisor cleanup.

---

## Active Supabase Edge Functions

The live project currently has these active Edge Functions:

- run-ai-screening
- extract-application-document
- invite-team-member
- manage-team-member
- accept-team-invite-link
- zoho-mail-status
- send-zoho-email
- username-login

Most private functions verify authenticated sessions. Public functions such as invite acceptance and username login use purpose-specific validation instead of exposing general database access.

---

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 19 |
| Language | TypeScript |
| Build | Vite 7 |
| Icons | Lucide React |
| Database | PostgreSQL |
| Backend | Supabase |
| Authentication | Supabase Auth |
| Storage | Supabase Storage |
| Realtime | Supabase Realtime |
| Server functions | Supabase Edge Functions |
| Deployment | Vercel |
| Source control | GitHub |
| CI/QA | GitHub Actions + ApplyFlow QA Supervisor |

---

## Repository structure

~~~text
Apply-Flow/
├── agent/
│   └── supervisor.mjs
├── docs/
│   └── APPLYFLOW_PROJECT_MASTER.md
├── src/
│   ├── components/
│   │   ├── EmailWorkspace.tsx
│   │   ├── GoogleFormImport.tsx
│   │   ├── ParticipantsPanel.tsx
│   │   ├── TablePagination.tsx
│   │   └── WorkspaceModules.tsx
│   ├── lib/
│   ├── App.tsx
│   └── styles.css
├── supabase/
│   ├── functions/
│   └── migrations/
├── package.json
└── README.md
~~~

---

## Development

Install:

~~~bash
npm install
~~~

Run locally:

~~~bash
npm run dev
~~~

Production build:

~~~bash
npm run build
~~~

Preview:

~~~bash
npm run preview
~~~

Run the QA supervisor:

~~~bash
npm run agent
~~~

---

## Deployment and automated QA

ApplyFlow uses a GitHub → Vercel workflow plus an automated QA supervisor.

The supervisor verifies:

1. GitHub access.
2. Build.
3. Vercel deployment readiness.
4. Browser page content.
5. Runtime error overlay state.

The earlier Vercel-token configuration issue has been resolved.

**Current state:** the supervisor is active in GitHub Actions and passes on the current main branch.

---

## Latest system verification

A full regression/audit pass on 29 September 2026 confirmed:

- Fresh Build Check passed.
- Fresh QA Supervisor passed.
- Vercel was READY.
- Browser smoke test passed.
- Public database tables had RLS enabled.
- No broken participant/application references were found.
- No broken participant/staff references were found.
- No broken review/submission references were found.
- No invalid participant/review states were found after checking the real schema constraints.
- No duplicate participant codes were found.
- No duplicate participant/staff assignment pairs were found.
- No duplicate review assignments were found.
- Zoho status endpoint returned authenticated HTTP 200 responses.

The automated browser supervisor is a smoke test, not a full authenticated click-through suite. Authenticated workflows still require real user-journey QA when a feature is changed.

---

## Known items still requiring final production verification

- Real Zoho participant email delivery.
- Assignment-aware email with real populated staff groups.
- Full attendance end-to-end user journey.
- Assignment → grading → released result end-to-end QA.
- Full Google Form import QA against representative production exports.
- Document/PDF extraction completeness.
- Mobile QA.
- Accessibility QA.
- Security advisor cleanup.
- Storage/security review.
- Backup/recovery plan.
- Monitoring and alerting.
- MFA product decision and implementation if required.

---

## Product decisions to preserve

1. **Approved = selected/enrolled.** Do not reintroduce a separate shortlist/final-selection stage unless requirements change.
2. **AI/automation is advisory.** Humans make approval/rejection decisions.
3. **Published form versions are immutable.**
4. **Participant ID is the user-facing lifecycle identifier.**
5. **Internal UUIDs stay internal.**
6. **Staff assignment is the shared grouping model.** Email should reuse participant staff assignments rather than inventing separate groups.
7. **Security is enforced server-side and in RLS, not only in UI visibility.**
8. **Secrets never belong in GitHub or frontend code.**

---

## Current roadmap

### Near-term

- Complete end-to-end QA for Email Center.
- Exercise 50-person staff assignment → email group workflow.
- Complete remaining security hardening.
- Continue storage/RPC review.
- Finish attendance and assignment operational QA.
- Expand test automation beyond smoke coverage.

### Later

- Rich HTML email templates.
- Communication delivery history/queue/retry UI.
- More form-answer email merge fields.
- Automated approval/rejection/onboarding email triggers.
- Full document verification.
- Certificates/completion workflows.
- MFA if adopted as a product requirement.

---

**ApplyFlow — applications in, decisions forward.**
