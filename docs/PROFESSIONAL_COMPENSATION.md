# Professional compensation — draft current capabilities and acceptance boundaries

**Status:** Incremental OpenSpec implementation on draft PR #104, not accepted, merged or production-deployed. Do not use this document as proof a rate creates a debt, salary, invoice or payment. Final architectural policy: [ADR-0017](adr/0017-pre-v1-single-final-cutover-no-compatibility.md).

## Separate financial concepts

1. **Approved compensation agreement:** an owner-scoped, effective-dated rule for either a coach's expected earnings (`coach_earning`) or a customer's expected charge (`participant_charge`). Both a coach earning (e.g. owed by a school) and a participant charge require an explicitly selected, active, owned `billing_account_id` counterparty. The account is not inferred from the workplace, student, contact or school enrollment. Creating an agreement does **not** issue an invoice or grant external sharing rights.
2. **Estimated earnings/charges:** a deterministic, read-only preview over canonical `teaching_sessions` with frozen participant roster and recorded attendance. A group lesson is one instructor teaching event regardless of eight participants; pupil-based agreements may count each verified attendee separately.
3. **Financial obligation:** a distinct approved, immutable posting that snapshots exact agreement/revision, source lesson/period, payer and amount, with corrections and audit. **Not yet implemented.** Expected previews are not obligations.
4. **Invoice/statement:** a separate communication and billing document. A coach earnings projection is not an invoice. The former guardian-based invoice code is transitional WIP and must be removed/rebuilt on Billing Accounts before the final pre-v1 cutover.
5. **Actual received money and settlement:** a manual or independently verified provider payment event, with explicit payer and allocation(s) to obligations. **Not yet implemented in the new ledger.** A completed lesson is never evidence that money was received.

## Current effective-dated agreement data

`compensation_agreements` is part of the single canonical fresh-install SQL baseline, never a separate production migration. It contains tenant/workplace/optional student or group/**required counterparty** scope, role, rate model, rate in currency minor units, currency, inclusive effective dates, active/archived state, revision and replay receipt. Same-scope overlapping *active* agreements are rejected by a PostgreSQL transaction-level advisory lock and date-range check. The role distinguishes coach receivables from student charges, **not** whether the counterparty can be omitted. Both must name an owned Billing Account; no family or organization is silently made liable.

Supported expected-rate models: `hourly`, `per_session`, `per_student`, `fixed_period` (one **complete calendar month**, with no arbitrary partial-month salary). Hourly calculation uses integer minor units and verified elapsed instructor minutes, rounded once per canonical session. Per-session counts once, including group lessons; per-student counts only explicitly recorded present/late participants. Scheduled or cancelled sessions never automatically become taught; even completed sessions without a fully marked frozen roster are held for review, not counted as earned hours or eligible pupils. Fixed salary is one full-month amount even if no lessons occurred in that period; it is neither prorated nor evidence of receipt.

A student-specific agreement applies to that learner's verified attendance in their workplace; a group-specific agreement only applies to sessions actually attributed to that group. Workplace-wide agreements and more specific agreements may coexist: this is preparatory schema flexibility, **not automatic settlement precedence**. No aggregated posting may silently apply both contracts to the same charge. Missing payer, foreign workplace, currency mismatch, invalid period, stale update or overlapping same-scope agreement must fail with explicit errors.

## Website and MCP parity

Same shared owner-scoped services power:

| Browser endpoint | MCP operation | Purpose |
| --- | --- | --- |
| `GET /api/compensation-agreements` | `ccp_compensation_agreements_list` | Current and optionally archived agreements |
| `GET /api/compensation-agreements/:id` | `ccp_compensation_agreements_get` | Exact current terms and revision |
| `POST /api/compensation-agreements` | `ccp_compensation_agreements_create` | Confirmed policy setup, idempotent |
| `PATCH /api/compensation-agreements/:id` | `ccp_compensation_agreements_update` | Revision-guarded edits/archive |
| `GET /api/compensation-agreements/:id/preview` | `ccp_compensation_agreements_preview` | Read-only deterministic preview |

The coaching page's Compensation Agreements panel allows workplace/role/model/scope/payer selection and effective dates, listing, archival and previews in English, Hebrew and Russian. The returned preview explicitly states `persistedObligation:false` and `paymentRecorded:false`, and includes `unconfirmedSessionCount` so incomplete attendance never becomes silently earned income.

## Append-only financial ledger — schema foundation only (2026-11-19)

A separate source-only SQL foundation now defines `financial_obligations`, `received_payments`, and `payment_allocations` in the **one canonical fresh-install baseline**. None of these tables is an alternate invoice writer, a completed cash ledger, or a compatibility migration: **there are no website/MCP posting tools, financial approval writer, payment/Stripe import or reversal endpoints yet**. Authenticated teachers may read only tenant-owned entries through RLS; direct INSERT/UPDATE/DELETE is denied to authenticated and anonymous clients. The service role is reserved for a future separately audited and approved transactional writer. This work does **not** reconcile the old `payments` table, issue customer receipts, or authorize financial postings.

- An obligation snapshots the reviewed agreement/revision, exact owned workplace and Billing Account, canonical session or full calendar period, role, amount/currency, and a stable source digest. Tenant-composite FKs prevent an agreement, payer or lesson being silently relinked across workplaces. Unique indexes prevent two teacher earnings on one session even with different source IDs, two charges for one frozen learner/session, or two period earnings against the same agreement/month. Participant charges can reference only a frozen canonical roster member.
- `received_payments` represents a *different* real-world fact from an earned lesson: one explicitly confirmed or provider-verified actual receipt. Merely generating a monthly projection does not populate it. A payment allocation is a separate append-only application of *that same account/currency* payment to an obligation, with source/obligation row locks and remaining-balance checks. No partial payments can be automatically treated as fully settled.
- UPDATE/DELETE are forbidden even to the service role by an immutable-history trigger. Future correction and refund/reversal posting must be separately designed with explicit approval and evidence. No public receipts should be inferred by AI.
- `scripts/financial-ledger-synthetic.sql`, invoked during **both** clean baseline CI probes, temporarily inserts synthetic school/contract/obligations/receipt evidence and asserts partial settlement, source over-allocation denial, obligation over-allocation denial, wrong-payer denial, one instructor earning per session, immutable rows and full transaction rollback. The fixture is never run on production. The exact-branch GitHub Docker smoke is mandatory evidence; source-local guard tests do not execute SQL.

## Testing and remaining work

- Pure domain regression: eight-person, 90-minute instructor group at 120 ILS/hour yields **180 ILS** expected coach earning once; fixed monthly amount not multiplied by sessions; pupil rate requires explicit attendance; duplicate session/roster rejected; foreign attendance, cancelled and unmarked lessons do not become paid time.
- Authenticated browser/delegated MCP tests: create/read/list/update/retry/preview and 90-minute group readback, overlapping agreement rejection, exact scope and read-only denial, missing payer, full-month fixed amount. They are **not** accepted until GitHub CI passes the exact PR head and merged main.
- Required for final finance OpenSpec: reviewed posting and immutable agreement snapshots, cross-agreement precedence, participant-specific cancellation/makeup policy, actual payments and allocations/reversals, new invoices/credits/exports/portal finance permissions, reconciliation, tenant security, currency/timezone audit and exact E2E.
- Required for release: remove old guardian/Studio contracts, complete all designated OpenSpec scopes, pass the no-legacy final-cutover audit and obtain separately verified real-data export/restore and target-specific operator approval before one final direct migration or clean rebuild/reimport. Historical incremental compatibility migrations remain forbidden.
