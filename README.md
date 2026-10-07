# ApplyFlow

> Application intake, screening, participant operations, communications, attendance, assignments and programme performance in one workspace.

ApplyFlow is a React + TypeScript application backed by Supabase and deployed on Vercel. It is designed for organisations running application-based programmes such as training cohorts, grants, scholarships, fellowships, recruitment and business-support programmes.

## Core workflow

~~~text
Create programme
→ Build/import form
→ Publish
→ Collect applications
→ Eligibility + screening
→ Human approve/reject
→ Participant
→ Assign to Program Staff
→ Communicate
→ Attendance + assignments
→ Points / leaderboard
→ Completion / analytics
~~~

## Current feature areas

- Organisation workspace and role-aware access.
- Programme lifecycle management.
- Versioned form builder.
- Google Form CSV import.
- Public application submission.
- Eligibility rules.
- Screening/review and quick screening.
- Participant conversion and management.
- Participant-to-staff assignment.
- Participant CSV export.
- Loan-interest lookup.
- Email Center with Gmail / Zoho / ZeptoMail provider selection.
- WhatsApp Center with Meta templates and consent records.
- Attendance sessions and public participant check-in.
- Programme assignments, multiple-file uploads, grading and result release.
- Assignment + attendance + bonus-point scoring.
- Overall and Program Staff group leaderboards.
- Team invitations and member management.
- Notifications and analytics.
- Ongoing security hardening with RLS, protected RPCs and active-session checks.

## Roles

ApplyFlow currently uses:

- **Owner**
- **Admin**
- **Programme Staff** — internally represented by the legacy database role value reviewer

Participants are not workspace users; they access public programme routes with their Participant ID and registered application email where required.

## Stack

- React 19
- TypeScript 5
- Vite 7
- Supabase Auth / PostgreSQL / Storage / Realtime / Edge Functions
- Vercel
- GitHub

## Documentation

Detailed documentation is split by feature under [docs/](./docs/README.md).

Start here:

- [Documentation index](./docs/README.md)
- [Product overview](./docs/PRODUCT_OVERVIEW.md)
- [Roles and permissions](./docs/ROLES_AND_PERMISSIONS.md)
- [Programmes, forms and public applications](./docs/PROGRAMMES_FORMS_AND_APPLICATIONS.md)
- [Screening, reviews and selection](./docs/SCREENING_REVIEWS_AND_SELECTION.md)
- [Participants and operations](./docs/PARTICIPANTS_AND_OPERATIONS.md)
- [Assignments and results](./docs/ASSIGNMENTS_AND_RESULTS.md)
- [Attendance, points and leaderboards](./docs/ATTENDANCE_POINTS_AND_LEADERBOARDS.md)
- [Communications](./docs/COMMUNICATIONS.md)
- [Authentication, team and security](./docs/AUTH_TEAM_AND_SECURITY.md)
- [Architecture, database and storage](./docs/ARCHITECTURE_DATA_AND_STORAGE.md)
- [Deployment, operations and QA](./docs/DEPLOYMENT_OPERATIONS_AND_QA.md)
- [Known limitations and roadmap](./docs/ROADMAP_AND_LIMITATIONS.md)

For a concise project-wide summary, see [ApplyFlow Project Master](./docs/APPLYFLOW_PROJECT_MASTER.md).

## Development

~~~bash
npm install
npm run dev
~~~

Production build:

~~~bash
npm run build
~~~

which runs:

~~~text
tsc -b && vite build
~~~

The repository also contains the QA supervisor commands:

~~~bash
npm run agent
npm run agent:once
~~~

## Deployment

Frontend deployments are handled through Vercel from GitHub.

Supabase schema/RPC changes are stored under:

~~~text
supabase/migrations/
~~~

Edge Functions are stored under:

~~~text
supabase/functions/
~~~

When a database fix is applied directly during incident/debug work, a matching migration should still be committed so the repository remains reproducible.

## Security

ApplyFlow uses server-enforced authorization.

Do not treat hidden UI controls as permission boundaries. Sensitive operations must remain protected by RLS, RPC authorization, active-session checks or Edge Function authorization.

Do not commit:

- Supabase service-role keys.
- SMTP credentials.
- Meta/WhatsApp tokens.
- Other production secrets.

See [Authentication, Team and Security](./docs/AUTH_TEAM_AND_SECURITY.md).

## Documentation status

Documentation was reconciled on **7 October 2026** against the current feature implementation, including the group-scoped leaderboard and Test group changes.

Feature-code baseline before this documentation-only branch:

**9f83636eea8c94f37418b8247a89af5c6ba65b7c**
