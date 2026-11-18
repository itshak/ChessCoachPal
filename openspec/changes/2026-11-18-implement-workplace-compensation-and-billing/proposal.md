# Change: workplace compensation agreements, distinct obligations and received payments

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
