# ApplyFlow — Master Project Architecture, Build History & Roadmap

> **Living project document.**
>
> This document is the source of truth for what ApplyFlow is, what has been built, what has been hardened, what is currently being simplified, and what remains before production readiness.
>
> Repository: `kingbasco/Apply-Flow`
> Production URL: `https://apply-flow-one.vercel.app`
> Stack: React + TypeScript + Vite + Supabase/Postgres/Auth/Storage + Vercel
>
> Last reconciled against the GitHub repository: **27 September 2026**.

---

## 1. Product definition

ApplyFlow is an application intake, screening, review, approval, participant-management, and reporting platform for organisations running:

- Scholarships
- Fellowships
- Grants
- Recruitment drives
- Community programmes
- Training programmes
- Other application-based programmes

The core product idea is simple:

```text
Create programme
      ↓
Build application form
      ↓
Publish
      ↓
Collect applications
      ↓
Check eligibility
      ↓
Screen applications
      ↓
Approve / Reject
      ↓
Approved applicant becomes participant
      ↓
Track participant
      ↓
Analyse results
```

### Product principle

AI assists with screening and analysis. **A human authorised by the organisation makes the final approval/rejection decision.**

---

# 2. Final product architecture

## 2.1 High-level architecture

```text
                         ┌─────────────────────┐
                         │     ApplyFlow UI    │
                         │ React + TypeScript  │
                         │ Vite + shadcn/ui    │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │     Supabase        │
                         │ Auth / Postgres /   │
                         │ Storage / Realtime  │
                         └──────────┬──────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
       Application data       Screening data        Participant data
              │                     │                     │
              ▼                     ▼                     ▼
       Eligibility engine      AI screening        Participant lifecycle
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                    ▼
                              Audit / Analytics
                                    │
                                    ▼
                               Vercel hosting
```

---

# 3. Core user journeys

## 3.1 Organisation journey

```text
Sign up
  ↓
Create organisation
  ↓
Create programme
  ↓
Configure programme
  ↓
Build form
  ↓
Configure eligibility/scoring
  ↓
Preview
  ↓
Publish
  ↓
Receive applications
  ↓
Screen
  ↓
Approve / Reject
  ↓
Manage participants
  ↓
Track progress
  ↓
Analyse
```

## 3.2 Applicant journey

```text
Open public programme
  ↓
Read programme information
  ↓
Start application
  ↓
Fill dynamic form
  ↓
Answer eligibility questions
  ↓
Upload documents
  ↓
Submit
  ↓
Receive unique Participant/Application ID
  ↓
See confirmation message
```

The confirmation should clearly tell the applicant to copy and save the ID.

Example:

```text
Application submitted successfully!

Thank you for submitting your application.

Your Unique Application ID:
APP-00001

Please copy this ID and save it somewhere safe.
You may need it to reference or track your application later.
```

## 3.3 Admin screening journey

The screening experience is intentionally being simplified.

```text
Screening
  ↓
See all applicants
  ↓
Click Review
  ↓
See complete submitted form
  ↓
See eligibility / score / documents / AI recommendation
  ↓
Approve OR Reject
```

There should be no unnecessary multi-stage screening workflow in the main experience.

---

# 4. Screening — final product direction

## 4.1 Screening list

The Screening section should open to a straightforward list of submitted applicants.

Recommended columns:

| Applicant | Unique ID | Score | Eligibility | AI Recommendation | Status | Action |
|---|---|---:|---|---|---|---|
| John Doe | APP-00001 | 82 | Eligible | Recommend | Pending | Review |
| Jane Smith | APP-00002 | 76 | Eligible | Recommend | Approved | Review |
| Peter James | APP-00003 | 45 | Ineligible | Not recommended | Rejected | Review |

Useful controls:

- Search
- Status filter
- Eligibility filter
- AI recommendation filter
- Refresh

Nothing more complicated is required for the main screening page.

## 4.2 Review applicant

Clicking **Review** should show:

### Applicant information
- Full name
- Email
- Phone
- Location
- Unique ID

### Complete application
Every question from the exact submitted form version and its answer.

### Uploaded documents
- Filename
- Type
- Size
- Extraction status
- Extracted text where available
- View/download action where supported

### Eligibility
- Eligible / Ineligible
- Reason(s)

