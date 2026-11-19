# Implementation progress — professional compensation (not accepted)

**2026-11-18 draft implementation:** Commit `6b24def` on PR #104 introduces the first verifiable agreement and read-only calculation layer; no actual financial-obligation posting, invoice/payment replacement, release or live database change. Source of truth remains the proposal, design, full unchecked tasks and `docs/PROFESSIONAL_COMPENSATION.md`.

Implemented in the source candidate:

- Effective-dated, tenant-scoped `compensation_agreements` in current fresh-install baseline, with role/payer/currency/revision and anti-overlap trigger.
- Pure deterministic per-hour, per-session, verified per-student and whole-month fixed-rate calculation. The eight-student/90-minute/120 ILS-per-hour example counts one 180 ILS earning, not eight.
- Authenticated website GET/POST/PATCH/preview, five individually named MCP operations over shared services, strict parity inventory, localized English/Hebrew/Russian UI, new negative test cases and idempotent update/create paths.
- Archive instead of permanent deletion, no inferred payers or recorded payments from lesson completion, no financial side effects in a preview.

**Unfinished/blocked:** GitHub exact-head CI/Compose/backup/E2E, obligation posting and immutable snapshots, payments and partial allocations, settlement and reversal, cancellation/makeup policy, old guardian invoice model retirement, finance portal and export cutover, real-tenant negative/restore checks, final merged-main evidence. The full OpenSpec tasks remain unchecked until their complete independently verified acceptance. Do not archive this change.

**2026-11-19 tightening (still draft):** Both agreement roles now require an exact owned active Billing Account counterparty; school income cannot be inferred from an enrollment or workplace name. Completed but unmarked/partially marked (or no-show-only) lessons are excluded from expected instructor compensation with an explicit unconfirmed-count disclosure. The note email worker fails closed instead of broadcasting to multiple authorized contacts in one non-idempotent delivery intent. These do not create obligations or cash; source tests and exact-head CI/E2E still must pass.

**2026-11-19 ledger schema foundation (WIP):** A separate three-table, read-only-to-teachers/append-only future obligation/payment/allocation model is now present in the canonical fresh-install baseline with tenant-composite workplace/agreement/payer/session/participant FKs, unique one instructor earning per session and one participant charge per session, currency and counterparty consistency and underpayment/over-allocation locking. A new disposable SQL transaction tests these invariants, full rollback, and absence of teacher direct posting permissions on two fresh installs. **No posting, cash-import, approved-obligation, refund/reversal, hosted provider integration, UI or new MCP posting operation exists.** Its CI executable proof is pending; old guardian finance remains a release blocker. Do not mark financial acceptance or release.
