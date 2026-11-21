> **2026-11-21 schema-ownership handoff:** All anticipated physical persistence in this design is owned by the **single [consolidated schema P0](../2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** under ADR-0019. This design remains a downstream feature contract. Superseded old freeze references below are historical; no independently staged feature DDL or live database change is authorized.

# Design: professional tutor workflow integration

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


## Principles
- Canonical lesson occurrence is distinct from each participant's attendance and from financial obligation/teacher earning.
- The lesson is a teaching record; billing is a derived, versioned consequence of an explicit policy and confirmation.
- A contact can be a payer, scheduler, or report recipient independently; none of these roles implies unrestricted student data access.
- Agent-first is not AI-guess-first: uncertain facts require teacher confirmation.
- Reuse the existing coach briefing, lesson close, recurrence, credits, contacts, workplace context and compensation services wherever feasible.

## Domain boundaries
1. **Schedule occurrence**: stable ID, owning teacher/workplace, timezone, series ID, original/current start and end, exception reason, reschedule/makeup link, audit trail.
2. **Lesson execution**: occurrence ID, confirmation/close status, shared teaching content, per-participant attendance and private notes, material evidence with provenance, optional next actions.
3. **Report release**: explicit approved snapshot, audience/contact grants, preview, published timestamp, revocation/correction; private notes excluded by construction.
4. **Finance**: reference existing immutable expected earnings and debtor obligations; record receipts and their allocations separately with sum-of-allocations invariant and reversal trail.
5. **Review queue**: derived read model from unresolved records, not an independent source of truth. Idempotent dismissal only where there is a legitimate resolution.

## Transition rules to settle in implementation design
- Specify whether cancelled/no-show lessons can be billable per workplace agreement; do not assume globally.
- Closing is an explicit authenticated teacher action, with preview and a version/precondition check.
- Reopen/correction preserves audit history and triggers a controlled recalculation/reversal rather than silent financial mutation.
- Recurrence edits explicitly select this occurrence / future occurrences / entire series, and completed history is protected.
- DST ambiguous/nonexistent local times require preview or explicit selection.
- A summary is not sent or exposed by creating a private lesson note; publication is separately approved.
- Financial allocation must not exceed the receipt or target outstanding obligation; support multi-obligation allocations with transactional rollback on failure.
- Cross-workplace access and mixed personal/school billing must use server-side authorization.

## API and parity
Each new business command should have a shared service contract, typed input/output, tenant validation, idempotency key where applicable, website route/action, ccp_* MCP tool, registry entry, and tests covering authorization, ambiguity, retries and provider/AI outages. Avoid making the UI-specific Today view the sole route to core operations.

## Research provenance / limits
Product inspiration: TutorCruncher lesson statuses, recurring lesson exceptions, reports and split-payment documentation; Teachworks flexible pricing; Jane day-end procedures and packages. Competitor availability is not a requirement to replicate all their functionality. In particular, TutorCruncher 'Split Payments' concerns tutor/company payout splitting, not evidence of co-parent debtor splitting. Confirm actual local coaching demand before adding that separate capability.

## Open questions
- Exact permissible transitions for completed/cancelled/no-show sessions and when billability is fixed.
- Which package policies allow expiration, rollover, partial session consumption, and refunds.
- Whether publication to parent/student portal is needed in the first phase or only a preview/approval-ready artifact.
- Retention, consent, and delivery policy for automated reminders (deferred).
