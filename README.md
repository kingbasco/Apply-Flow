# ApplyFlow

> **Application intake, screening, review, and selection — in one workspace.**

ApplyFlow is a web-based application management platform for organisations running programmes, scholarships, fellowships, grants, recruitment drives, community programmes, and other application-based initiatives.

**Create programme → Build form → Publish → Collect applications → Check eligibility → Screen → Review → Shortlist → Select → Report**

AI-assisted screening is designed to support reviewers, not replace them. Final decisions remain human-controlled and auditable.

---

## ✨ Product at a glance

| Area | Status |
|---|---|
| 🏗️ Foundation & workspace | 🟢 Built |
| 🔐 Authentication & profiles | 🟢 Built |
| 📋 Application management | 🟢 Built / QA |
| 🧩 Form builder & versioning | 🟢 Built / QA |
| 🌍 Public applicant experience | 🟡 In progress |
| ✅ Eligibility rules | 🟡 In progress |
| 🎯 Scoring | 🟡 In progress |
| 🤖 AI-assisted screening | 🟡 In progress |
| 👥 Review teams | 🟢 Built / QA |
| 🏆 Shortlist & final selection | 🟡 In progress |
| 📊 Analytics & reporting | 🟡 In progress |
| 🔔 Notifications | 🔴 Planned |
| 🛡️ Production hardening | 🔴 Planned |

> 🟢 Built · 🟡 In progress · 🔴 Planned

---

## 🖼️ Product workflow

```text
┌──────────────────┐
│  Organisation    │
│  creates a       │
│  programme       │
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Form Builder    │
│  + versioning    │
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Publish public  │
│  application     │
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Applicants      │
│  submit forms    │
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Eligibility +    │
│ validation       │
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Screening +      │
│ scoring          │
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Review teams     │
│ assess applicants│
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Shortlist +      │
│ final selection  │
└────────┬─────────┘
         ▼
┌──────────────────┐
│ Analytics +      │
│ reporting        │
└──────────────────┘
```

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

### 2. Authentication & account management

- Email/password sign up and sign in
- Google sign in/sign up
- Username-based sign in
- Organisation creation during signup
- User profiles
- Username management
- Date of birth stored as month/day only
- Profile photo upload
- Forgot password and password reset
- Team invitation account setup
- Owner, Admin, and Reviewer roles

Username rules: **3–30 characters**, using lowercase letters, numbers, and underscores, with case-insensitive uniqueness.

### 3. Application management

- Application creation
- Dashboard and application list
- Draft / published / screening / closed / completed states
- Deadlines
- Target counts
- Public application slugs
- Applicant instructions
- Submission limits
- Confirmation messages

```text
Draft → Published → Screening → Closed → Completed
```

### 4. Form builder & versioning

The visual form builder supports:

- Question ordering and deletion
- Required questions
- Descriptions and placeholders
- Choice options
- Multiple choice and dropdowns
- Rating questions
- File and image uploads
- Date, number, email, and phone fields
- Nigerian state and LGA selection
- Conditional questions
- Applicant preview
- Draft and published versions

Published forms are treated as immutable. After publishing, ApplyFlow creates the next draft from the published version so future edits do not alter historical submissions.

```text
Draft v1 → Publish v1 → Draft v2 → Publish v2 → Draft v3
```

### 5. Public applicant experience

Current flow:

**Public programme → Availability checks → Dynamic form → Conditional questions → File uploads → Submission**

Already covered:

- Start-date checks
- Deadline checks
- Submission-limit checks
- Published form loading
- Dynamic questions
- Nigerian state/LGA selection
- File/image uploads
- Application submission

Still being completed:

- Final submission confirmation
- Unique Application ID presentation
- Applicant status tracking
- Duplicate-submission handling
- Final mobile UX

### 6. Eligibility rules

Target workflow:

```text
Age ≥ 18
AND
State = Lagos
AND
Employment status = Unemployed
        ↓
     ELIGIBLE
```

Planned capabilities include rule building, AND/OR conditions, automatic evaluation, Eligible/Ineligible/Needs Review outcomes, explanations, re-evaluation, and history.

### 7. Scoring

Example scoring model:

| Criterion | Weight |
|---|---:|
| Experience | 20 |
| Education | 15 |
| Motivation | 20 |
| Location | 10 |
| Programme fit | 35 |
| **Total** | **100** |

Planned capabilities include weighted criteria, automatic calculation, score breakdowns, permitted reviewer adjustments, history, filtering, and ranking.

### 8. AI-assisted screening

AI assistance is intended to help reviewers process large application volumes through:

- Applicant summaries
- Criteria-based analysis
- Strengths and potential concerns
- Programme-fit analysis
- Screening recommendations
- Explainable screening output

