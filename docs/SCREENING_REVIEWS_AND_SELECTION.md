# Screening, Reviews and Selection

## Current decision model

The current flow is intentionally simple:

```text
Submitted application
→ eligibility context
→ human review
→ optional quick screening profile
→ approve or reject
```

There is no active shortlist stage.

## Reviewer scoring

The earlier reviewer-score-heavy product direction was removed from the visible screening and analytics experience.

Legacy score-related database structures may still exist for historical/schema compatibility, but they are not the primary current decision model.

## Review assignment

Review infrastructure supports:

- Assignment of work to staff.
- Assigned work queues.
- Review notes/audit data.
- Final decision actions.
- Organisation/programme scoping.

Owner/Admin have an **Assigned to me** view for work specifically assigned to the current user.

Programme Staff only see work permitted by assignment-aware access rules.

## Quick screening

The fast screening profile is deliberately narrow. The current operational output focuses on:

1. Age.
2. Residential address.
3. Trade.

AI output does not make the final programme decision.

## Final decisions

Current visible outcomes:

- Approved.
- Rejected.

Approval creates/synchronises a participant and retains the applicant's public participant ID.

## Withdrawn participants

Withdrawing an enrolled participant removes that participant from the active participant view and returns the person to the review/screening lifecycle as rejected according to the current migration logic.

## Pagination and selection

Operational lists use reusable pagination with a 50-row default and larger sizes where relevant.

Selection is intentionally page-aware to avoid accidentally acting on very large unseen populations.
