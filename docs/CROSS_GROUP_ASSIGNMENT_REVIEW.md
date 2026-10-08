# Admin-Controlled Cross-Group Grading

## Operational intent
- Owners/Admins select ungraded submissions, choose a subset of eligible Programme Staff, and click **Assign & Shuffle**.
- The server distributes those selected submissions as evenly as possible across selected reviewers; it does **not** assign a reviewer from the participant's normal group.
- No incoming submission gets auto-allocated: it stays unassigned until the Owner/Admin runs a batch.
- Staff can inspect their original group's submissions under **Participants → Assignments** but cannot grade there. Their grading list is in **Assignment Review**.
- Owners/Admins see participant → original group → current grading reviewer. Programme Staff never receive source group or allocation identities in their review RPC.
- Reviewer assignment events capture transitions and new allocations for audit.

## Exclusions
- The one-participant test staff group is marked in `assignment_review_staff_settings` as ineligible. Its staff account cannot be selected, and its participant cannot appear in the grading queue.
- A participant whose registered application email matches a workspace Owner/Admin/Programme Staff account email is excluded from the grading queue, so staff test submissions do not inflate counts.
- Test exclusions apply on the database server in the queue and in the batch allocation RPC, even if the frontend is bypassed.
- Historic grades remain in the database; exclusion affects *grading allocations*, not historic grade deletion.

## Batches
- Select All selects all eligible *ungraded* submissions for the selected assignment, regardless of pagination, but never other assignments.
- Existing pending allocations on chosen submissions are replaced; nonselected pending allocations remain unchanged.
- A batch validates the entire selection transactionally, checks each reviewer is active and eligible, and forbids own-group marking. If a submission cannot be assigned within the selected reviewer pool, the entire batch aborts without partial assignments.
- Incoming work remains unassigned until selected by Admin/Owner.
- Existing graded results and grade history remain unchanged.

## Data and security
- `assignment_review_allocations` stores the current single reviewer per submission.
- `assignment_review_staff_settings` stores staff eligibility, including permanently ineligible test staff.
- `assignment_review_allocation_events` records the old/new reviewer during manual assignment and re-shuffles.
- `private.is_assignment_review_participant_eligible` enforces test-group and staff-owned participant exclusions.
- `get_assignment_review_queue` displays unassigned + allocated eligible rows to Owner/Admin and only explicitly allocated rows to Programme Staff.
- `get_assignment_review_staff` lists reviewer choices only for Owner/Admin.
- `assign_and_shuffle_assignment_reviews` requires Owner/Admin membership and applies all checks inside one transaction.
- The prior automatic assignment trigger and broad re-shuffle RPC are removed.

## Verification checklist
1. Confirm 5 eligible, 1 excluded Programme Staff in Admin review picker.
2. Confirm test staff account and one-person group participant are absent from allocations.
3. Confirm staff-member participants (matching staff account email) are excluded.
4. Check that all eligible ungraded submissions start unassigned after migration.
5. Select All, choose five reviewers, Assign & Shuffle; check total allocations and balanced reviewer counts.
6. Select fewer reviewers; confirm excluded accounts are rejected by the RPC.
7. Ensure a reviewer never grades their own group, and cannot open another reviewer's submissions.
8. Confirm submitted work remains group-visible but not gradeable under Participants → Assignments.
9. Confirm Admin sees per-submission allocation and reviewer counts while Programme Staff cannot see source group.
10. Confirm no previously graded score, history, or released result is altered.
11. Confirm a new participant submission stays unassigned until a later Admin allocation.
