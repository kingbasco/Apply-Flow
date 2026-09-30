# ApplyFlow — Project Master

> **Living source of truth for product architecture, implementation status, security boundaries, verified behaviour and roadmap.**

Repository: **kingbasco/Apply-Flow**  
Stack: **React 19 + TypeScript + Vite + Supabase/Postgres/Auth/Storage/Realtime/Edge Functions + Vercel**  
Last reconciled: **29 September 2026**  
Latest reconciled commit: **85f7020baa66cb18ecc915befbd9929af3339193**

---

# 1. Product definition

ApplyFlow is an application and programme operations system for organisations running:

- Grants.
- Fellowships.
- Scholarships.
- Recruitment programmes.
- Training cohorts.
- Community programmes.
- Business-support programmes.
- Other application-based initiatives.

The operating model is:

~~~text
Programme
→ Form
→ Applications
→ Eligibility
→ Screening / Review
→ Approve or Reject
→ Participant
→ Staff assignment
→ Communication
→ Attendance / Assignments
→ Completion / Outcomes
→ Analytics
~~~

The product is designed to replace scattered spreadsheets, form exports, messaging groups and manual participant tracking with one controlled workspace.

---

# 2. Core product rules

These decisions should not be accidentally reversed.

## 2.1 No shortlist stage

Current model:

~~~text
Approved = Selected = Enrolled
~~~

There is no separate shortlist/final-selection layer.

## 2.2 Human final decisions

Automation and AI can assist screening, extraction and operational review.

A human authorised by the organisation makes the final approval/rejection decision.

## 2.3 Published form versions are immutable

Historical submissions must always remain interpretable against the exact form version used at submission time.

## 2.4 One public participant identity

The human-facing identifier is:

~~~text
PREFIX-YEAR-00001
~~~

Internal UUIDs remain database-only identifiers.

## 2.5 Staff assignment is the grouping model

Participant-to-staff assignment is the shared operational grouping layer.

Email, workload distribution and staff-owned participant groups should reuse this model instead of creating parallel group tables unless a future requirement genuinely needs them.

## 2.6 Security is server enforced

Hiding a button is not authorization.

Critical actions require RLS, protected RPCs or Edge Function authorization.

---

# 3. Roles and access model

ApplyFlow currently has:

## Owner

Highest organisation-level role.

Can manage:

- Organisation settings.
- Admins.
- Programme Staff.
- Programmes.
- Forms.
- Screening/review.
- Participants.
- Participant staff assignment.
- Email.
- Attendance.
- Assignments.
- Analytics.
- Security/account settings.

The Owner can safely remove Admins.

## Admin

Operational administrator.

Admin access is organisation-scoped.

Admins cannot remove/manage the Owner and cannot remove peer Admins where owner-only hierarchy is enforced.

## Programme Staff

The visible product uses the term **Programme Staff**.

Some legacy/internal database values still use **reviewer** for this role.

Programme Staff access is assignment-aware and can include review/final-decision capability where explicitly assigned and authorised.

---

# 4. High-level technical architecture

~~~text
Browser
  │
  ▼
React + TypeScript + Vite
  │
  ├───────────────┐
  ▼               ▼
Supabase Client   Public participant/application routes
  │               │
  ▼               ▼
Auth / RLS / RPC / Edge Functions
  │
  ▼
PostgreSQL + Storage + Realtime
  │
  ├── Zoho SMTP
  └── external AI/document services where used

GitHub
  │
  ▼
GitHub Actions
  │
  ▼
Vercel
  │
  ▼
QA Supervisor + browser smoke verification
~~~

---

# 5. Frontend structure

Primary application files:

- src/App.tsx
- src/components/WorkspaceModules.tsx
- src/components/ParticipantsPanel.tsx
- src/components/EmailWorkspace.tsx
- src/components/GoogleFormImport.tsx
- src/components/TablePagination.tsx
- src/lib/supabase.ts
- src/lib/errors.ts
- src/lib/nigeria.ts
- src/styles.css

