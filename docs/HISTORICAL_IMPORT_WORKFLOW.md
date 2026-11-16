# Historical student and attendance import

**Status:** In progress on feature branch. Not released; do not rely on this guide for production import yet.

A coach's spreadsheet can contain students from multiple academic years and workplaces. Students who attended the selected school year may be active; historical-only students may be archived. An explicit school-year start date and workplace reconciliation are required before commit.

## Current branch implementation
- Full student creation accepts `archived: true` and creates the row archived in the same SQL transaction. The default remains active.
- Spreadsheet student/family import accepts an optional mapped `archived` column. Recognized archived values: `true`, `yes`, `1`, `archived`, `inactive`, `former`; active: `false`, `no`, `0`, `active`, `current`. Empty defaults active. Unknown nonempty values are skipped with an issue.
- The spreadsheet importer remains capped at 500 rows; historical attendance is **not yet imported** by this workflow.
- Existing students are skipped by exact normalized name; this is not yet robust identity reconciliation. Preview carefully.

## Not yet available
Safe bulk archive/reactivate, historical attendance stage, multi-workplace activity classification, secure staged large-file upload, and full acceptance tests. Do not use a per-student create/archive loop as a substitute for an unreviewed historical import.

## Intended flow
1. Parse source and map columns, determine school-year boundaries and workplaces.
2. Resolve identities and show ambiguous names and active/archive proposals.
3. Confirm and commit students; independently verify active/archived counts and IDs.
4. Preview dated attendance and aggregate-only evidence separately; never invent missing dates.
5. Confirm attendance stage, commit with idempotency receipts and reconcile reports.

Archived students remain queryable and historical teaching evidence must remain preserved. A student active at any workplace must not be globally archived based solely on absence from another workplace.