### Score
- Overall score
- Criteria breakdown where configured

### AI recommendation
Only show this when AI screening has been run.

### Final decision

At the bottom:

**Approve** | **Reject**

Approval should move the applicant into Participants.

Rejection should mark the application rejected.

---

# 5. AI screening architecture

AI screening should remain simple from the user's point of view.

## User action

```text
Screen with AI
```

The system then sends the applicant's relevant complete application evidence to the AI:

- Applicant information
- All form questions
- All submitted answers
- Programme criteria
- Eligibility rules
- Scoring criteria
- Available uploaded-document metadata
- Available extracted document text

The AI returns structured screening assistance.

Example:

```text
AI Recommendation: Recommend

Score: 84/100

Summary:
Applicant meets the configured programme requirements
and demonstrates relevant experience.

Strengths:
- Relevant experience
- Clear programme fit
- Evidence of demand

Concerns:
- Funding request is not fully explained
```

AI remains advisory.

```text
AI recommendation
       ↓
Human review
       ↓
Approve / Reject
```

AI must never silently become the final decision-maker.

---

# 6. Applicant / Participant ID architecture

ApplyFlow uses a user-facing identifier that follows the applicant into the participant lifecycle.

The configured programme/organisation prefix can be used with year and sequential number.

Example:

```text
ECA-2026-00001
ECA-2026-00002
ATH-2026-00001
```

The system also has internal UUIDs for database relationships.

Important rules:

1. Generate the user-facing ID during application submission.
2. Generate it atomically to prevent duplicates.
3. Return it from the submission flow.
4. Display it immediately after successful submission.
5. Store it with the applicant/submission.
6. Reuse it when the applicant becomes a participant.
7. Display it in screening.
8. Display it in participant management.
9. Include it in exports/reports where appropriate.

---

# 7. Phase history — what has been built

## Phase 1 — Foundation & Workspace

### Completed

- React
- TypeScript
- Vite
- Responsive workspace shell
- Dashboard navigation
- Workspace navigation
- Organisation context
- Supabase integration
- PostgreSQL
- Authentication foundation
- Role-aware workspace structure
- Light/dark themes
- Reusable UI components

### Core stack

```text
React
TypeScript
Vite
Supabase
PostgreSQL
Vercel
GitHub
```

---

# 8. Phase 2 — Authentication & Profiles

### Completed

- Email/password signup
- Email/password signin
- Google authentication
- Username-based signin
- Organisation creation during signup
- User profiles
- Username management
- Profile photo upload
- Forgot password
- Password reset
- Team invitation account setup
- Owner role
- Admin role
- Reviewer role

Username constraints:

- 3–30 characters
- Lowercase letters
- Numbers
- Underscores
- Case-insensitive uniqueness

---

# 9. Phase 3 — Organisation Profile & Branding

### Completed

- Organisation name
- Workspace details
- Organisation profile image
- Organisation logo/avatar
- JPG support
- PNG support
- WebP support
- 5 MB upload limit
- Supabase Storage integration
- Workspace switcher branding

Security policies were added around organisation/profile image storage.

---

# 10. Phase 4 — Programme Management

### Completed

Programme creation/editing includes:

- Programme name
- Description
- Application deadline
- Application start date
- Target participant count
- Public application slug
- Applicant instructions
- Submission limit
- Confirmation message
- Participant ID prefix
- Draft status
- Published status
- Closed status
- Completed status
- Publish
- Unpublish
- Close applications

Lifecycle:

```text
Draft
  ↓
Published
  ↓
Closed
  ↓
Completed
```

Publishing validates important configuration before making the programme public.

---

# 11. Phase 5 — Form Builder & Versioning

### Completed

The form builder supports:

- Short text
- Long text
- Email
- Phone
- Number
- Date
- Dropdown
- Radio/single choice
- Checkbox/multiple choice
- Yes/no
- File upload
- Image upload
- Rating
- Nigerian state
- Nigerian LGA
- Sections
- Conditional questions
- Eligibility rules

Question configuration includes:

- Required
- Description
- Placeholder
- Options
- Minimum values
- Maximum values
- File types
- File sizes

### Form operations

- Add
- Edit
- Delete
- Reorder
- Duplicate
- Preview
- Publish

### Versioning

Published versions are treated as immutable.

