# Architecture, Data and Storage

## Frontend

Primary files:

- `src/App.tsx` — authentication, public routes, workspace shell and leaderboard.
- `src/components/WorkspaceModules.tsx` — major authenticated workspace modules.
- `src/components/ParticipantsPanel.tsx` — participants, loan interest, attendance, assignments and benefits.
- `src/components/EmailWorkspace.tsx` — Email Center.
- `src/components/WhatsAppWorkspace.tsx` — WhatsApp Center.
- `src/components/CommunicationsWorkspace.tsx` — communications routing.
- `src/components/GoogleFormImport.tsx` — Google Form import.
- `src/components/TablePagination.tsx` — shared pagination.
- `src/lib/supabase.ts` — Supabase client.
- `src/lib/errors.ts` — user-friendly error handling.
- `src/lib/nigeria.ts` — Nigeria state/LGA data helpers.

## Backend

Supabase provides:

- Auth.
- PostgreSQL.
- RLS.
- RPC functions.
- Storage.
- Realtime.
- Edge Functions.

## Major data domains

### Organisation/team

- `organizations`
- `profiles`
- `team_invite_links`

### Programmes/forms

- `applications`
- `application_settings`
- `form_versions`
- `questions`
- `question_options`
- `eligibility_rules`
- `programme_requirements`

### Imports/applications

- `form_import_batches`
- `form_import_rows`
- `applicants`
- `submissions`
- `answers`

### Screening/review

- `review_assignments`
- `review_audit_logs`
- `selection_audit_logs`
- `ai_screenings`

### Participants

- `participants`
- `participant_staff_assignments`
- `participant_point_awards`

### Attendance

- `attendance_sessions`
- `attendance_records`

### Assignments

- `assignments`
- `assignment_questions`
- `assignment_submissions`
- `assignment_answers`
- `assignment_documents`
- `assignment_upload_sessions`
- `assignment_grade_history`

### Communications

- `communication_templates`
- `communication_logs`
- `notifications`
- WhatsApp campaign/template/consent tables.

### Other operations

- Benefit distribution tables.
- Uploaded document/extraction tables.
- Historical/legacy scoring tables.

Schema presence does not mean a feature is equally mature or visible in the current UI.

## Private schemas

ApplyFlow uses private helper schemas for operations that should not be exposed as raw tables/functions through the public Data API.

Examples include leaderboard-group configuration and authorised loan-interest helpers.

## Storage

Public branding assets and protected applicant/assignment files must be treated separately.

Assignment file paths include assignment/session/question identity and are validated by backend helpers.

## Edge Functions

Current repository Edge Function folders include:

- `accept-team-invite-link`
- `extract-application-document`
- `invite-team-member`
- `manage-team-member`
- `run-ai-screening`
- `send-whatsapp-campaign`
- `send-zoho-email`
- `sync-whatsapp-templates`
- `username-login`
- `whatsapp-consent`
- `whatsapp-status`
- `whatsapp-webhook`
- `zoho-mail-status`

Repository presence does not by itself prove a function is deployed; deployment state should be checked when operationally important.
