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
