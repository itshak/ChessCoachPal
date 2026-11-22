> **2026-11-21 schema-ownership handoff:** All anticipated physical persistence in this design is owned by the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** under ADR-0019. This design remains a downstream feature contract. Superseded old freeze references below are historical; no independently staged feature DDL or live database change is authorized.

# Design: separate coaching earnings, receivables, invoices and money received

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


## Current implementation boundaries
lib/billing.ts derives canonical participant charges via slot -> student -> global studio rate. lib/server/canonical-billing-source.ts obtains session, frozen roster, attendance, student.guardian_id and studio policy; lib/server/teacher-billing-operations.ts groups drafts by guardian. Existing teaching_sessions/workplace_id and immutable attendance are canonical. Do not duplicate the lesson source or use current group enrollment for historic billing.

## Financial entities
- compensation_agreements(id, teacher_id, workplace_id, billing_account_id, agreement_type, rate_cents, currency, effective_from/to, status, cancellation_policy_id/defaults, optional group_id/slot_id; revision and audit). Avoid agreement overlap/ambiguous fallback for an effective scope.
- financial_obligations(id, teacher_id, session_id nullable, student_id nullable, period_start/end, obligation_kind=coach_earning|participant_charge|period_compensation, agreement_revision_snapshot, billing_account_id, amount_cents, currency, invoice reference nullable, status, source_hash, immutable ledger metadata). Coach earnings/payables and customer charges must not be aggregated together as if independent revenue for one underlying lesson.
- payments and payment_allocations: actual inbound money, counterparty/currency/method/date/source with allocation to one or more obligations **of the same debtor**. This supports normal partial payments and paying several lessons with one transfer, NOT split-paying a single charge among several debtors.
- payout/customer payment distinction is explicit. Do not imply a monthly salary is an issued invoice or that a received payment equals a completed lesson.

## Resolution hierarchy
1. Explicit session-specific contract or approved sponsor/payer override (where person-specific sponsorship exists, only that participant charge is overridden).
2. Group or recurring schedule contract when valid for date/workplace.
3. Workplace default compensation agreement.
4. Personal Teaching per-student billing-account/rate default, if configured.
Unknown -> unresolved/needs-review, never guess a payer, no free-form agent hallucination. All calculations use local session instant/timezone and rate effective on session date; snapshot agreement and rates at financial finalization so later edits do not rewrite issued invoices/paid credits.

## Semantics
An instructor's 90-minute group session counts one 90-minute teaching unit regardless of headcount. Hourly agreement at 12000 cents/hour yields 18000 cents for 90 eligible minutes. Per-student fees may create independent participant obligations where contract explicitly specifies. Salaried fixed-period agreements accrue by period and show lessons/hours as informational only; no session multiplier. No duplicate count if a group member pays separately under an approved different agreement. Cancellations/holidays, credit redemption, makeup and partial attendance follow declared contract policy and existing canonical evidence. Explicitly specify expected, invoiced, paid, overdue and manually reconciled statuses.

## Migration and parity
Replace old guardian invoice debtor relationships with billing_accounts from contacts change; preserve invoice IDs, paid totals, Stripe checkout references, immutable receipts, credit redemptions and previous payments. New agreement/obligation tables live in canonical baseline; a one-time live transition maps current known rates only where verified, defaults unknown agreement for coach review instead of manufacturing obligations. All previews are read-only, approved posts idempotent with amount/source digests; ccp_* tools and website call same money-safe services. Audit sensitive external payment provider actions and retain browser-only credential flows.