App.tsx still contains several public participant/application routes and core programme/form logic. WorkspaceModules contains larger authenticated workspace modules.

---

# 6. Authentication

Implemented:

- Email/password sign up.
- Email/password sign in.
- Google OAuth.
- Username/password sign in.
- Password recovery.
- Password reset.
- Profile setup.
- Team invite account setup.
- Sign out everywhere.

## 6.1 Username login security

Username login previously required resolving a username to an email in the browser.

That was hardened.

Current flow:

~~~text
Username + Password
→ username-login Edge Function
→ server resolves username
→ server attempts Supabase Auth sign-in
→ generic invalid-credential failure
→ session returned only after successful authentication
~~~

This reduces account-enumeration leakage.

## 6.2 Password policy

New/reset/invite flows require a minimum 10-character password.

## 6.3 Session controls

Account settings include a sign-out-all-sessions operation.

---

# 7. Organisation and workspace

Implemented:

- Organisation record.
- Organisation profile.
- Organisation branding/logo.
- User profile.
- Workspace navigation.
- Light/dark themes.
- Role-aware areas.
- Responsive layouts.
- User-friendly error normalization.
- Improved keyboard focus/interactive-row accessibility.

Branding assets are kept separate from participant/application document storage.

---

# 8. Programme management

Programme/application records support:

- Name.
- Description.
- Deadline.
- Target count.
- Participant ID prefix.
- Public slug.
- Applicant instructions.
- Confirmation message.
- Submission limit.
- Draft / Published / Closed / Completed state.

Publishing validates required configuration.

Programme deletion has been hardened to Owner/Admin access and protected backend logic.

Programme Staff cannot delete programmes.

---

# 9. Form builder

Question types include:

- short_text
- long_text
- email
- phone
- number
- date
- dropdown
- single_choice
- multiple_choice
- yes_no
- nigeria_state
- nigeria_lga
- file
- image
- rating

Builder capabilities include:

- Add.
- Edit.
- Delete.
- Reorder.
- Required toggle.
- Description.
- Placeholder.
- Choice options.
- Conditional display.
- Preview.
- Publish.
- Version cloning.

---

# 10. Form version integrity

Published forms are immutable.

When a published version needs changes, ApplyFlow creates a new draft and clones:

- Questions.
- Options.
- Conditional rules.
- Eligibility question references.

Conditional-rule question IDs are remapped to the cloned question IDs.

## 10.1 Legacy conditional-rule regression

On 29 September 2026 a publish action exposed older imported questions whose conditional_rules JSON was stored as an empty object rather than an array.

Observed failure:

~~~text
(...conditional_rules || []).map is not a function
~~~

Resolution:

- Current draft malformed values were changed to NULL.
- Published historical versions were left untouched because the database correctly blocks published-form mutation.
- Frontend read/clone paths now normalise conditional_rules and treat non-array legacy values as no rules.
- Build, Vercel and QA Supervisor passed after the fix.

This preserves historical immutability while preventing legacy data from crashing future cloning/publishing.

---

# 11. Google Form import

Implemented foundation:

- CSV import.
- Import staging tables.
- Batch tracking.
- Row tracking.
- Form/question creation where required.
- Import when no local form exists.
- Timestamp validation fixes.
- Integration with the real applicant/submission model.

Operational note:

Imported questions can be structurally simple and may need field-type cleanup in the visual form builder after import.

Full representative production-export QA remains useful.

---

# 12. Public application flow

Current flow:

~~~text
Public slug
→ Load programme settings
→ Verify published programme
→ Verify start/deadline
→ Load latest published form
→ Applicant completes form
→ Validate visible required fields/files
→ Protected submission
→ Return participant/applicant ID
~~~

Capabilities:

- Conditional questions.
- State/LGA fields.
- File/image upload.
- Confirmation.
- Submission limit.
- Public ID return.

## 12.1 Submission-limit security

The browser no longer relies on a public count query to enforce submission limits.

The backend submission path is responsible for authoritative limit enforcement.

## 12.2 Public upload validation

Current frontend validation allows:

