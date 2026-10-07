# Product Overview

## What ApplyFlow is

ApplyFlow is an application and programme operations platform for organisations running training cohorts, grants, fellowships, scholarships, recruitment programmes, business-support programmes and similar application-based initiatives.

The current lifecycle is:

```text
Programme
→ Form
→ Public application
→ Eligibility
→ Screening / review
→ Approve or reject
→ Participant
→ Staff assignment
→ Communication
→ Attendance + assignments
→ Points / leaderboard
→ Completion / reporting
```

Approved applicants become participants directly. There is no separate shortlist layer in the current product model.

## Current product areas

Implemented areas include:

- Workspace authentication and organisation profiles.
- Programme creation and lifecycle management.
- Versioned form builder.
- Google Form CSV import.
- Public application submission.
- Eligibility rules.
- Screening and human review.
- Quick screening profile.
- Participant conversion and management.
- Participant-to-staff assignment.
- Participant CSV export.
- Loan-interest participant lookup.
- Email Center with Gmail, Zoho and ZeptoMail provider selection.
- WhatsApp Center foundation using Meta templates and consent.
- Attendance sessions and public self check-in.
- Programme assignments, multiple-file submissions, grading and result release.
- Attendance, assignment and bonus point aggregation.
- Overall and Program Staff group leaderboards.
- Team invitation and member management.
- Analytics and notifications.
- Security hardening through RLS, protected RPCs and session checks.

## Product principles

### Human final decisions

AI/automation may assist review, but final approval/rejection is controlled by authorised humans.

### Stable participant identity

Participants use a human-readable ID such as:

```text
PREFIX-YEAR-00001
```

Internal UUIDs remain implementation identifiers.

### Published form integrity

A published form version is immutable. Changes create a new draft/version so historical submissions remain interpretable.

### Staff assignment is operational grouping

`participant_staff_assignments` is the main participant-to-staff ownership model. Email grouping and leaderboard grouping build on that relationship.

### Public participant portals require more than an ID

Attendance, assignment and result flows use Participant ID plus the participant's registered application email where appropriate.

## Stack

- React 19.
- TypeScript 5.
- Vite 7.
- Supabase Auth.
- PostgreSQL.
- Supabase Storage.
- Supabase Realtime.
- Supabase Edge Functions.
- Vercel deployment.
- GitHub source control.

See [ARCHITECTURE_DATA_AND_STORAGE.md](./ARCHITECTURE_DATA_AND_STORAGE.md) for technical details.
