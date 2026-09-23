# ApplyFlow

> **Application intake, screening, review, and participant management — in one workspace.**

ApplyFlow is a web-based application management platform for organisations running programmes, scholarships, fellowships, grants, recruitment drives, community programmes, and other application-based initiatives.

**Create programme → Build form → Publish → Collect applications → Check eligibility → Screen → Approve → Enrol participants → Track outcomes → Analyse**

AI-assisted screening supports reviewers; it does not replace human decision-making.

---

## ✨ Product at a glance

| Area | Status |
|---|---|
| 🏗️ Foundation & workspace | 🟢 Built |
| 🔐 Authentication & profiles | 🟢 Built |
| 🏢 Organisation profile & logo | 🟢 Built |
| 📋 Application management | 🟢 Built |
| 🧩 Form builder & versioning | 🟢 Built / QA |
| 🌍 Public applicant experience | 🟢 Built / QA |
| 🔎 Eligibility rules | 🟢 Built / QA |
| 🎯 Reviewer scoring | 🟢 Built / QA |
| 🤖 AI-assisted screening | 🟢 Built / QA |
| 👥 Review teams & assignments | 🟢 Built / QA |
| 👤 Participant management | 🟢 Built / QA |
| 📊 Analytics & reporting | 🟢 Built / QA |
| 🔔 Notifications | 🟢 Built / QA |
| 🛡️ Production hardening | 🟡 Ongoing |

> 🟢 Built · 🟡 In progress / QA · 🔴 Planned

---

## 🖼️ Current product workflow

```text
┌──────────────────────┐
│ Organisation creates │
│ a programme          │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Build application    │
│ form + rules         │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Publish programme    │
│ and public form      │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Applicant submits    │
│ application          │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Eligibility +        │
│ validation           │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Screening + reviewer │
│ scoring + AI support │
└──────────┬───────────┘
           ▼
     ┌─────┴─────┐
     ▼           ▼
┌──────────┐  ┌──────────┐
│ Approve  │  │  Reject  │
└────┬─────┘  └──────────┘
     ▼
┌──────────────────────┐
│ Automatically enrol  │
│ as participant        │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Active → Completed / │
│ Withdrawn            │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Analytics & reporting│
└──────────────────────┘
```

ApplyFlow no longer uses a separate shortlist/final-selection stage. Once a submitted application is approved during screening, the applicant becomes a participant automatically.

---

## 🚀 What has been built

### 1. Foundation & workspace

- React + TypeScript + Vite
- Responsive application shell
- Dashboard and workspace navigation
- Organisation/workspace context
- Supabase/Postgres
- Row Level Security (RLS)
- Role-aware workspace structure
- Light and dark themes
- Reusable UI components
- Workspace-level organisation branding

### 2. Authentication & account management

- Email/password sign up and sign in
- Google sign in/sign up
- Username-based sign in
- Organisation creation during signup
- User profiles
- Username management
- Profile photo upload
- Forgot password and password reset
- Team invitation account setup
- Owner, Admin, and Reviewer roles

Username rules: **3–30 characters**, using lowercase letters, numbers, and underscores, with case-insensitive uniqueness.

### 3. Organisation profile & branding

Organisation settings now support:

- Organisation name and workspace details
- Organisation profile/logo image
- JPG, PNG, and WebP uploads
- 5 MB upload limit
- Public organisation avatar storage
- Logo display in the workspace switcher

Organisation profile images are stored securely in Supabase Storage and linked to the organisation record.

### 4. Programme management

Programme creation and editing supports:

- Programme name
- Description
- Application deadline
- Target participant count
- Public application slug
- Applicant instructions
- Submission limits
- Confirmation messages
- Participant ID prefix
- Draft/published/closed/completed lifecycle
- Publish and unpublish controls
- Close applications

Before publishing, ApplyFlow validates the programme configuration, including the Participant ID prefix, public slug, and published form version.

```text
Draft → Published → Closed → Completed
```

### 5. Form builder & versioning

The visual form builder supports:

- Question creation, editing, ordering, and deletion
- Required questions
- Descriptions and placeholders
- Choice options
- Multiple choice and dropdowns
- Rating questions
- File and image uploads
- Date, number, email, and phone fields
- Nigerian state and LGA selection
- Conditional questions
- Eligibility rules
- Applicant preview
- Draft and published versions

Published forms are treated as immutable. Future edits are made through a new draft version so historical submissions remain tied to the form version they used.

When form versions are cloned, conditional and eligibility rules are remapped to the newly created question IDs.

```text
Draft v1 → Publish v1 → Draft v2 → Publish v2 → Draft v3
```

### 6. Public applicant experience

The public application flow supports:

- Public programme pages
- Application availability checks
- Start-date checks
- Deadline checks
- Submission-limit checks
- Published form loading
- Dynamic questions
- Conditional questions
- Eligibility evaluation
- Nigerian state/LGA selection
- File and image uploads
- Application submission
- Submission confirmation
- Participant ID presentation