- image/png
- image/jpeg
- image/webp
- application/pdf
- application/msword
- DOCX MIME type

Maximum size:

- 15 MB per file.

Storage/backend controls remain part of the security boundary; browser validation is an additional guard, not the only guard.

---

# 13. Participant identity

Participant identity uses:

~~~text
PREFIX-YEAR-SYSTEM_NUMBER
~~~

Example:

~~~text
ECA-2026-00001
~~~

Goals:

- Human-readable.
- Stable through the lifecycle.
- Unique within the required organisation/prefix/year scope.
- Internal UUID not exposed as the operational ID.

Approved applicants retain their public ID as participants.

---

# 14. Eligibility

Eligibility is configured from form questions.

Supported rule patterns include:

- Equals.
- Inclusion.
- Numeric/rating range.
- Enabled/disabled rules.

All active requirements are intended to be satisfied for eligibility.

Missing required evidence should remain Pending rather than being guessed.

Eligibility informs review but does not replace human approval.

---

# 15. Screening direction

The visible screening experience has been simplified.

Earlier reviewer-score-heavy UI was removed from:

- Screening list.
- Review modal.
- Programme views.
- Analytics.

The intended product direction is:

~~~text
Applicant
→ Review submitted application
→ See eligibility
→ Optional quick screen
→ Human approve/reject
~~~

Legacy scoring tables may still exist for historical/schema compatibility, but reviewer score is no longer a primary visible decision mechanism.

---

# 16. Quick screening

The current run-ai-screening function is optimised for a short operational profile.

The UI displays only:

1. Age.
2. Residential Address.
3. Trade.

The current quick screening path reads application answers and persists a small structured profile rather than producing a long AI narrative.

This was introduced to reduce latency and remove unnecessary recommendation/strength/concern output.

Human decision authority remains unchanged.

---

# 17. Reviews and work queues

Review infrastructure includes:

- Review assignments.
- Reviewer/Programme Staff assignment.
- Status.
- Notes.
- Audit history.
- Organisation scope.
- Direct final decisions through protected logic.

Owner/Admin also have a top-level:

**Assigned to me**

personal queue showing applications specifically assigned to the current user.

The queue reuses the existing review assignment model and opens the same review experience.

---

# 18. Review/Screening pagination

Screening and Review tables use shared pagination.

Default:

- 50 rows.

Available standard sizes:

- 50.
- 100.
- 200.
- 300.

Select-all behaviour is page-scoped.

Selections can persist across pages where the workflow needs it.

---

# 19. Final decisions and participant conversion

Decision logic has been centralised in protected backend actions.

Final outcomes:

- Approved.
- Rejected.

Approved:

~~~text
Submission approved
→ participant record created/synchronised
→ participant ID retained
→ Active / Enrolled
~~~

Programme Staff can make final decisions when the user is assigned and the current backend authorization permits it.

---

# 20. Participant management

Participant records include:

- Public participant ID.
- Applicant relation.
- Programme relation.
- Status.
- Joined date.
- Attendance count/records.
- Staff assignment relationships.

Statuses:

- active
- completed
- withdrawn

Participant profiles can open as full-screen operational views.

---

# 21. Participant pagination and selection

Participant directory uses:

- 50-row default.
- 50/100/200/300 page sizes.
- Previous/Next.
- Page-scoped Select All.
- Search/filter reset to page 1.
- Selection preserved where appropriate.

This supports operational tasks such as assigning exactly 50 people to one staff member.

---

# 22. Participant-to-staff assignment

Table:

- participant_staff_assignments

Relationship:

~~~text
Participant
→ assigned to
→ Admin or Programme Staff
~~~

The model stores programme/organisation context and assignment audit fields.

The same assignment model is used by:

- Participant operations.
- Email recipient grouping.

This is an explicit design choice to avoid duplicate group definitions.

---

# 23. Participant export

Participant CSV export supports configurable fields.

Core fields:

- Participant ID.
- Name.
- Email.
- Programme.
- Status.
- Joined Date.

Optional fields are loaded from form questions and selected by the user.

