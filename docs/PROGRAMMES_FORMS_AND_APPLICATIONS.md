# Programmes, Forms and Public Applications

## Programme lifecycle

Programmes support:

- Name and description.
- Deadline.
- Target participant count.
- Participant ID prefix.
- Public application slug.
- Applicant instructions.
- Confirmation message.
- Submission limit.
- Status lifecycle: Draft / Published / Screening / Closed / Completed.

Programme creation/management is an Owner/Admin workflow.

## Form builder

Supported question types include:

- Short text.
- Long text.
- Email.
- Phone.
- Number.
- Date.
- Dropdown.
- Single choice.
- Multiple choice.
- Yes/No.
- Nigerian State.
- Nigerian LGA.
- File.
- Image.
- Rating.

Builder features include:

- Required fields.
- Descriptions and placeholders.
- Choice options.
- Conditional visibility.
- Reordering.
- Preview.
- Publishing.
- Version cloning.

## Form versioning

Published form versions are immutable.

Typical flow:

```text
Published v1
→ edit requested
→ clone to Draft v2
→ edit
→ publish v2
```

Question references used by conditional rules and eligibility logic are remapped when a published version is cloned.

Legacy malformed conditional-rule values are normalised on read/clone paths so old imported data does not crash form publishing.

## Google Form import

ApplyFlow includes CSV-based Google Form import infrastructure:

- Import batches.
- Import rows.
- Question mapping/creation.
- Applicant/submission creation.
- Timestamp handling.
- Import into the normal ApplyFlow data model.

Imported structures can be cleaned up afterwards in the normal form builder.

## Public application flow

The public flow validates:

- Programme availability/status.
- Start/deadline rules.
- Published form version.
- Required visible questions.
- File/image constraints.
- Submission limits.

The authoritative submission-limit check is server-side.

## Public uploads

Supported browser-side application/assignment file families currently include:

- PNG.
- JPEG.
- WebP.
- PDF.
- DOC.
- DOCX.

The assignment flow enforces a 15 MB per-file limit. Backend/storage validation remains authoritative.

## Participant ID generation

Successful participant/application flows use the programme prefix and year to generate a stable public identifier.

The public identifier is retained when an approved applicant becomes a participant.