After submission, the applicant receives a Participant ID generated by ApplyFlow.

### 7. Participant ID system

ApplyFlow uses a single user-facing identifier for the applicant/participant lifecycle:

```text
OWNER PREFIX - YEAR - SYSTEM NUMBER
```

Examples:

```text
ECA-2026-00001
ECA-2026-00002
ATH-2026-00001
```

The system:

1. Uses the programme owner's configured prefix.
2. Adds the year automatically.
3. Generates a sequential five-digit number.
4. Keeps the same Participant ID through the application and participant lifecycle.
5. Keeps internal UUIDs private for database relationships.

Participant IDs are generated atomically in the database to prevent duplicate numbers for the same organisation prefix and year.

### 8. Eligibility rules

Programmes can define eligibility requirements using application answers.

The system supports:

- Eligibility rule configuration
- Question-based conditions
- Conditional logic
- Automatic eligibility evaluation
- Eligibility status used during screening
- Re-evaluation when relevant answers change

Eligibility is presented clearly during applicant review so reviewers can understand whether an application meets the configured requirements.

### 9. Screening & reviewer scoring

The Screening workspace provides reviewers with:

- Submitted applications
- Pending, approved, and rejected decisions
- Applicant answers
- Eligibility result
- Reviewer scoring
- AI recommendation
- Review assignments
- Reviewer access controls
- Review audit history

The applicant review experience includes a clear review summary:

- **Eligibility**
- **Reviewer score**
- **AI recommendation**

AI recommendations are advisory. The authorised reviewer remains responsible for the final decision.

Final actions are intentionally clear:

- **Approve & enrol participant**
- **Reject application**

Approving an application automatically moves the applicant into the Participants area.

### 10. AI-assisted screening

ApplyFlow includes Gemini-powered AI assistance for application screening.

AI assistance can provide:

- Applicant summaries
- Criteria-based analysis
- Strengths and potential concerns
- Programme-fit analysis
- Screening recommendations
- Explainable screening output

```text
Applicant
   ↓
Eligibility
   ↓
Reviewer score + AI assistance
   ↓
Human reviewer
   ↓
Approve & enrol / Reject
```

AI output is advisory and does not make the final decision.

The AI screening Edge Function includes retry and fallback handling for transient model/API failures.

### 11. Participant management

Approved applicants automatically become participants.

Participant records support:

- Participant ID
- Applicant relationship
- Programme relationship
- Active/enrolled status
- Completed status
- Withdrawn status
- Joined date
- Attendance count

Current participant lifecycle:

```text
Approved
   ↓
Active / Enrolled
   ├──→ Completed
   └──→ Withdrawn
```

There is no separate shortlist or selected stage in the current product model. **Approved = selected/enrolled.**

### 12. Analytics & reporting

Analytics now follows the actual ApplyFlow lifecycle.

Current metrics include:

- Total submissions
- Approved applications
- Rejected applications
- Enrolled participants
- Active participants
- Completed participants
- Withdrawn participants
- Scored applications
- Average reviewer score
- Approval rate
- Completion rate
- Withdrawal rate

The funnel follows:

```text
Submitted
    ↓
Approved / Enrolled
    ↓
Completed
```

Rejected applications and withdrawn participants are tracked separately.

Programme-level reporting includes:

- Submissions
- Approved/enrolled participants
- Rejected applications
- Completed participants
- Withdrawn participants

---

## 🔐 Security & data architecture

ApplyFlow uses Supabase/Postgres with organisation-level data isolation.

Security work includes:

- Row Level Security
- Role-aware access
- Protected workspace routes
- Organisation-scoped data access
- User-scoped profile data
- Profile image storage policies
- Organisation logo storage policies
- Authenticated profile updates
- Protected database functions
- Public application submission RPC controls
- Secure application deletion
- Cascade handling for application-related records
- Review audit logging
- Eligibility trigger safeguards

Production security review still includes:

- SECURITY DEFINER functions
- RPC permissions
- Storage policies
- Leaked-password protection
- Role boundaries
- Public submission permissions

---

## 🔔 Notifications

ApplyFlow currently includes an in-app notifications center for workspace users.

Implemented:

- Notification bell in the workspace header
- Unread notification count
- Notification list with titles, messages, types, and relative timestamps
- Mark individual notifications as read
- Mark all notifications as read
- Real-time notification updates through Supabase Realtime
- Notification click-through to the relevant workspace area
- Latest 30 notifications displayed

Applicant email and automated programme communication workflows are separate from the in-app notification center and remain planned.

---

## 🧰 Technology stack

| Layer | Technology |
|---|---|
| Frontend | React |
| Language | TypeScript |
| Build | Vite |
| Styling | Tailwind CSS + custom CSS |
| UI | shadcn/ui + Lucide |
| Database | PostgreSQL |
| Backend | Supabase |
| Authentication | Supabase Auth |
| Storage | Supabase Storage |
| Deployment | Vercel |
| Source control | GitHub |
| AI | Google Gemini |
| Automation | GitHub Actions |