Duplicate labels across form versions are handled as export fields, and missing answers remain blank rather than causing export failure.

This also supports exporting imported contact-number fields.

---

# 24. Email Center

Workspace:

- Email

Tabs:

- Compose.
- Templates.
- Zoho connection.

Compose features:

- Programme selection.
- Audience.
- Assigned-to filter.
- Recipient search.
- Page-scoped selection.
- Subject.
- Body.
- Merge fields.
- WhatsApp group link.
- Send.
- Save template.

## 24.1 Merge fields

Current participant-oriented merge fields include:

- name
- participant_id
- email
- programme_name
- whatsapp_group_link

## 24.2 Staff-group email workflow

Example:

~~~text
Assign 50 participants to Staff A
→ Email
→ Programme
→ Assigned to Staff A
→ 50 matching
→ Select all 50
→ Add Staff A WhatsApp link
→ Send
~~~

Switching the staff filter clears previous selections to reduce accidental cross-group sends.

---

# 25. Email pagination and batching

Email recipient list defaults to 50.

Page-size choices grow in 50-person increments according to the current matching population:

~~~text
50
100
150
200
...
~~~

The send Edge Function intentionally caps a single request at 50 recipients.

The frontend safely splits larger selections into 50-recipient batches.

---

# 26. Zoho Mail integration

The original OAuth/Self Client setup was replaced by a simpler single-organisation SMTP architecture.

Secrets:

- ZOHO_SMTP_USERNAME
- ZOHO_SMTP_PASSWORD

They are stored in Supabase Edge Function Secrets.

They must never be committed to GitHub or exposed to React.

Transport:

- TLS.
- Port 465.
- smtppro.zoho.com first where appropriate.
- smtp.zoho.com fallback.

Backend functions:

- zoho-mail-status
- send-zoho-email

Authorization:

- Owner/Admin required.

Connection state:

- Zoho SMTP mailbox validation has succeeded in the live application.
- Live function logs show authenticated HTTP 200 status checks.

Remaining validation:

- One controlled real participant email should be received and confirmed before marking delivery end-to-end verified.

---

# 27. Communication templates and logs

Database includes:

- communication_templates
- communication_logs

Email Center can save/reuse templates.

Further production communication work may include:

- Rich HTML.
- Delivery history UI.
- Queued sending.
- Retry controls.
- Automated approval/rejection/onboarding triggers.
- More application-answer merge fields.

---

# 28. Attendance

Database includes:

- attendance_sessions
- attendance_records

Implemented:

- Session creation.
- Session date.
- Friendly check-in slug.
- Editable slug.
- Shareable check-in URL.
- Native date picker.
- Dark-mode calendar icon fixes.
- Self check-in.
- Duplicate handling.
- Participant record linkage.

Public check-in requires:

- Participant ID.
- Application email.

This was hardened from ID-only lookup to reduce public-data exposure.

---

# 29. Programme assignments

Database includes:

- assignments
- assignment_questions
- assignment_submissions
- assignment_answers
- assignment_documents
- assignment_upload_sessions
- assignment_grade_history

Implemented:

- Assignment creation/configuration.
- Assignment questions.
- Participant public assignment portal.
- Secure assignment file upload foundation.
- Submission.
- Grading.
- Score.
- Feedback.
- Grade history.
- Release/results.
- Leaderboard.

Public assignment access requires:

- Participant ID.
- Application email.

---

# 30. Assignment results and leaderboard

Participant results include:

- Score.
- Maximum score.
- Percentage.
- Pass mark.
- Passed/below-pass result.
- Marker feedback.
- Submitted time.
- Graded time.
- Leaderboard.

The leaderboard is programme-wide according to the current programme assignment decision.

Public result access requires participant ID + application email.

Only results allowed by release/grade logic should be exposed.

---

# 31. Team invitations

Two team onboarding paths exist in the product history:

- Direct invite/member infrastructure.
- Shareable invite links.

Shareable invite links support:

- Role.
- Expiry.
- Single use.
- Copyable URL.
- Invitee account creation.
- No pre-targeted invite email required.

