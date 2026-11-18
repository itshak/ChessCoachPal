# Professional compensation — draft current capabilities and acceptance boundaries

**Status:** Incremental OpenSpec implementation on draft PR #104, not accepted, merged or production-deployed. Do not use this document as proof a rate creates a debt, salary, invoice or payment. Final architectural policy: [ADR-0017](adr/0017-pre-v1-single-final-cutover-no-compatibility.md).

## Separate financial concepts

1. **Approved compensation agreement:** an owner-scoped, effective-dated rule for either a coach's expected earnings (`coach_earning`) or a customer's expected charge (`participant_charge`). A customer charge requires an explicit, active `billing_account_id`. Creating an agreement does **not** issue an invoice or grant external sharing rights.
2. **Estimated earnings/charges:** a deterministic, read-only preview over canonical `teaching_sessions` with frozen participant roster and recorded attendance. A group lesson is one instructor teaching event regardless of eight participants; pupil-based agreements may count each verified attendee separately.
3. **Financial obligation:** a distinct approved, immutable posting that snapshots exact agreement/revision, source lesson/period, payer and amount, with corrections and audit. **Not yet implemented.** Expected previews are not obligations.
4. **Invoice/statement:** a separate communication and billing document. A coach earnings projection is not an invoice. The former guardian-based invoice code is transitional WIP and must be removed/rebuilt on Billing Accounts before the final pre-v1 cutover.
5. **Actual received money and settlement:** a manual or independently verified provider payment event, with explicit payer and allocation(s) to obligations. **Not yet implemented in the new ledger.** A completed lesson is never evidence that money was received.

## Current effective-dated agreement data

`compensation_agreements` is part of the single canonical fresh-install SQL baseline, never a separate production migration. It contains tenant/workplace/optional student or group/optional payer scope, role, rate model, rate in currency minor units, currency, inclusive effective dates, active/archived state, revision and replay receipt. Same-scope overlapping *active* agreements are rejected by a PostgreSQL transaction-level advisory lock and date-range check. Agreement role controls payer requirements: participant charges require a named billing account; coach earnings do not.

Supported expected-rate models: `hourly`, `per_session`, `per_student`, `fixed_period` (one **complete calendar month**, with no arbitrary partial-month salary). Hourly calculation uses integer minor units and verified elapsed instructor minutes, rounded once per canonical session. Per-session counts once, including group lessons; per-student counts only explicitly recorded present/late participants. Scheduled or cancelled sessions never automatically become taught. Fixed salary is one full-month amount even if no lessons occurred in that period; it is neither prorated nor evidence of receipt.

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

The coaching page's Compensation Agreements panel allows workplace/role/model/scope/payer selection and effective dates, listing, archival and previews in English, Hebrew and Russian. The returned preview explicitly states `persistedObligation:false` and `paymentRecorded:false`.

## Testing and remaining work

- Pure domain regression: eight-person, 90-minute instructor group at 120 ILS/hour yields **180 ILS** expected coach earning once; fixed monthly amount not multiplied by sessions; pupil rate requires explicit attendance; duplicate session/roster rejected; foreign attendance, cancelled and unmarked lessons do not become paid time.
- Authenticated browser/delegated MCP tests: create/read/list/update/retry/preview and 90-minute group readback, overlapping agreement rejection, exact scope and read-only denial, missing payer, full-month fixed amount. They are **not** accepted until GitHub CI passes the exact PR head and merged main.
- Required for final finance OpenSpec: reviewed posting and immutable agreement snapshots, cross-agreement precedence, participant-specific cancellation/makeup policy, actual payments and allocations/reversals, new invoices/credits/exports/portal finance permissions, reconciliation, tenant security, currency/timezone audit and exact E2E.
- Required for release: remove old guardian/Studio contracts, complete all designated OpenSpec scopes, pass the no-legacy final-cutover audit and obtain separately verified real-data export/restore and target-specific operator approval before one final direct migration or clean rebuild/reimport. Historical incremental compatibility migrations remain forbidden.