---

## 🗂️ Project structure

```text
Apply-Flow/
├── agent/
│   ├── state.json
│   └── supervisor.mjs
├── supabase/
│   ├── migrations/
│   └── functions/
├── src/
│   ├── components/
│   │   ├── ParticipantsPanel.tsx
│   │   ├── GoogleFormImport.tsx
│   │   └── WorkspaceModules.tsx
│   ├── lib/
│   │   ├── supabase.ts
│   │   └── nigeria.ts
│   ├── App.tsx
│   └── styles.css
├── public/
├── package.json
└── README.md
```

---

## 🤖 Autonomous deployment supervisor

The repository contains a supervisor intended to verify and monitor deployments.

```text
GitHub
   ↓
Production build
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
   ↺
Re-verify
```

The supervisor is designed to:

- Verify required credentials
- Run the application build
- Inspect Vercel deployments
- Browser-check deployments
- Send failure evidence to Gemini
- Apply safe patches when appropriate
- Commit and push fixes
- Re-verify the deployment

**Current status:** the supervisor code exists, but its GitHub Actions environment still has a Vercel token injection issue that must be resolved before the autonomous loop can run successfully.

---

## 🧪 Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Run a production build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

---

## 🛣️ Current roadmap

| Phase | Area | Status |
|---:|---|---|
| 1 | Foundation & Authentication | 🟢 Built |
| 2 | Organisation & Programme Management | 🟢 Built / QA |
| 3 | Form Builder & Versioning | 🟢 Built / QA |
| 4 | Public Applicant Experience | 🟢 Built / QA |
| 5 | Eligibility Rules | 🟢 Built / QA |
| 6 | Screening & Reviewer Scoring | 🟢 Built / QA |
| 7 | AI-assisted Screening | 🟢 Built / QA |
| 8 | Participant Management | 🟢 Built / QA |
| 9 | Analytics & Reporting | 🟢 Built / QA |
| 10 | In-app Notifications | 🟢 Built / QA |
| 11 | Participant Progress & Attendance | 🟡 Next |
| 12 | Certificates & Completion | 🔴 Planned |
| 13 | Production Hardening | 🟡 Ongoing |

### Immediate implementation priority

```text
Finish Vercel build / deployment QA
        ↓
End-to-end application lifecycle test
        ↓
Participant management QA
        ↓
Analytics QA
        ↓
Participant progress & attendance
        ↓
Applicant email & automated communications
        ↓
Production hardening
```

---

## 🎯 Product principles

### Human-controlled decisions

AI may assist with analysis and screening, but authorised people make final decisions.

### Version integrity

Published forms remain stable so historical submissions can always be interpreted against the version they used.

### Organisation isolation

An organisation should only access data it is authorised to access.

### Auditability

Important screening and reviewer actions should leave a traceable history.

### Applicant clarity

Applicants should understand what they submitted, receive their Participant ID, and know what happens next.

### Simple participant lifecycle

Approved applicants become participants automatically. ApplyFlow does not introduce unnecessary shortlist or selection stages between approval and enrolment.

### Secure by default

Authentication, authorisation, storage, database policies, and public submission paths are treated as production security boundaries.

---

## 📋 Production-readiness checklist

- [ ] Authentication fully tested
- [ ] Organisation isolation verified
- [ ] Programme lifecycle verified
- [ ] Form versioning verified
- [ ] Conditional questions verified
- [ ] Eligibility rules verified
- [ ] Public applicant flow verified
- [ ] Participant ID generation verified
- [ ] Participant ID displayed after submission
- [ ] Screening workflow verified
- [ ] Reviewer permissions verified
- [ ] Approve → participant flow verified
- [ ] Reject workflow verified
- [ ] Participant status lifecycle verified
- [ ] Analytics verified
- [ ] AI screening reviewed and tested
- [x] In-app notifications implemented
- [ ] Supabase security review complete
- [ ] Storage security review complete
- [ ] Accessibility review complete
- [ ] Mobile QA complete
- [ ] Vercel deployment verified
- [ ] Supervisor automation working
- [ ] End-to-end production test complete

---

## 📈 Current project status

**Stage:** Active product build

**Current focus:** Completing production QA across the full application → screening → participant lifecycle.

The core ApplyFlow workflow is now established:

```text
Programme
   ↓
Form
   ↓
Application
   ↓
Eligibility
   ↓
Screening
   ↓
Approve / Reject
   ↓
Participant
   ↓
Active / Completed / Withdrawn
   ↓
Analytics
```

ApplyFlow is being developed as a production-oriented platform rather than a static prototype. Features are implemented against the real Supabase/Vercel environment and are being tested and hardened incrementally.

---

**ApplyFlow — applications in, decisions forward.**