The invite acceptance Edge Function is intentionally public but:

- Requires a valid invitation token.
- Validates input.
- Creates the user only in the invite flow.
- Calls the protected invite-acceptance RPC.
- Deletes the new auth user if the invite claim fails.

---

# 32. Team removal hierarchy

Owner/Admin management was hardened.

Rules:

- Owner cannot be removed through normal member management.
- Self-removal is blocked in the managed removal action.
- Owner can remove Admins.
- Admin cannot remove another Admin through the Team UI/backend hierarchy.
- Foreign-key references that would block account deletion are reassigned/nullified safely before Auth user deletion.

This prevents the former generic Edge Function failure when the Owner removed an Admin.

---

# 33. In-app notifications

Database:

- notifications

Implemented:

- Bell.
- Unread badge.
- List.
- Type/title/message.
- Relative timestamps.
- Mark one read.
- Mark all read.
- Latest entries.
- Realtime updates.
- Navigation/click-through.

Email Center is separate from in-app notifications.

---

# 34. Analytics

Current analytics tracks the simplified lifecycle.

Key metrics include:

- Submitted.
- Approved/enrolled.
- Rejected.
- Active.
- Completed.
- Withdrawn.
- Approval rate.
- Completion rate.
- Withdrawal rate.
- Submission trend.
- Programme-level breakdown.

Reviewer score was intentionally removed from the current visible analytics model.

---

# 35. Uploaded application documents

Database:

- uploaded_documents

Metadata includes:

- Organisation.
- Submission.
- Question.
- Answer.
- Bucket.
- Path.
- Original filename.
- MIME type.
- File size.
- Upload status.
- Extracted text.
- Extraction status.

Edge Function:

- extract-application-document

The function authenticates and checks organisation access before working with stored documents.

Text/data/image extraction infrastructure exists.

PDF extraction/completeness is not yet considered fully production-complete.

---

# 36. Database architecture

Current public tables include:

## Organisation / people

- organizations
- profiles
- team_invite_links

## Programmes / forms

- applications
- application_settings
- form_versions
- questions
- question_options
- eligibility_rules
- programme_requirements

## Imports

- form_import_batches
- form_import_rows

## Applicants / submissions

- applicants
- submissions
- answers
- submission_attempts
- submission_eligibility
- submission_scores
- submission_selections
- scoring_criteria

## Reviews / decisions

- review_assignments
- review_audit_logs
- selection_audit_logs

## Screening / documents

- ai_screenings
- uploaded_documents

## Participants

- participants
- participant_staff_assignments

## Attendance

- attendance_sessions
- attendance_records

## Assignments

- assignments
- assignment_questions
- assignment_submissions
- assignment_answers
- assignment_documents
- assignment_upload_sessions
- assignment_grade_history

## Communications

- communication_templates
- communication_logs
- notifications

## Benefits

- benefit_distributions
- benefit_recipients

Not every legacy table is part of the current visible UI. Schema presence does not automatically mean a feature is active in the final product experience.

---

# 37. Supabase Edge Functions — live state

As of 29 September 2026 the live Supabase project reports these functions ACTIVE:

1. run-ai-screening
2. extract-application-document
3. invite-team-member
4. manage-team-member
5. accept-team-invite-link
6. zoho-mail-status
7. send-zoho-email
8. username-login

Authentication model:

- Private operational functions normally verify JWT/session and role.
- Public-purpose endpoints are limited to the narrow public task they serve and validate task-specific input/token/password requirements.
- Service-role credentials remain server-only.

---

# 38. RLS and database security

All public tables were confirmed with Row Level Security enabled during the 29 September system audit.

Core practices:

- Organisation-scoped access.
- User/role checks.
- Private helpers for privileged checks.
- Protected RPCs.
- Restricted EXECUTE grants.
- Audit logs.
- Published-form immutability.
- Backend decision logic.
- Backend submission-limit enforcement.

A recent audit also restricted privileged RPC grants and internal review RPC execution.

Security hardening remains ongoing because RLS being enabled is necessary but not sufficient by itself.

---

