# Deployment, Operations and QA

## Source and hosting

- Repository: `kingbasco/Apply-Flow`
- Frontend hosting: Vercel.
- Backend: Supabase.

## Frontend build

```bash
npm install
npm run build
```

The production build command is:

```text
tsc -b && vite build
```

## Local development

```bash
npm install
npm run dev
```

A valid Supabase project configuration is required for useful local operation.

## QA supervisor

The repository includes:

```bash
npm run agent
npm run agent:once
```

for the project QA/supervisor workflow.

## Current automated tests

Repository tests currently include:

- `tests/email-providers.test.mjs`
- `tests/participant-email-correction.sql`

The project does not yet have broad automated coverage for every feature.

## Deployment workflow

Typical safe workflow:

1. Create feature/fix branch.
2. Make code/schema changes.
3. Verify Supabase changes directly where required.
4. Commit reproducible migration files.
5. Run build/tests.
6. Open PR.
7. Confirm Vercel preview/status.
8. Merge to `main`.
9. Confirm the exact merged commit receives a successful Vercel production status.
10. Run feature-specific smoke checks.

Do not call a change live based only on a successful PR merge.

## Supabase migrations

Schema/RPC changes should be represented under `supabase/migrations/`.

When urgent fixes are applied directly to the live database during debugging, a matching migration must still be committed so repository history remains reproducible.

## Edge Function operations

When an Edge Function changes:

- Deploy the function.
- Verify auth/JWT expectations.
- Confirm required secrets exist.
- Check function logs for real requests.
- Exercise a controlled end-to-end flow.

## Secrets

Keep provider tokens/passwords/service-role keys out of GitHub.

Use Supabase Edge Function Secrets or the appropriate protected deployment environment.

## Production verification examples

Depending on the feature:

- Auth: sign-in/reset/invite smoke test.
- Applications: publish and submit.
- Assignments: open, upload, submit, grade, release, result lookup.
- Leaderboard: Owner/Admin, Program Staff and participant scope checks.
- Email: validate provider, then send a controlled message.
- WhatsApp: validate connection/template sync and controlled opt-in campaign.
- Attendance: create/open session and check in.
