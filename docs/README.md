# ApplyFlow Documentation

> Feature-based documentation for the ApplyFlow product, backend, operations and deployment.

**Last reconciled:** 7 October 2026  
**Feature-code baseline:** `9f83636eea8c94f37418b8247a89af5c6ba65b7c`

ApplyFlow documentation is intentionally split by domain. The root `README.md` is an overview; this folder is the detailed source of product and engineering context.

## Documentation map

| Area | Document |
|---|---|
| Product definition and status | [PRODUCT_OVERVIEW.md](./PRODUCT_OVERVIEW.md) |
| Roles and permissions | [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md) |
| Programmes, forms and public applications | [PROGRAMMES_FORMS_AND_APPLICATIONS.md](./PROGRAMMES_FORMS_AND_APPLICATIONS.md) |
| Screening, review and selection | [SCREENING_REVIEWS_AND_SELECTION.md](./SCREENING_REVIEWS_AND_SELECTION.md) |
| Participants and participant operations | [PARTICIPANTS_AND_OPERATIONS.md](./PARTICIPANTS_AND_OPERATIONS.md) |
| Assignments, grading and results | [ASSIGNMENTS_AND_RESULTS.md](./ASSIGNMENTS_AND_RESULTS.md) |
| Attendance, points and leaderboards | [ATTENDANCE_POINTS_AND_LEADERBOARDS.md](./ATTENDANCE_POINTS_AND_LEADERBOARDS.md) |
| Email and WhatsApp communications | [COMMUNICATIONS.md](./COMMUNICATIONS.md) |
| Email provider setup | [EMAIL_PROVIDERS.md](./EMAIL_PROVIDERS.md) |
| Participant email-correction status | [PARTICIPANT_EMAIL_CORRECTIONS.md](./PARTICIPANT_EMAIL_CORRECTIONS.md) |
| Authentication, team and security | [AUTH_TEAM_AND_SECURITY.md](./AUTH_TEAM_AND_SECURITY.md) |
| Architecture, database and storage | [ARCHITECTURE_DATA_AND_STORAGE.md](./ARCHITECTURE_DATA_AND_STORAGE.md) |
| Deployment, operations and QA | [DEPLOYMENT_OPERATIONS_AND_QA.md](./DEPLOYMENT_OPERATIONS_AND_QA.md) |
| Known limitations and roadmap | [ROADMAP_AND_LIMITATIONS.md](./ROADMAP_AND_LIMITATIONS.md) |
| High-level project master | [APPLYFLOW_PROJECT_MASTER.md](./APPLYFLOW_PROJECT_MASTER.md) |

## Source-of-truth order

When documentation and code disagree, use this order:

1. Current production database/schema and current deployed code.
2. `main` branch implementation.
3. Latest Supabase migrations.
4. These documentation files.
5. Historical notes/old commits.

Documentation should be updated in the same pull request as meaningful feature or permission changes.

## Status language

- **Implemented** — code/schema exists.
- **Verified** — implementation was exercised or checked against production/preview.
- **Partially verified** — implementation exists but a complete real-world flow has not been validated.
- **Historical** — retained for context but no longer exposed as a current product feature.
- **Planned** — not implemented yet.

## Core product rule

ApplyFlow is server-authorised. A hidden button is not a permission boundary. Role checks, RLS, RPC authorization, Edge Function authorization and public-token validation remain the actual security controls.