# 39. Authentication hardening — September 29

Recent changes include:

- Password minimum raised to 10 characters for signup/reset/invite/settings flows.
- Username lookup removed from browser.
- Username login moved to a server Edge Function.
- Generic invalid-username/password result.
- Public participant portals upgraded from Participant ID only to Participant ID + application email.
- Public application file validation added.
- Submission-limit browser count removed from the authoritative path.
- Privileged RPC grants tightened.
- Team invite acceptance grants tightened.
- Programme deletion limited.
- Admin removal hierarchy enforced.

---

# 40. Public participant portal security

The following public participant experiences use Participant ID + application email:

- Attendance check-in.
- Assignment opening.
- Assignment results.

Reason:

A human-readable Participant ID should not act as a standalone password.

Future higher-security participant portals may move to OTP, magic link or authenticated participant accounts if the product requires a stronger identity assurance level.

---

# 41. Storage security

Storage areas include:

- Public organisation/profile branding.
- Application files.
- Assignment files/documents.

Security principles:

- Branding assets may be public by design.
- Application/assignment evidence should be scoped and protected.
- File paths are linked to programme/submission/question records.
- Browser MIME/size validation is not treated as the only control.
- Service-role access is server-only.

Storage policy review remains part of final hardening.

---

# 42. Security work still remaining

Current hardening is substantial but should not be called complete.

Remaining work includes:

- Complete SECURITY DEFINER review.
- Review all RPC EXECUTE grants after every new migration.
- Storage policy audit.
- Rate-limit strategy for public endpoints.
- Brute-force/rate-limit review for username-login.
- MFA product decision.
- Secret rotation process.
- Backup/recovery verification.
- Monitoring and security alerts.
- Retention/deletion policy.
- Privacy/data minimisation review.
- Dependency/security update process.
- Performance-advisor cleanup where security/performance overlap.

---

# 43. Accessibility and UX hardening

Recent work includes:

- Keyboard-accessible participant and attendance rows.
- Improved focus states.
- Reduced unstable hover motion.
- Full-screen participant profile.
- Full-screen review UI.
- Toast feedback portalled above sticky workspace chrome.
- Native date picker on click.
- Dark-mode date picker icon fixes.
- Responsive invite-link layouts.
- Shared pagination.

Full WCAG-oriented accessibility QA remains a separate final pass.

---

# 44. Error handling

A shared user-friendly error normalisation layer was introduced.

Goal:

- Avoid leaking raw backend/internal messages where unnecessary.
- Replace generic Supabase SDK errors with actionable user-facing text.
- Preserve meaningful errors where they help the user resolve the issue.

Applied across major app/workspace/import/participant flows.

---

# 45. Deployment architecture

~~~text
GitHub main
→ GitHub Actions Build Check
→ Vercel deployment
→ ApplyFlow QA Supervisor
→ browser open
→ network idle
→ content check
→ runtime overlay check
~~~

Current build command:

~~~bash
npm run build
~~~

which runs:

~~~text
tsc -b && vite build
~~~

---

# 46. ApplyFlow QA Supervisor

Repository agent:

- agent/supervisor.mjs

The supervisor now runs through GitHub Actions after successful builds.

It checks:

- Git access.
- Build.
- Vercel identity/access.
- Vercel deployment matching the commit.
- READY state.
- Browser body content.
- Runtime error overlay.

The earlier Vercel token/preflight problem has been resolved.

---

# 47. Latest deployment verification

Commit:

~~~text
85f7020baa66cb18ecc915befbd9929af3339193
~~~

Status:

- Build Check: success.
- Vercel status: success.
- QA Supervisor: success.
- Browser content: present.
- Runtime overlay: none.

The supervisor is a deployment smoke test. It does not log into the app and exercise every authenticated workspace flow.

---

# 48. General system audit — 29 September 2026

A fresh backend/system audit checked:

