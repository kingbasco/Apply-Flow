# ApplyFlow — Project Master

> Concise project-wide map. Detailed implementation documentation lives in the feature docs linked below.

**Repository:** kingbasco/Apply-Flow  
**Stack:** React 19 + TypeScript + Vite + Supabase + Vercel  
**Last reconciled:** 7 October 2026  
**Feature-code baseline:** 9f83636eea8c94f37418b8247a89af5c6ba65b7c

## Product definition

ApplyFlow manages the lifecycle of an application-based programme:

~~~text
Programme
→ Form
→ Application
→ Eligibility / screening
→ Human decision
→ Participant
→ Staff assignment
→ Communication
→ Attendance + assignments
→ Points / leaderboard
→ Completion / analytics
~~~

Core product rules:

1. No separate shortlist stage in the current flow.
2. Human users retain final approval/rejection authority.
3. Published form versions are immutable.
4. Participant IDs are stable public identities; UUIDs remain internal.
5. Participant-to-staff assignment is the core operational grouping relationship.
6. Permission boundaries are enforced server-side, not by hidden buttons.

## Current roles

- Owner.
- Admin.
- Programme Staff (reviewer internally).

Participants use public routes and are not workspace-authenticated users.

See [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md).

## Major feature status

| Area | Current state |
|---|---|
| Programmes/forms | Implemented |
| Public applications | Implemented |
| Google Form import | Implemented |
| Eligibility | Implemented |
| Screening/reviews | Implemented |
| Participant conversion/management | Implemented |
| Staff assignment | Implemented |
| Participant export | Implemented |
| Loan Interest lookup | Implemented |
| Email Center | Implemented; provider-specific delivery still requires operational verification when configs change |
| WhatsApp Center | Implemented foundation; depends on Meta configuration/templates/consent |
| Attendance | Implemented |
| Assignments | Implemented |
| Multiple assignment files | Implemented |
| Grading/results | Implemented |
| Overall leaderboard | Implemented |
| Program Staff group leaderboards | Implemented |
| Test leaderboard group | Implemented |
| Bonus points | Implemented; Owner/Admin management |
| Team invitations | Implemented |
| Notifications | Implemented |
| Analytics | Implemented |
| Security hardening | Ongoing |
| Broad automated regression coverage | Incomplete |

## Documentation by feature

- [Product overview](./PRODUCT_OVERVIEW.md)
- [Roles and permissions](./ROLES_AND_PERMISSIONS.md)
- [Programmes, forms and public applications](./PROGRAMMES_FORMS_AND_APPLICATIONS.md)
- [Screening, reviews and selection](./SCREENING_REVIEWS_AND_SELECTION.md)
- [Participants and operations](./PARTICIPANTS_AND_OPERATIONS.md)
- [Assignments and results](./ASSIGNMENTS_AND_RESULTS.md)
- [Attendance, points and leaderboards](./ATTENDANCE_POINTS_AND_LEADERBOARDS.md)
- [Communications](./COMMUNICATIONS.md)
- [Authentication, team and security](./AUTH_TEAM_AND_SECURITY.md)
- [Architecture, data and storage](./ARCHITECTURE_DATA_AND_STORAGE.md)
- [Deployment, operations and QA](./DEPLOYMENT_OPERATIONS_AND_QA.md)
- [Known limitations and roadmap](./ROADMAP_AND_LIMITATIONS.md)

Specialist references:

- [Email providers](./EMAIL_PROVIDERS.md)
- [Participant email-correction status](./PARTICIPANT_EMAIL_CORRECTIONS.md)

## Recent product changes captured in this documentation

The October documentation pass includes:

- Multiple files per assignment file question.
- Assignment participant-work modal and attachment visibility.
- Hard-delete/recovery caveats.
- Attendance points and bonus points.
- Active-participant leaderboard restriction.
- Group-scoped participant leaderboards.
- Fixed Group 1–5 Program Staff mapping.
- Dedicated Test leaderboard group.
- Overall/group workspace switching.
- Participant-only group leaderboard exposure.
- WhatsApp Center foundation.
- Loan-interest participant lookup.
- Current email-provider switching.
- Participant email-correction disablement.
- Latest security/session/RPC hardening direction.

## Engineering source-of-truth rule

When a document is stale, prefer:

1. Current production schema/code.
2. Current main.
3. Latest migrations.
4. Documentation.

Then update the relevant feature document in the same change.
