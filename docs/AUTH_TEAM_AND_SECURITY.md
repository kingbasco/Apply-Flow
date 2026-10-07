# Authentication, Team and Security

## Authentication

Current implemented sign-in paths include:

- Email + password.
- Username + password.
- Password reset/recovery.
- Team invite account setup.

Google OAuth is **not present in the current frontend implementation**.

## Username login

Username login is handled through the `username-login` Edge Function.

The browser does not resolve usernames to emails directly.

The flow returns generic invalid-credential errors and only creates a client session after the server-side authentication succeeds.

## Password policy

New/reset/invite flows require at least 10 characters in the current frontend.

## Active-session enforcement

A series of security migrations introduced active-session checks for privileged RPCs and authenticated RLS paths.

Sensitive operations should not rely only on a JWT being syntactically valid.

## Team management

Roles:

- Owner.
- Admin.
- Programme Staff (`reviewer` internally).

Invite infrastructure includes shareable invite links and server-side invite handling.

Hierarchy rules protect:

- Owner account.
- Owner-only Admin removal where enforced.
- Self-removal restrictions.
- Cross-organisation access.

## Security architecture

Main controls include:

- RLS on exposed tables.
- Organisation scoping.
- Protected RPCs.
- Private helper schemas.
- Active-session validation.
- Edge Function authorization.
- Public endpoint rate limiting.
- Storage path validation.
- Published form immutability.
- Audit/history tables.
- Restricted function EXECUTE grants.

## Public participant endpoints

Public flows are intentionally narrow and validate programme-specific identity or tokens.

Examples:

- Public application.
- Participant ID lookup.
- Attendance check-in.
- Assignment open/submit.
- Result lookup.

Rate-limit migrations protect the public participant portals.

## SECURITY DEFINER caution

ApplyFlow still contains SECURITY DEFINER functions.

They must:

- Have a controlled `search_path`.
- Validate auth/role where they are authenticated-only.
- Have explicit EXECUTE grants/revokes.
- Be reviewed through Supabase advisors.

Some advisor warnings are intentional because certain public functions must be anonymously callable, but each finding should be reviewed individually.

## Secrets

Secrets such as SMTP credentials, Meta credentials and service-role keys must stay in server-side environments / Supabase Edge Function Secrets.

Never put them in:

- React/Vite public environment variables.
- Git commits.
- Documentation examples with real values.
