# Native financial posting and reversal — draft integration on PR #104

**Status (2026-11-19): Implemented source candidate; NOT production-ready, archived or migrated.** The final pre-v1 audit still finds 18 detected legacy-cutover violations. PR #104 remains blocked until the whole customer finance/portal cutover is accepted and full exact-head CI passes. No real payment provider was called, no customer money was moved, no existing database was migrated.

## Contract and protections

The new canonical baseline includes tenant-owned compensation agreements, immutable financial_obligations, received_payments, payment_allocations and financial_reversals. The first four concepts have distinct meanings. An expected compensation preview is **not** an obligation. An approved obligation is **not** received money. A recorded manual receipt is **not** a tax receipt or completed external payment provider charge. An allocation indicates how confirmed received money settles a payer-matched obligation; partial amounts remain open.

The new financial_reversals table records three separate audit events: undo all or part of an allocation, record a refund that the teacher has **already verified happened outside the app**, or reduce the unsettled amount of an approved obligation. Each reversal includes a bounded mandatory reason, tenant-scoped target, immutable timestamp and idempotency key. The application **does not send refunds or initiate bank/card transactions**. Existing obligations, payments, allocations and reversals remain immutable; a correction adds another record instead of rewriting history. Refunds and obligation corrections are capped by currently unallocated and unsettled balances respectively. Concurrent payment/obligation locks prevent over-allocation; reversal-aware net balances prevent further allocation of already-refunded funds.

Explicit signed-in teacher actions are required for posting. Public and anonymous roles have no write access to financial tables. Authenticated teachers have read-only tenant RLS; narrowly named SECURITY DEFINER RPCs re-resolve the tenant using auth.uid() and enforce owner, counterparty, currency, caps and idempotency. A delegated MCP read-only connection cannot access write operations. The canonical teaching occurrence and complete marked roster are verified at approval time, with the exact agreement revision, rate, source date and attendance digest snapshotted. One group occurrence yields **one coach earning**, not one earning per pupil. A participant charge requires its own verified student attendance and independently active effective-date Billing Account assignment.

These rules protect against fabricated money but **do not** certify regulatory accounting, payroll, invoicing, automatic bank reconciliation or Stripe settlement. Correcting a previously settled obligation requires unwinding the matching allocations first. Additional adjustment/invoice-document and provider integration work remains a release blocker.

## Browser and MCP parity

Both interfaces call the same server services and SQL RPCs, with explicit user confirmation and idempotency:

| Website endpoint | MCP operation | Meaning |
| --- | --- | --- |
| GET /api/finance-ledger | ccp_finance_ledger_list | Read up to 100 latest records per category, tenant-scoped |
| POST /api/finance-ledger/obligations | ccp_finance_obligation_approve | Approve a rate/revision/amount/source-specific immutable obligation |
| POST /api/finance-ledger/payments | ccp_finance_payment_record | Record independently confirmed offline money received |
| POST /api/finance-ledger/allocations | ccp_finance_allocation_record | Allocate part/all of a recorded received payment |
| POST /api/finance-ledger/reversals | ccp_finance_reversal_record | Record exact approval of reversal/refund/correction |

The Billing page contains a distinct native finance panel. It uses exact IDs and explicit approval, and clearly states that an offline refund must already have occurred. English, Hebrew and Russian translations are included. The legacy invoice UI is **not** yet replaced: its guardian model remains in source and must be rebuilt against Billing Accounts before the final cutover. This panel does not mean that old invoice status has been reconciled.

## Tested evidence and outstanding acceptance

- Unit/source: TypeScript, i18n catalogs, strict MCP route inventory and canonical schema checksum checks.
- SQL: scripts/verify-schema-transition-convergence.sh runs two fully disposable fresh installations, data/RLS/tenant invariants, scripts/financial-ledger-synthetic.sql and scripts/finance-native-rpc-synthetic.sql. The second fixture exercises authenticated owner-bound RPC approval/payment/allocation/reversal, replay, conflicting idempotency, direct-table write denial, foreign-tenant denial and rollback.
- Authenticated browser/MCP acceptance candidate: e2e/parity-finance-ledger.spec.ts exercises an eight-student 90-minute lesson (one 180 ILS coach earning), cross-transport replays, a real-world-manual receipt, partial allocation, reversal, offline-refund recording, obligation reduction, over-refund rejection and read-only MCP discovery. It must pass on **the exact PR head** and merged main before finance acceptance.

**Still required for release:** settle source-to-final legacy invoice and guardian replacement (including credits, events, exports and portal accounting); resolve all 18 currently detected final-cutover violations without suppressing the audit; agree precedence/cancellation/makeup and rate correction rules; add real provider verification ingestion where approved; test refund/settlement/tenant races and restore; prove full browser/MCP E2E and CI/Compose on the exact head; then perform the separately authorized one-time real-data cutover/reimport. No change here approves resetting or migrating a live database.

**Cutover gate hardening (2026-11-19):** The final pre-v1 audit now also rejects four surviving guardian/Family/Studio SQL RPC routines and the inherited broad `portal_token` storage. The count increased from 16 to 18 because the coverage improved, **not** because the implementation regressed. Five dedicated audit unit cases passed at `d4a77a0`; 18 real release blockers remain. No acceptance or live migration was performed.
