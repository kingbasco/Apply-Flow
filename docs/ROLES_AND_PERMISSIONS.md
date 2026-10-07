# Roles and Permissions

ApplyFlow has three active workspace roles.

## Owner

The Owner has the highest organisation-level control.

Typical capabilities:

- Manage organisation settings.
- Create/manage programmes and forms.
- Manage Admin and Programme Staff access.
- Remove Admin users.
- Manage screening and final decisions.
- Assign/unassign participants to staff.
- Manage participants.
- Create/manage attendance and assignments.
- Grade/release assignment results.
- Manage bonus points.
- Use Email/WhatsApp administrative sending workflows.
- View overall and group leaderboards.
- Access analytics and settings.

## Admin

Admins run programme operations.

Typical capabilities:

- Programme and form management.
- Screening/review operations.
- Participant management and staff assignment.
- Attendance and assignment administration.
- Grading/result release.
- Bonus-point administration.
- Communications.
- Overall and group leaderboards.
- Analytics.

Hierarchy restrictions still protect the Owner. Owner-only member-removal rules apply where enforced by backend logic.

## Programme Staff

The UI label is **Programme Staff**. The database role value remains `reviewer` in several places for compatibility.

Programme Staff access is assignment-aware.

Current operational capabilities include, where permitted:

- Work with assigned applications/participants.
- Review assigned work.
- View assigned participant identity/contact fields allowed by RLS.
- Attendance-related operations exposed to staff.
- Assignment-related operations exposed to staff.
- Send the participant ID through the manual WhatsApp helper.
- View leaderboard.

### Leaderboard behaviour

Programme Staff default to **their own leaderboard group**. They may switch to **Overall** in the authenticated workspace.

They cannot use another Program Staff group's scoped leaderboard RPC by supplying a different staff ID; the backend restricts a reviewer to their own staff ID.

## Participants

Participants are not workspace users.

They interact through public routes using their programme identity:

- Public application.
- Attendance check-in.
- Assignment submission.
- Result lookup / participant leaderboard.

Participants can only see the leaderboard group associated with the Program Staff member they are assigned to.

## Permission implementation

Permissions are enforced through a combination of:

- RLS.
- Protected database RPCs.
- Active-session checks.
- Role hierarchy checks.
- Edge Function authorization.
- Public rate limiting and token/session validation.

Frontend visibility is convenience only and is not treated as authorization.