```text
Draft v1
   ↓
Publish v1
   ↓
Draft v2
   ↓
Publish v2
   ↓
Draft v3
```

Historical submissions remain tied to the exact form version they used.

When forms are cloned, question IDs used by conditional/eligibility logic are remapped.

---

# 12. Phase 6 — Public Applicant Experience

### Completed

Public applicants can:

- Open public programme pages
- See programme information
- Check whether applications are available
- Respect application start dates
- Respect deadlines
- Respect submission limits
- Load published form versions
- Answer dynamic questions
- Navigate conditional questions
- Complete Nigerian State → LGA fields
- Upload files/images
- Submit applications
- Receive confirmation
- Receive/display their Participant/Application ID

### Submission security

The public submission path is implemented through a controlled Supabase submission function/RPC.

Protections include:

- Published application/version validation
- Required-field validation
- Duplicate submission prevention
- Rate limiting
- Submission limits
- Date/deadline validation
- Secure handling of uploaded document metadata

---

# 13. Phase 7 — Eligibility Engine

### Completed

Eligibility supports:

- Question-based conditions
- Automatic evaluation
- Eligibility status
- Eligibility reason(s)
- Conditional logic
- Re-evaluation when applicable

Supported comparison operators include:

```text
=
!=
>
<
>=
<=
IN
NOT IN
```

Logical grouping supports:

```text
AND
OR
```

Eligibility is evaluated before final screening decisions.

---

# 14. Phase 8 — Scoring

### Completed

Scoring criteria support:

- Criterion name
- Description
- Weight
- Maximum score
- Overall score

Example criteria:

```text
Business experience      20%
Potential                20%
Need                     20%
Application quality      15%
Programme fit            15%
Location priority        10%
                         ----
                        100%
```

Scores can be sourced from:

- Manual reviewer scoring
- Automatic scoring
- AI-assisted scoring

AI scores are advisory.

---

# 15. Phase 9 — Screening & Review

### Earlier implementation

A richer screening/reviewer workflow was built with:

- Screening dashboard
- Screening queue
- Search
- Filters
- Eligibility status
- Current score
- AI status/recommendation
- Review workspace
- Reviewer assignments
- Reviewer scores
- Reviewer notes
- Review decisions
- Review audit history

The review system was hardened with organisation-scoped queries and role checks.

### Current product decision

The main screening UX is now intentionally simplified.

The product should prioritise:

```text
All Applicants
     ↓
Review
     ↓
Read entire application
     ↓
Approve / Reject
```

The richer reviewer-assignment infrastructure may remain underneath where useful for security/audit purposes, but it should not dominate the user experience.

---

# 16. Phase 10 — AI-Assisted Screening

### Completed foundation

AI screening infrastructure exists as a secure Supabase Edge Function.

It:

- Requires authenticated workspace access
- Checks organisation membership/role
- Reads submission/application data
- Reads questions and answers
- Reads scoring criteria
- Reads uploaded document evidence where available
- Sends structured screening context to the AI
- Stores structured results
- Handles processing states
- Handles errors
- Supports reruns
- Keeps AI output advisory

Stored AI information includes:

- Overall assessment
- Criterion assessments
- Strengths
- Concerns
- Missing information
- Inconsistencies
- Evidence
- Suggested score
- Confidence
- Model
- Status
- Error information

### AI rules

The AI must:

- Use submitted evidence only
- Never invent evidence
- Say "Not provided" when information is unavailable
- Avoid sensitive/protected-trait inference
- Tie criterion assessments to evidence
- Stay advisory
- Never make the final approval/rejection decision

---

# 17. Phase 11 — Review Operations & Audit

### Completed

Review operations include:

- Reviewer assignment
- Reassignment
- Reviewer status
- Reviewer score
- Reviewer notes
- Decision
- Audit history
- Actor
- Timestamp
- Decision changes
- Score changes
- Status changes
- Assignment history

Security:

- Review queries are organisation-scoped
- Reviewer access is role/assignment controlled
- Admin access is organisation controlled
- Decision changes are recorded in audit history

---

# 18. Phase 12 — Analytics & Reporting

### Completed foundation

Analytics includes:

- Submission totals
- Eligibility information
- Approval/rejection
- Participant counts
- Reviewer score distribution
- Average score
- Submission activity
- Lifecycle funnel
- Programme-level metrics