```text
Applicant
   ↓
Eligibility / Score
   ↓
AI assistance
   ↓
Human reviewer
   ↓
Final decision
```

AI output is advisory. Final selection remains controlled by authorised human users.

### 9. Review teams

Current roles:

- Owner
- Admin
- Reviewer

The review workflow covers team management, reviewer access, application review, screening decisions, notes, permissions, and auditability.

### 10. Shortlisting & final selection

```text
Applications → Eligibility → Screening → Review
                                      ↓
                                  Shortlist
                                      ↓
                                  Finalists
                                      ↓
                           Selected / Not selected
```

Planned capabilities include bulk shortlisting, finalist status, selection/rejection decisions, notes, history, audit trails, and exports.

### 11. Analytics & reporting

Planned reporting includes:

- Total applications
- Applications over time
- Submission conversion
- Eligible vs. ineligible
- Screening results
- Average scores
- Shortlist and selection numbers
- Geographic breakdown
- Programme performance
- Date filtering
- Report exports

### 12. Notifications

Planned applicant notifications include application received, Application ID, status changes, shortlisted, selected, not selected, and programme updates.

Organisation notifications will cover new submissions, reviewer activity, screening completion, deadline reminders, and submission-limit alerts.

---

## 🔐 Security & data architecture

ApplyFlow uses Supabase/Postgres with organisation-level data isolation.

Security work already includes:

- Row Level Security
- Role-aware access
- Protected workspace routes
- User-scoped profile data
- Profile image storage policies
- Authenticated profile updates
- Protected database functions
- Public submission RPC controls
- Google signup workspace hardening

**Before production:** review SECURITY DEFINER functions, RPC permissions, storage policies, leaked-password protection, and role boundaries.

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
| AI direction | Google Gemini |
| Automation | GitHub Actions |

---

## 🗂️ Project structure

```text
Apply-Flow/
├── agent/
│   ├── state.json
│   └── supervisor.mjs
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

The repository also contains a supervisor intended to verify and monitor deployments.

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

It is designed to verify credentials, run the build, inspect Vercel, browser-check the deployment, send failure evidence to Gemini, apply a safe patch when appropriate, commit/push the fix, and verify again.

**Current status:** the supervisor code exists, but its GitHub Actions environment still has a Vercel token injection issue that must be resolved before the autonomous loop can run successfully.

---

## 🧪 Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Preview:

```bash
npm run preview
```

---

## 🛣️ Product roadmap

| Phase | Area | Status |
|---:|---|---|
| 1 | Foundation & Authentication | 🟢 Mostly complete |
| 2 | Application Management | 🟢 Built / final QA |
| 3 | Form Builder & Versioning | 🟢 Built / final QA |
| 4 | Applicant Experience | 🟡 In progress |
| 5 | Eligibility Rules | 🟡 In progress |
| 6 | Scoring | 🟡 In progress |
| 7 | AI-assisted Screening | 🟡 In progress |
| 8 | Review Teams | 🟢 Built / final QA |
| 9 | Shortlist & Final Selection | 🟡 In progress |
| 10 | Analytics & Reporting | 🟡 In progress |
| 11 | Notifications | 🔴 Planned |
| 12 | Production Hardening | 🔴 Planned |

### Current implementation priority

```text
Phase 4  Applicant experience
   ↓
Phase 5  Eligibility
   ↓
Phase 6  Scoring
   ↓
Phase 7  AI screening
   ↓
Phase 9  Shortlist & selection
   ↓
Phase 10 Analytics
   ↓
Phase 11 Notifications
   ↓
Phase 12 Production hardening
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
Important screening and selection actions should leave a traceable history.

### Applicant clarity
Applicants should understand what they submitted, receive a unique application reference, and know what happens next.

### Secure by default
Authentication, authorisation, storage, database policies, and public submission paths are treated as production security boundaries.

---

## 📋 Production-readiness checklist

- [ ] Authentication fully tested
- [ ] Organisation isolation verified
- [ ] Application lifecycle verified
- [ ] Form versioning verified
- [ ] Applicant submission flow complete
- [ ] Unique Application ID displayed
- [ ] Applicant status tracking complete
- [ ] Eligibility engine complete
- [ ] Scoring engine complete
- [ ] AI screening reviewed and tested
- [ ] Reviewer permissions verified
- [ ] Shortlist and final selection complete
- [ ] Analytics complete
- [ ] Notifications complete
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

**Primary focus:** Completing the applicant → eligibility → screening → review → selection pipeline.

ApplyFlow is being developed as a production-oriented platform rather than a static prototype. Features are being implemented incrementally, tested against the real Supabase/Vercel environment, and hardened before the platform is considered complete.

---

**ApplyFlow — applications in, decisions forward.**