- Participant → application references.
- Organisation consistency.
- Participant staff references.
- Participant staff organisation/application consistency.
- Review → reviewer references.
- Review → submission references.
- Attendance → participant references.
- Attendance → session references.
- Communication template → application references.
- Duplicate participant IDs.
- Duplicate participant/staff pairs.
- Duplicate review assignments.
- Duplicate attendance slugs.
- Duplicate team invite tokens.
- Participant status validity.
- Review status/decision validity.
- RLS enabled state.
- Edge Function runtime errors.
- Privileged RPC authorization paths.

Results were clean for the tested referential/data-quality checks after using the actual live review constraints.

No recent Edge Function 500/exception entries were found in the tested window.

---

# 49. Email verification status

Zoho status was validated from the live UI.

Live function logs showed authenticated POST 200 responses to:

- zoho-mail-status

This proves the SMTP credential/authentication check works.

No send-zoho-email invocation had yet been recorded in the checked logs.

Therefore:

- SMTP configuration: verified.
- Mailbox authentication: verified.
- Actual recipient delivery: still requires a controlled send.

---

# 50. Features implemented but needing real operational exercise

Some features are code/deployment verified but should still receive realistic end-to-end use:

- Assign 50 participants to a staff member.
- Filter Email Center by that staff member.
- Send the group's WhatsApp link.
- Confirm email delivery.
- Create attendance session and complete participant self-check-in.
- Create assignment, submit as participant, grade, release, view result/leaderboard.
- Representative Google Form import.
- Full document extraction with representative file types.

---

# 51. Current project state

**Stage:** Active product / production hardening.

**Core application workflow:** Established.

**Programme operations:** Established.

**Participant operations:** Established.

**Email:** Integrated; final delivery QA pending.

**Attendance:** Built; operational QA continuing.

**Assignments/results:** Built; operational QA continuing.

**Security:** Major hardening completed; final production security programme ongoing.

**Deployment:** Automated build/Vercel/QA checks working.

---

# 52. Recent milestone history

## 28 September 2026

Major additions/hardening:

- Programme assignments.
- Assignment submissions.
- Secure assignment file uploads.
- Grading.
- Assignment leaderboard.
- Centralised final decision action.
- Assigned Programme Staff final decisions.
- Attendance friendly slugs.
- Editable attendance links.
- Shareable team invite links.
- Invite link signup.
- Programme deletion restriction.
- Accessibility/focus work.
- Error normalisation.
- Privileged RPC hardening.

## 29 September 2026

Major additions/hardening:

- QA Supervisor activation/fixes.
- Internal review RPC restriction.
- Human reviewer score removed from current product.
- Participant export.
- Configurable export fields.
- Email Center.
- Zoho status/send Edge Functions.
- Zoho SMTP App Password integration.
- Quick three-field screening.
- Owner-safe Admin removal.
- Shared pagination.
- Assigned-to-me review queue.
- Email recipient 50-step pagination.
- Staff-assignment email filtering.
- Authentication hardening.
- Username-login Edge Function.
- Public portal identity hardening.
- Conditional-rule form publish regression fix.

---

# 53. What is considered built

- Authentication foundation.
- Organisation/workspace.
- Roles.
- Organisation branding.
- Programme CRUD/lifecycle.
- Protected programme deletion.
- Form builder.
- Form versioning.
- Conditional questions.
- State/LGA.
- Google Form import.
- Public application.
- Public file upload foundation.
- Participant ID.
- Eligibility.
- Screening.
- Quick screening profile.
- Review assignment.
- Personal review queue.
- Approve/reject.
- Participant conversion.
- Participant directory/profile.
- Participant pagination.
- Participant export.
- Participant staff assignment.
- Email Center.
- Zoho SMTP connection.
- Email staff-group filtering.
- Attendance sessions/check-in.
- Programme assignments.
- Assignment grading.
- Results portal.
- Leaderboard.
- Team invite links.
- Team member removal hierarchy.
- In-app notifications.
- Analytics.
- Document metadata/extraction infrastructure.
- GitHub/Vercel QA supervisor.

---

# 54. What is not yet considered fully production-verified