Current product lifecycle is:

```text
Submitted
   ↓
Approved / Enrolled
   ↓
Active
   ↓
Completed
```

Rejected applications and withdrawn participants remain separately measurable.

---

# 19. Phase 13 — In-App Notifications

### Completed

Workspace notifications include:

- Notification bell
- Unread count
- Notification list
- Titles
- Messages
- Types
- Relative timestamps
- Mark one as read
- Mark all as read
- Supabase Realtime updates
- Click-through to relevant workspace area
- Latest 30 notifications

### Still separate

Applicant email and automated programme communication are not the same thing as the in-app notification centre.

Those remain future work.

---

# 20. Phase 14 — Security Hardening

Security work completed includes:

## RPC protection

The public `duplicate_form_version` function was restricted:

- Anonymous execution removed
- Authenticated execution allowed
- SECURITY DEFINER removed where not required

## RLS hardening

Legacy/self-only application policies were removed where they conflicted with organisation-based administration.

Explicit organisation-admin policies were added for relevant writes.

Review assignment selection was consolidated around:

- Assigned reviewer access
- Organisation-admin access

## Audit hardening

Review decision changes are captured in audit metadata.

## Organisation scoping

Screening/review/audit queries were explicitly scoped to the organisation.

## Storage security

Application document storage was restricted to the intended public submission path and application context.

## Performance

Core foreign-key indexes were added for frequently accessed screening/application relationships.

---

# 21. Phase 15 — Applicant Documents

### Completed foundation

A `uploaded_documents` data model exists with:

- ID
- Organisation
- Submission
- Question
- Answer
- Storage bucket
- Storage path
- Original filename
- MIME type
- File size
- Upload status
- Extracted text
- Extraction status
- Created/updated timestamps

Indexes exist for key relationships.

### Document lifecycle

```text
Uploaded
   ↓
Metadata stored
   ↓
Extraction pending
   ↓
Extracting
   ↓
Completed / Failed / Not supported
```

---

# 22. Phase 16 — Document Extraction + AI Evidence

### Completed

A secure `extract-application-document` Supabase Edge Function was added.

Current extraction supports:

- Plain text
- CSV
- JSON
- Image-based extraction through AI vision

The function:

- Authenticates the user
- Checks organisation ownership/admin role
- Downloads the storage object
- Extracts text
- Stores extracted text
- Limits stored extraction size
- Tracks extraction status
- Reports unsupported formats honestly

The screening workspace provides:

- Extract text
- Re-extract
- Processing state
- Extraction status
- Extracted text display

### Current limitation

**PDF extraction is not yet fully implemented.**

Do not claim PDF extraction is complete until it is actually implemented and verified.

---

# 23. Google Form import

The repository contains Google Form import functionality and database staging/migrations.

Implemented foundation includes:

- Import staging
- Handling imports where no form exists
- Timestamp validation fixes
- Import-related schema support

This area still needs end-to-end QA against real Google Forms if it is intended to be a production feature.

---

# 24. Participant management

### Implemented foundation

Approved applicants can become participants automatically.

Participant records include:

- Participant ID
- Applicant relationship
- Programme relationship
- Status
- Joined date
- Attendance count

Participant lifecycle:

```text
Approved
   ↓
Active / Enrolled
   ├──→ Completed
   └──→ Withdrawn
```

There is intentionally no separate shortlist → selected → participant chain.

**Approved = selected/enrolled.**

---

# 25. Current database architecture

The product uses Supabase/PostgreSQL.

Core data areas include:

### Organisation

- `organizations`
- `profiles/users`

### Programmes

- `applications`
- programme/application settings

### Forms

- `form_versions`
- `questions`
- `question_options`

### Applicant submissions

- `applicants`
- `submissions`
- `answers`

### Eligibility

- `eligibility_rules`
- `submission_eligibility`

### Scoring

- `scoring_criteria`
- scores/reviewer scoring records

### Documents

- `uploaded_documents`

### AI

- `ai_screenings`

### Reviews

- `review_assignments`
- review audit/history tables

### Participants

- participant records
- participant lifecycle fields
- attendance-related data

### Communication

- `notifications`
- communication templates/logs where present

### Audit

- review audit
- selection/decision audit
- organisation activity traces

