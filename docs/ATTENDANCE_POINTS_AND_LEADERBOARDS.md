# Attendance, Points and Leaderboards

## Attendance

Core tables:

- `attendance_sessions`
- `attendance_records`

Attendance supports:

- Session title/date.
- Public check-in slug.
- Editable slug.
- Open/closed check-in state.
- Shareable public check-in URL.
- Participant self check-in.
- Duplicate prevention.
- Manual/administrative viewing.

Public check-in requires Participant ID + registered application email.

## Points model

The running leaderboard total is:

```text
Released graded assignment scores
+ attendance points
+ active bonus-point awards
= total points
```

### Attendance points

Attendance points per present session are stored as an organisation/workspace setting.

The current configured default introduced by migration is 5 points per present attendance record.

### Bonus points

Bonus points use `participant_point_awards`.

Current UI/backend policy restricts extra/bonus point management to Owner/Admin.

Awards can be audited/revoked rather than silently overwritten.

Owner/Admin can use the **Award Bonus Points** tab in Participants to paste up to 500 Participant IDs, choose Points, Category, Reason and optional Note, and directly award everyone in one action. Awarding is atomic and idempotent by a unique request key; unknown IDs, inactive participants and duplicate entries are rejected before any rows are inserted.

The **First people on the call** category is just another bonus reason: it has **no group requirements**, no 25-person limit, and no per-day recipient restriction. Participants may receive separate awards on multiple occasions. The existing single-participant profile form remains available.

A searchable, paginated bonus-points dashboard below the form shows each recipient's Participant ID/name, points, category, reason, note, awarding administrator, date, and active/revoked status. It provides an active-points summary and supports revocation with confirmation. Visibility remains Owner/Admin-only with organisation scoping. No points are granted as part of deployment.

## Overall leaderboard

The internal Overall leaderboard includes active participants and totals:

- Assignment points.
- Attendance points.
- Bonus points.
- Total points.
- Rank.

## Group leaderboard model

Group leaderboards are based on Program Staff assignment.

The current Hertisan Cohort 2 mapping is stored in the private `programme_leaderboard_groups` table.

Configured labels:

| Label | Program Staff |
|---|---|
| Group 1 | David Popoola |
| Group 2 | Fatima Abdul Sule |
| Group 3 | Pelumi Tytler |
| Group 4 | Stella Oluwayemisi Ayinde |
| Group 5 | Afolakemi Deborah Adeosho |
| Test | Cyril Adesegha |

The **Test** group is intentionally separate from numbered production groups and currently uses the single participant assigned to the test Program Staff account.

## Admin / Owner experience

Default view:

- Overall.

Available direct tabs:

- Overall.
- Group 1.
- Group 2.
- Group 3.
- Group 4.
- Group 5.
- Test.

The group tabs are based on Program Staff group configuration rather than a generic participant filter.

## Programme Staff experience

Default view:

- Their own group.

They also receive an **Overall** option in the authenticated workspace.

The group RPC prevents Programme Staff from requesting another Program Staff member's scoped group.

## Participant experience

Participants do **not** receive the overall leaderboard.

The public result endpoint determines the participant's assigned Program Staff group and returns only that group's ranking rows.

The participant page displays:

- Group label.
- Program Staff name.
- Group ranking.
- Assignment / attendance / bonus / total points.

A participant not mapped to a configured group falls back to a safe limited result rather than receiving the full programme leaderboard.

## Ranking

Group ranking is calculated inside the group, so a participant's group rank can differ from their overall rank.
