# Tasks

- [ ] Inventory all enrollment, lifecycle, scheduling, group, invoice, credit-package, redemption, return/refund and MCP/web consumers.
- [ ] Reconcile proposal with unified schema freeze, Contacts/payer and workplace compensation; update ADR, canonical SQL and manifest checksum.
- [ ] Add temporal membership fields, cancellation audit, owner-safe FKs, indexes and non-overlap exclusion; preserve unknown legacy dates.
- [ ] Design credit adjustment/refund/transfer ledger based on existing redemption return and payment semantics; avoid duplicate financial sources.
- [ ] Implement shared enrollment preview/commit and archive/reactivation preview/commit, transactionally handling future sessions/recurrence.
- [ ] Implement default credit hold, eligibility checks and funded-vs-invoiced reporting; refund/transfer/forfeit only as audited separate workflows.
- [ ] Implement MCP typed clarification, exact-ID selection and website parity for all relevant paths.
- [ ] Add unit, SQL/RLS, replay/concurrency, date-boundary, billing and authenticated E2E tests.
- [ ] Run fresh-install CI, staging restore rehearsal and independent inventory; require explicit approval for live cutover.

## Candidate evidence (2026-11-19; NOT acceptance)

- Draft PR #108 stages canonical SQL columns, owner-safe relationships, period exclusion, credit event table and TypeScript types. A synthetic temporal-period database test and strict schema guard were added, but exact-head E2E/restore and application consumers must pass before the unchecked implementation items can be marked complete.
- PR #107 import safeguard has green CI, E2E, security, Compose and backup/restore at `da9958156390cfc3115c45c34ef3dedd3e4da753`. This does not establish that new temporal date semantics are implemented by its import domain service.
- Archive **deferred** pending funded credit adjustments, future obligation handling, the archive/reactivation and workplace end/re-enroll workflows, full website/MCP parity, live data inventory and approved operator transition. See `docs/SCHEMA_CANDIDATE_ACCEPTANCE_2026-11-19.md`.

## 2026-11-20 source implementation update (not release acceptance)

The unchecked boxes above remain the archive criteria. PR #108 is no longer schema-only: the source branch now contains these reviewed candidates, each still subject to exact-head acceptance:

- Dated workplace membership start/end/re-enroll, archive-time cancellation, immutable provenance, period exclusion, tenant-safe keys and a locked direct-enrollment guard that refuses archived students. No historical student ID, completed lesson, materials or frozen roster is deleted by closing a period.
- A teacher-reviewed membership end preview/commit with receipt, revision, reason and explicit active group/slot/future-session blockers, exposed in the website and MCP.
- Student archive/reactivation preview/commit with tenant-bound history, explicit selection of historically verified workplaces, effective-dated new periods, hosted quota trigger and teacher-confirmed no-cash credit hold.
- A separately audited credit adjustment ledger and preview/commit: grant, forfeit, expiry extension, payer-compatible package transfer and entitlement reduction backed by an already recorded external payment refund. Paired transfers and unique refund provenance are transactionally checked, with no money moving inside the entitlement writer.
- Canonical credit balance/expiry readers, allocation and student UI updated to include adjustment deltas; website/MCP parity registry extended to 44 gateway actions and dedicated authenticated lifecycle/finance scenarios.
- CI typecheck and strict legacy-schema audit fixes. The legacy audit now ignores comments but still rejects executable old SQL references.

**Remaining before checking every box or archiving:** complete exact-head CI/E2E/security/Compose/restore after the final source changes; tenant/concurrent negative tests and old expiry/edit route reconciliation; complete field-by-field cross-proposal schema inventory and compensation/payer ownership review; verify a forward-only transition against actual populated-data inventories, off-host restored copy and operator sign-off. PRs #104 and #107 are still unmerged draft prerequisites. No production reset/cutover has been executed or authorized.

A green older commit, structural parity counts, synthetic payment evidence or successful second-empty-instance restore cannot substitute for verified real-data migration and exact-head E2E. See `docs/SCHEMA_CANDIDATE_ACCEPTANCE_2026-11-19.md`.

## 2026-11-20 source merge update (does not satisfy open acceptance boxes)

PR #108 was merged to main at `895cb193` after its exact head `7e4c43f` passed CI, E2E (313 pass, 5 skip plus 3 additional pass), security, Compose and synthetic backup/restore. Prerequisites #104 and #107 were merged first. The earlier draft/unmerged status above is historical. Schema ownership, financial/portal populated-data reconciliation, an independently verified off-host restoration and explicit operator cutover approval remain open; do not archive or deploy based on synthetic checks alone. See `docs/SCHEMA_CANDIDATE_ACCEPTANCE_2026-11-19.md` and the active OpenSpec tracker.

## Archived learner lesson-intent recovery (2026-11-21; new unchecked acceptance work)

- [ ] Inventory all single-student session, ad-hoc multi-student, completed group, date-inference, chapter-linked and direct-ID capture paths for archived status; verify source and actual authenticated runtime behavior before claiming a bug is fixed.
- [ ] Implement owner-scoped exact-identity resolution for lesson intent across active and archived records, bounded pagination, stable candidate IDs, alias collisions and structured `ARCHIVED_STUDENT_CONFIRMATION_REQUIRED`; preserve ordinary active-only roster defaults.
- [ ] Implement shared no-write reactivation+lesson preview with exact workplace/date, previous verified membership provenance, quota/credit information, expected revisions, digest and explicit cancel/choose-another affordances.
- [ ] Implement a transactionally atomic, deduplicated lesson+reactivation commit for supported private and group cases; rollback all student, enrollment and session changes on any failure. Do not chain two independent MCP writes as a claim of atomic success.
- [ ] Handle missing or new-workplace selections, expired/held credits, historical lesson corrections and backfills without silent membership, payer, group, attendance or financial changes.
- [ ] Add unit, SQL/RLS/concurrency and authenticated website/MCP parity tests: archived-only name; same alias across active/archived; multiple archived matches; foreign UUID; decline/no writes; one and multiple quota restores; failed lesson rollback; same-key replay; changed/stale preview; group instructor time once; historical correction without reactivation; localization; no credit or permission side effects.
- [ ] Record exact-head checks and approved deployed-version evidence separately. Do not mark implemented or archive this proposal from a design-only PR.