---

# 26. Supabase architecture

Supabase is responsible for:

- Authentication
- PostgreSQL
- Row Level Security
- Storage
- Realtime
- Edge Functions
- Secure RPCs

Important security boundary:

```text
Browser
  ↓
Supabase authenticated client
  ↓
RLS / secure RPC
  ↓
Organisation-scoped database
```

Service-role credentials must never be exposed in the frontend.

AI provider credentials must remain server-side.

---

# 27. Storage architecture

Application files use the `application-files` bucket.

Public application uploads are constrained to the intended path structure:

```text
public-submissions/<application_id>/...
```

Document metadata links the storage object to:

- Organisation
- Submission
- Question
- Answer

This allows screening to understand which uploaded document belongs to which form question.

---

# 28. Deployment architecture

```text
GitHub
   ↓
GitHub Actions / Vercel
   ↓
Vercel production deployment
   ↓
ApplyFlow frontend
   ↓
Supabase backend
```

Production URL:

```text
https://apply-flow-one.vercel.app
```

Current repo build configuration uses Vite.

Important Vercel note:

**The connected Vercel tool has not exposed the ApplyFlow project in the current session, so a current production deployment/build should not be described as verified until Vercel exposes the project or another direct deployment check succeeds.**

---

# 29. Autonomous deployment supervisor

The repository contains:

```text
agent/
├── README.md
├── config.json
├── state.json
└── supervisor.mjs
```

Intended flow:

```text
GitHub
   ↓
Build
   ↓
Vercel deployment
   ↓
Browser verification
   ↓
Gemini diagnosis
   ↓
Safe patch
   ↓
Commit + push
   ↓
Re-verify
```

The supervisor has previously failed because:

```text
VERCEL_TOKEN is missing
```

The supervisor should not be considered production-ready until its credential/environment configuration is fixed and the full loop is successfully verified.

---

# 30. Important implementation history

Selected milestones include:

- Foundation and workspace
- Supabase/auth integration
- Form builder
- Public application flow
- File upload
- Secure submission RPC
- Nigerian State/LGA fields
- Screening dashboard
- Full screening workspace
- AI screening
- Review operations
- Analytics
- Audit history
- Organisation scoping
- Security hardening
- RLS cleanup
- Performance indexes
- Applicant document metadata
- Document extraction
- AI document evidence
- Unique applicant/participant ID
- Participant lifecycle
- Google Form import foundation
- Organisation profile image

The repository contains the detailed migration history under:

```text
supabase/migrations/
```

---

# 31. What is DONE

## Product functionality

- [x] Authentication foundation
- [x] Organisation/workspace
- [x] Organisation branding
- [x] Programme creation
- [x] Programme lifecycle
- [x] Public application
- [x] Form builder
- [x] Form versioning
- [x] Conditional questions
- [x] Nigerian State/LGA
- [x] File/image upload foundation
- [x] Eligibility
- [x] Scoring
- [x] Screening infrastructure
- [x] AI screening infrastructure
- [x] Review decisions
- [x] Approve/reject model
- [x] Participant creation foundation
- [x] Participant ID system
- [x] Participant management foundation
- [x] Analytics foundation
- [x] In-app notifications
- [x] Review audit history
- [x] Organisation-scoped review access
- [x] Core RLS hardening
- [x] Core screening indexes
- [x] Applicant document metadata
- [x] Image/text document extraction
- [x] AI document evidence integration
- [x] Google Form import foundation
- [x] Autonomous supervisor foundation

---

# 32. What is PARTIALLY DONE / NEEDS QA

These should not be treated as finished just because the underlying code exists.

- [ ] End-to-end public application flow
- [ ] Unique ID display across all final submission states
- [ ] Screening list UX
- [ ] Review applicant UX
- [ ] Approve → participant flow
- [ ] Reject flow
- [ ] AI screening button and result presentation
- [ ] AI screening with real application data
- [ ] Uploaded document extraction
- [ ] Participant management
- [ ] Analytics
- [ ] Google Form import
- [ ] Notifications
- [ ] Mobile responsiveness
- [ ] Accessibility
- [ ] Production deployment
- [ ] Full RLS verification
- [ ] Storage security verification
- [ ] Autonomous deployment supervisor

---

# 33. What is NOT YET DONE

