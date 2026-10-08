# Cross-Group Assignment Review

## Purpose
Reviewers mark a balanced mix of participants across the programme, rather than grading only their normal participant groups.

## Navigation
- **Participants → Assignments**: Programme Staff see the participants in their regular group, their submission status, score, and submitted work. The modal is read-only; grading actions are not present.
- **Assignment Review** (before Leaderboard): all active Programme Staff review and grade only the submissions explicitly allocated to them. This table does **not** disclose the source-group staff or allocated reviewer identity.
- **Admin/Owner**: Assignment Review shows the total workload, allocation summary by reviewer, submission → reviewer mapping and original staff group, with a confirmation-gated **Re-shuffle pending** action.

## Data separation and behavior
- Participant-group ownership remains unchanged and is reused by attendance, messaging, participant administration, and leaderboard calculations.
- Allocations live in `assignment_review_allocations`. Every submission has at most one allocation per assignment.
- A trigger allocates each newly submitted assignment once. Manual re-shuffle touches only submissions still awaiting grading.
- Existing graded work remains with its historical grader and is not silently reopened or re-scored.
- The shuffle strongly prefers a reviewer **outside** the participant's normal group, then picks the reviewer with the fewest allocations for this assignment. If no outside-group reviewer is eligible, it can fall back to one of the available reviewers. This avoids leaking the source group or leaving review work indefinitely blocked.
- Review allocations are stable across reloads until an Owner/Admin explicitly re-shuffles pending work.

## Authorization
- All allocation changes are backend-only, not editable through the browser.
- Admin-only shuffle RPC verifies active session, organization membership, and Owner/Admin role.
- Queue RPC shows rows only for assigned reviewer (or all for Admin/Owner). Reviewer/source-group columns are null for reviewers.
- Existing group-scoped SELECT policies remain for read-only status checking, while new policies permit assigned reviewers to access cross-group submissions, answers, document metadata and authorized signed files.
- Grading RPC checks the reviewer allocation server-side. Programme Staff cannot grade their group submissions from Participants, cannot grade someone else's allocation by forging a request, and cannot override a previously graded submission. Admin/Owner may correct grades.
- Current reviewer role is `reviewer` in the database; UI label remains Programme Staff.

## Migration/production rollout
1. Run the TypeScript + Vite build and review the PR diff.
2. Apply `20261008161000_cross_group_assignment_review.sql` in Supabase, including the one-time backfill of ungraded submissions.
3. Verify allocation balance and organization isolation without reading private participant contents unnecessarily.
4. Release the frontend and smoke-test as Owner/Admin and Programme Staff.
5. Check that private documents open under the allocated role; verify no grade controls in Participants → Assignments.
6. Verify grading updates grade history and leaderboard outputs as before.

## QA assertions
- Programme Staff A sees only A's participant group under Participants → Assignments.
- Programme Staff A cannot grade from that view (UI and RPC).
- A can view and grade only submissions in their Assignment Review queue, including participants outside group A.
- A cannot query someone else's queue or see group ownership / recipient allocation mapping.
- A cannot grade an unallocated submission, even by directly invoking `grade_assignment_submission`.
- Admin/Owner sees who was assigned each submission and can re-shuffle only pending work.
- A subsequent new submission gets one allocation automatically.
- Re-shuffle leaves already graded submissions and scores unchanged.
- Cross-organization staff cannot see or grade any submissions from another organization.
- Missing reviewers leave work unallocated, not falsely 'reviewed'; an Admin can allocate later.
