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