## 33.1 PDF extraction

Current document extraction explicitly does not claim full PDF support.

Needed:

- Safe PDF extraction
- Text extraction verification
- Clear unsupported/scanned-PDF handling
- Failure states
- Screening integration
- QA against real PDFs

---

## 33.2 Document-to-answer verification

Planned next document feature:

Compare explicit document evidence against application answers.

Examples:

```text
Application name:
John Doe

Document name:
John A. Doe

→ Potential mismatch
```

Other explicit comparisons may include:

- Name
- ID number
- Date of birth where explicitly supplied
- Registration number
- Business name
- Other configured fields

The system should flag discrepancies, not make unsupported conclusions.

---

## 33.3 Simple final screening UX

The existing richer screening/reviewer infrastructure should be simplified in the visible product.

Target:

```text
Screening
   ↓
All applicants
   ↓
Review
   ↓
Entire application
   ↓
Approve / Reject
```

The AI action should be:

```text
Screen with AI
```

No unnecessary complexity should be introduced.

---

## 33.4 Applicant communication

Still needed:

- Submission confirmation email
- Approval email
- Rejection email
- Participant onboarding email
- Programme-specific email templates
- Communication logs
- Resend/retry handling
- Delivery status

---

## 33.5 Participant progress & attendance

Roadmap:

- Attendance sessions
- Attendance records
- Participant progress
- Programme milestones
- Completion criteria
- Progress indicators
- Participant notes
- Progress reporting

---

## 33.6 Certificates & completion

Planned:

- Completion criteria
- Certificate generation
- Certificate templates
- Participant certificate records
- Certificate verification
- Download/share

---

## 33.7 Production hardening

Still required:

- Full security review
- Storage review
- RLS verification
- Auth configuration review
- Rate-limit review
- Error handling review
- Mobile QA
- Accessibility QA
- Production build verification
- End-to-end testing
- Backup/recovery review
- Monitoring/logging review

---

# 34. Supabase security status

Current hardening has addressed:

- Duplicate permissive RLS policies
- Public SECURITY DEFINER exposure for the duplicate-form RPC
- Review organisation scoping
- Audit organisation scoping
- Decision-change auditing
- Core foreign-key indexing
- Application document storage policy
- Public submission RPC security

### Known remaining warning

Supabase's leaked-password protection warning remains because the current plan does not provide that feature.

This is a platform/plan limitation rather than a reason to invent a workaround.

---

# 35. Product decisions that should NOT be reversed accidentally

## Decision 1 — No separate shortlist stage

Current model:

```text
Approved = Selected = Enrolled
```

Do not reintroduce shortlist/final-selection stages unless the product requirements explicitly change.

## Decision 2 — AI is advisory

AI can recommend.

Human approves or rejects.

## Decision 3 — Screening must be simple

The visible workflow should not become a complicated enterprise review system.

## Decision 4 — Complete application review

The reviewer must be able to see the entire submitted form and relevant evidence from one review experience.

## Decision 5 — Unique ID is user-facing

The applicant should receive and save the ID immediately after submission.

## Decision 6 — Historical form versions remain immutable

Never reinterpret old submissions against a newer form version.

---

# 36. Recommended final information architecture

```text
Dashboard

Programmes
  ├── Overview
  ├── Form
  ├── Eligibility
  ├── Applications
  └── Settings

Screening
  ├── All Applicants
  └── Review Applicant

Participants
  ├── All Participants
  ├── Active
  ├── Completed
  └── Withdrawn

Analytics

Notifications

Settings
  ├── Organisation
  ├── Profile
  ├── Team
  └── Account
```

The navigation should not expose internal technical complexity to the user.

---

# 37. Recommended final screening UI

## Screening header

```text
Screening

Review submitted applications and make approval decisions.

[Screen with AI]
```

## Applicant table

```text
Search applicants...

Applicant | ID | Score | Eligibility | AI | Status | Review
```

## Review screen

```text
John Doe
APP-00001

Applicant Information
─────────────────────
...

Application
─────────────────────
Question
Answer

Question
Answer

Question
Answer

Documents
─────────────────────
...

Eligibility
─────────────────────
Eligible

Score
─────────────────────
82 / 100

AI Recommendation
─────────────────────
Recommend

────────────────────────────────
[ Reject ]              [ Approve ]
────────────────────────────────
```

