# Participants and Participant Operations

## Participant lifecycle

```text
Approved applicant
→ Active / Enrolled participant
→ Completed
or
→ Withdrawn
```

The main participant record connects the programme, applicant identity, submission and operational state.

## Participant directory

Current participant operations include:

- Public Participant ID.
- Name.
- Registered application email.
- WhatsApp phone.
- Trade/application data where available.
- Programme.
- Status.
- Joined date.
- Program Staff assignee.
- Attendance information.
- Assignment information.
- Full participant profile.

## Staff assignment

Owners/Admins can assign and unassign participants to Program Staff.

The same assignment relationship is reused by:

- Staff work queues.
- Email recipient grouping.
- Group-scoped leaderboards.

## Programme Staff visibility

Programme Staff work with participants assigned to them according to RLS and backend authorization.

## Pagination

The participant table defaults to 50 rows.

Operational page-size options include 50 / 100 / 200 / 300 in the main participant workflows.

Select-all is page-scoped.

## Participant export

CSV export supports core fields and selected application-form answers.

Core fields include:

- Participant ID.
- Name.
- Email.
- WhatsApp phone.
- Programme.
- Status.
- Joined date.

The export modal can include selected question/answer fields instead of exporting every field automatically.

## Manual WhatsApp ID helper

Participant profiles include a manual WhatsApp helper that opens WhatsApp with a prefilled message containing:

- Participant name.
- Participant ID.
- Registered email.
- Programme context.

This is separate from the Meta WhatsApp campaign system.

## Loan Interest tab

Owner/Admin have a **Loan Interest** participant view.

The backend currently identifies active/completed participants whose submitted application contains the exact question label:

`Are you interested in getting a business loan?`

and whose answer is:

`Yes`

The lookup uses an authorised private helper behind a public SECURITY INVOKER wrapper.

## Benefits

The participant workspace includes an admin-only Benefits area and benefit distribution data model. This area exists in the product but should be treated as less mature than the core participant/attendance/assignment workflows unless separately verified.

## Participant email correction

A participant email-correction implementation and audit table exist historically, but browser-authenticated execution was later disabled.

See [PARTICIPANT_EMAIL_CORRECTIONS.md](./PARTICIPANT_EMAIL_CORRECTIONS.md) for the current status.
