> **Execution reconciliation (2026-11-19):** Follow [the reconciled execution sequence](../../../docs/OPENSPEC_RECONCILED_EXECUTION_SEQUENCE_2026-11-19.md). The new [temporal enrollment and credit-safe lifecycle change](../2026-11-19-temporal-enrollment-credit-safe-lifecycle/proposal.md) must be included in the canonical schema **before final freeze acceptance**. Earlier "schema freeze first" wording means governance and inventory first, not final approval before this amendment. No per-feature production migration; this proposal's feature implementation follows its stage dependencies.

# Change: workplace compensation agreements, distinct obligations and received payments

> **Schema-first execution gate (2026-11-19):** [`2026-11-19-freeze-unified-saas-schema-and-regressions`](../2026-11-19-freeze-unified-saas-schema-and-regressions/proposal.md) is the **mandatory first implementation change**. All schema DDL, tenant/RLS/FK/index work, generated DB types and schema-induced regressions belong to that change; this proposal must wait for its reviewed schema freeze and passing exact-head gates before implementing its remaining business functionality. Its existing schema statements describe requirements for the foundation, **not** permission to add per-feature DDL later. Operator-only SaaS and future shard-compatible UUID/RLS design follow [ADR-0018](../../docs/adr/0018-operator-only-saas-and-tenant-scaling.md); no customer self-hosting or live cutover is authorized.


> **ADR-0017 final-cutover override (2026-11-18):** No backward compatibility or legacy dual-writes before v1. The final deliverable uses the clean canonical baseline and current website/MCP contracts. All planned features deploy with **one final** live migration **or** verified clean rebuild/reimport at the operator's choice; no per-feature production migration. Existing data handling is a deliberate one-time import/mapping decision, not an obligation to retain obsolete Family/Studio/guardian APIs or old portal tokens. Security, tenant isolation and explicit new grants remain required.


**Status:** Proposed implementation; agreed design in ADR-0016. No production financial writes authorized.
**Priority:** P1 after contact/account and workplace foundations.
**Depends on:** 2026-11-18-replace-families-with-contacts; 2026-11-18-add-workplace-context-and-retire-studio; baseline-first transition contract.

## Why
The inherited invoice engine derives one charge per canonical student participant and sends it to students.guardian_id using teacher-global studio rates. It can represent family-paid private lessons but not a school paying the teacher a flat hourly amount for a group as ONE paid teaching occurrence, a federation sponsoring a specific private lesson, or a fixed monthly employer payment. Workplace.policy JSON is not yet a typed, applied compensation calculator. Payment received must not be fabricated from recorded attendance.

## Outcome
Create explicit effective-dated financial agreements tied to an owned workplace and counterparty billing account; derive immutable expected coach earnings or customer charges from canonical lessons, independently track payment obligations and cash received, with correct no-double-count accounting and website/MCP parity.

## Scope
- Typed agreement types: hourly, per-session, per-eligible-student and fixed period; simple hybrid may be designed but not necessary as first editable model.
- Agreement attaches to workplace, optional group/schedule, explicit lesson override and payer billing account; private student payer default can differ from school organization agreement.
- Deterministic precedence documented for explicit lesson/participant sponsorship, group/schedule override, workplace agreement, Personal Teaching student billing account; missing/ambiguous account blocks financial posting without losing the lesson.
- Immutable earnings/charge rows keyed to one canonical teaching occurrence or participant and agreement/rate version, effective date, currency, amount and billable status; record partial/complete payment separately; reconcile one payment against multiple outstanding obligations where appropriate.
- School group fee is one coach earning for one group session even when eight students attend; private lesson fee is charged once to selected payer. No auto-generated payment merely because lesson was completed.
- Studio billing migration to contact/billing account and typed workplace agreements with careful preservation of already issued/paid invoices and credits.
- Tenant-owner services, UI preview/approve/record, reports and ccp_* MCP parity; source evidence, cancellation and makeup policy correctness.

## Explicit deferrals
No two payers splitting one new lesson obligation, household debt splitting, real accounting integration, tax/VAT invoice issuance, payroll withholding, bank reconciliation, automated official receipts or tax statements. A sponsor paying an existing invoice may be a recorded third-party payment without reissuing debts. No automatic Stripe charging beyond existing confirmed Checkout flows.

## Acceptance
One completed 90-minute eight-person school group at 120 ILS/hour produces one expected teacher earning of 180 ILS, not eight duplicates, and no received payment until entered. A sponsored private lesson charges its explicitly assigned payer, not the student's mother or school by default. Prior settled invoices are preserved.

> **Cross-change schema coordination (2026-11-19):** Existing candidate: agreements, obligations, payments and allocation ledger; acceptance pending. No final financial reconciliation or live cutover authorized. See [`../SCHEMA_ROADMAP.md`](../SCHEMA_ROADMAP.md) for shared dependencies and ADR-0017 single-final-cutover rules. Passing the Contacts/Finance PR does not automatically accept this proposal.