That is the intended final experience.

---

# 38. Testing strategy

Every major feature should be tested through the actual user journey.

## Applicant

```text
Open programme
→ Complete form
→ Upload file
→ Submit
→ Receive ID
→ Confirmation displayed
```

## Admin

```text
Open screening
→ See applicant
→ Review
→ Read answers
→ See eligibility
→ See documents
→ Optional AI screen
→ Approve / Reject
```

## Participant

```text
Approve
→ Participant created
→ Participant ID retained
→ Participant visible
→ Status tracked
```

## Security

```text
User A
→ cannot access Organisation B data

Reviewer
→ only assigned/relevant reviews

Admin
→ organisation-scoped access

Anonymous
→ only published public application paths
```

---

# 39. Current priority order

The recommended remaining work order is:

### Priority 1 — Finish the simple screening experience

- Simplify screening list
- Simplify review page
- Approve
- Reject
- Show full application
- Show unique ID
- Show AI recommendation
- Screen with AI

### Priority 2 — Verify applicant ID end-to-end

- Generate
- Return
- Display
- Persist
- Reuse for participant

### Priority 3 — Complete document handling

- PDF extraction
- Document verification
- Mismatch flags

### Priority 4 — End-to-end lifecycle QA

```text
Programme
→ Form
→ Application
→ ID
→ Eligibility
→ Screening
→ Approve/Reject
→ Participant
→ Analytics
```

### Priority 5 — Participant progress

- Attendance
- Progress
- Completion

### Priority 6 — Communications

- Applicant email
- Approval/rejection email
- Participant communication

### Priority 7 — Production hardening

- Security
- Accessibility
- Mobile
- Deployment
- Monitoring
- Supervisor

### Priority 8 — Certificates

- Completion
- Certificate generation
- Verification

---

# 40. Definition of done for ApplyFlow v1

ApplyFlow v1 should be considered ready when an organisation can successfully complete this entire journey:

```text
1. Create organisation
        ↓
2. Create programme
        ↓
3. Build form
        ↓
4. Configure eligibility
        ↓
5. Publish
        ↓
6. Applicant opens public form
        ↓
7. Applicant submits
        ↓
8. Applicant receives unique ID
        ↓
9. Admin sees applicant
        ↓
10. Admin opens Review
        ↓
11. Admin sees entire application
        ↓
12. Admin can optionally Screen with AI
        ↓
13. AI returns recommendation
        ↓
14. Admin clicks Approve or Reject
        ↓
15. Approved applicant becomes participant
        ↓
16. Participant can be tracked
        ↓
17. Analytics reflects the lifecycle
        ↓
18. Audit trail records important actions
```

Every step must work with real data, not mock data.

---

# 41. Current project status

**Product stage:** Active build / production QA

**Core architecture:** Established

**Core application workflow:** Established

**Screening direction:** Simplifying to a direct Review → Approve/Reject workflow

**AI direction:** Advisory full-application screening

**Participant direction:** Approved applicants become participants

**Unique ID direction:** Generated at submission and shown immediately

**Document direction:** Metadata + text/image extraction implemented; PDF and verification remain

**Security:** Major hardening completed; final production review remains

**Deployment:** Vercel deployment exists, but current connected Vercel tooling does not expose the ApplyFlow project for a fresh deployment verification

**Autonomous supervisor:** Exists but still requires environment/credential fixes

---

# 42. Source-of-truth rules for future implementation

Before changing ApplyFlow:

1. Inspect the existing implementation first.
2. Do not rebuild an existing feature from scratch.
3. Keep changes as small as possible.
4. Preserve organisation isolation.
5. Preserve form-version integrity.
6. Preserve auditability.
7. Keep AI advisory.
8. Do not expose secrets in frontend code.
9. Verify Supabase changes with SQL.
10. Re-fetch changed GitHub files after edits.
11. Run/build-check before calling a change complete.
12. Distinguish clearly between:
   - pushed to GitHub
   - deployed
   - build passed
   - browser verified
   - production flow verified

---

# 43. One-line product definition

> **ApplyFlow helps organisations collect applications, review them quickly, use AI to assist screening, approve or reject applicants, and manage approved applicants as participants.**

---

**ApplyFlow — applications in, decisions forward.**