- Real email delivery.
- Bulk email behaviour with real 50/100/150 participant groups.
- Attendance end-to-end operational load.
- Assignment full lifecycle under real cohort load.
- Complete PDF document extraction.
- Document-to-application-answer verification.
- Full mobile QA.
- Full accessibility QA.
- Full security advisor cleanup.
- Full storage policy audit.
- MFA.
- Google OAuth sign-in/sign-up is temporarily disabled. Restore only after the callback, redirect, workspace bootstrap, existing-account, new-account, logout and cross-browser flows have been repaired and verified end-to-end.
- Monitoring/alerting.
- Backup/recovery drill.
- Data retention/deletion policy.
- Production-scale load/performance testing.

---

# 55. Recommended next security phase

Security should be treated as a continuous programme rather than one patch.

Recommended order:

## A. Identity and session

- Decide whether Owner/Admin must use MFA.
- Add TOTP enrollment/challenge if required.
- Review session/JWT duration.
- Add suspicious-login/session monitoring where available.

## B. Public endpoint abuse resistance

- Rate-limit username login.
- Rate-limit invite acceptance.
- Rate-limit public application submission.
- Rate-limit attendance/result/assignment lookups.
- Add consistent generic auth errors.

## C. Database

- Inventory every SECURITY DEFINER function.
- Revoke PUBLIC execution where not explicitly needed.
- Move privileged helpers to private schema where practical.
- Review RLS policy per table, not only RLS enabled state.

## D. Storage

- Review every bucket.
- Separate public branding from protected applicant/assignment evidence.
- Verify read/write/delete policy by role.
- Consider signed URL access for protected evidence.

## E. Data protection

- Data retention policy.
- Account/org deletion policy.
- Audit log retention.
- Secrets rotation.
- Backup restore test.

---

# 56. Recommended product next steps

1. Controlled Zoho test email.
2. Real participant-to-staff assignment group.
3. Group-specific WhatsApp email send.
4. Attendance end-to-end test.
5. Assignment/result end-to-end test.
6. Continue security hardening.
7. Expand authenticated automated testing.
8. Mobile/accessibility pass.
9. Monitoring and incident readiness.
10. Repair and re-verify Google OAuth before re-enabling Google sign-in/sign-up.
11. Certificates/completion only after core operations are stable.

---

# 57. Definition of done for ApplyFlow v1

ApplyFlow v1 is ready when a real organisation can complete all of the following reliably:

~~~text
Create organisation
→ Invite staff
→ Create programme
→ Build/import form
→ Configure eligibility
→ Publish
→ Receive real applications
→ Issue participant/applicant IDs
→ Review and approve/reject
→ Convert approved applicants to participants
→ Assign participants to staff
→ Send group-specific onboarding email
→ Create attendance sessions
→ Record attendance
→ Create assignments
→ Receive submissions
→ Grade/release results
→ Track participant status
→ View accurate analytics
~~~

And:

- Organisation A cannot access Organisation B.
- Programme Staff cannot exceed assigned/authorised access.
- Public IDs alone do not expose protected participant information.
- Protected files are not anonymously enumerable.
- Secrets are server-side.
- Build/deployment/QA are repeatable.
- Recovery/monitoring/security procedures exist.

---

# 58. Source-of-truth rules for future work

Before making changes:

1. Inspect the current implementation.
2. Reuse existing models.
3. Do not create parallel grouping models when participant_staff_assignments fits.
4. Preserve published form immutability.
5. Preserve organisation isolation.
6. Keep final decisions human-controlled.
7. Keep secrets out of frontend/Git history.
8. Treat UI role checks as convenience, not authorization.
9. Verify Supabase changes against current docs.
10. Verify database changes after execution.
11. Run build.
12. Verify Vercel.
13. Verify browser/runtime.
14. State clearly whether a feature is:
   - coded
   - pushed
   - deployed
   - smoke-tested
   - authenticated-flow tested
   - production-delivery verified

---

# 59. One-line definition

> **ApplyFlow helps organisations collect applications, make controlled decisions, manage approved participants, communicate with cohorts and run day-to-day programme operations from one secure workspace.**

---

**ApplyFlow — applications in, decisions forward.**
