# Assignments, Grading and Results

## Assignment model

Core tables:

- `assignments`
- `assignment_questions`
- `assignment_submissions`
- `assignment_answers`
- `assignment_documents`
- `assignment_upload_sessions`
- `assignment_grade_history`

## Assignment configuration

Assignments support:

- Title.
- Description.
- Instructions.
- Deadline.
- Maximum score.
- Pass mark.
- Draft / Published / Closed status.
- Public slug.
- Result release state.

Question types include:

- Short text.
- Long text.
- Number.
- Single choice.
- Multiple choice.
- File.
- URL.
- Read-only instruction / reading-passage blocks (stored as optional long-text questions with `config.display_only = true`). These render inline above subsequent questions, never collect an answer, and are skipped in question numbering.

The question builder lets staff add a heading and multi-paragraph passage. General assignment instructions also remain visible on the participant's answer screen, not only on the welcome screen. At least one answerable question is required before publishing. No schema migration is required for the display-only block because it uses the existing question type and JSON configuration.

## Participant access

The public assignment flow requires the participant identity for the programme and validates the assignment status/deadline.

A participant may submit an assignment once.

## Multiple file uploads

File questions support **up to 10 files per file question**.

Supported file families:

- JPG/JPEG.
- PNG.
- WebP.
- PDF.
- DOC.
- DOCX.

Maximum size:

- 15 MB per file.

The backend verifies:

- Upload session.
- Assignment/question ownership.
- Path structure.
- MIME type.
- File size.
- Duplicate paths.
- Per-question file count.

Each uploaded file receives its own `assignment_documents` row.

## Reviewing participant work

The authenticated assignment view supports:

- Submitted participant roster.
- Pagination.
- Participant identity.
- Assignee context where available.
- Submission modal.
- Answers.
- All uploaded attachments.
- Score.
- Feedback.
- Grading.

## Grading

Graded submissions store:

- Score.
- Feedback.
- Grader.
- Graded timestamp.

Grade changes are recorded in `assignment_grade_history`.

## Result release

When results are released, the participant result portal shows:

- Assignment score.
- Maximum score.
- Percentage.
- Pass mark.
- Passed/below-pass state.
- Feedback.
- Submitted/graded times.
- Participant's permitted leaderboard scope.

## Recovery records

The UI can display historical/recovery information for specially reconstructed assignments and can list surviving storage paths when available.

This is not a backup system.

## Important deletion behaviour

Assignment deletion is currently a **hard delete** through protected Owner/Admin logic.

Related answers/documents/submissions can be removed as part of deletion/cascade behaviour.

Do **not** assume a deleted assignment can be reconstructed. Surviving Storage files or request logs may provide partial evidence, but exact submission/answer recovery is not guaranteed.

A future Archive/Trash/soft-delete workflow is strongly recommended. See [ROADMAP_AND_LIMITATIONS.md](./ROADMAP_AND_LIMITATIONS.md).

## Result identity

Public result access uses Participant ID + registered application email. Result/leaderboard exposure is further constrained by release and group-scoping logic.
