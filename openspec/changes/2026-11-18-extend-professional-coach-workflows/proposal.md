> **2026-11-21 schema-ownership handoff:** All remaining planned tables, columns, constraints, RLS and persisted state from this proposal belong to the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** (ADR-0019). This proposal remains responsible for feature services, UX, MCP parity and independent acceptance. Its earlier DDL instructions are requirements to P0, not authority for an independent migration. No live cutover is authorized.

> **Execution reconciliation (2026-11-19):** Follow [the reconciled execution sequence](../../../docs/OPENSPEC_RECONCILED_EXECUTION_SEQUENCE_2026-11-19.md). The new [temporal enrollment and credit-safe lifecycle change](../2026-11-19-temporal-enrollment-credit-safe-lifecycle/proposal.md) must be included in the canonical schema **before final freeze acceptance**. Earlier "schema freeze first" wording means governance and inventory first, not final approval before this amendment. No per-feature production migration; this proposal's feature implementation follows its stage dependencies.

# Change: complete professional coaching workflows across lessons, schedules, reports and finance

> **Schema-first execution gate (2026-11-19):** [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md) is the **mandatory first implementation change**. All schema DDL, tenant/RLS/FK/index work, generated DB types and schema-induced regressions belong to that change; the reviewed schema freeze has passed; this proposal implements remaining business functionality against the locked baseline and its own dependencies. Its existing schema statements describe requirements for the foundation, **not** permission to add per-feature DDL later. Operator-only SaaS and future shard-compatible UUID/RLS design follow [ADR-0018](../../docs/adr/0018-operator-only-saas-and-tenant-scaling.md); no customer self-hosting or live cutover is authorized.


> **ADR-0017 final-cutover override (2026-11-18):** No backward compatibility or legacy dual-writes before v1. The final deliverable uses the clean canonical baseline and current website/MCP contracts. All planned features deploy with **one final** live migration **or** verified clean rebuild/reimport at the operator's choice; no per-feature production migration. Existing data handling is a deliberate one-time import/mapping decision, not an obligation to retain obsolete Family/Studio/guardian APIs or old portal tokens. Security, tenant isolation and explicit new grants remain required.


**Status:** Proposed only; no application code, schema or production data changed.
**Priority:** P1 incremental workflow integration, with release slicing after prerequisite domain changes.
**Depends on:** 2026-11-18-add-workplace-context-and-retire-studio; 2026-11-18-improve-daily-coach-workflows; 2026-11-18-replace-families-with-contacts. Financial extensions depend additionally on 2026-11-18-implement-workplace-compensation-and-billing; contact-facing sharing depends on 2026-11-18-scope-student-contact-portal.
**Coordinates with:** existing recurring scheduling, assignments, credits, reports, notification and student-history capabilities; ADR-0003 MCP parity, ADR-0015 baseline/live transition, ADR-0016 domain decisions.

## Why
A professional tutor's working day is a connected sequence: schedule, prepare, teach, confirm what happened, record student-specific evidence, communicate selectively, reconcile obligations and plan the next lesson. Current and proposed features are fragmented across pages and tools. Competitor workflows (TutorCruncher lesson states, recurring lessons, report approval and partial payments; Teachworks flexible rates and invoicing; Jane day-end review and prepaid packages) suggest integration and exception handling, not a large generic CRM.

## Outcome
A chess coach can complete the daily teaching loop with trustworthy records in the web UI or ChatGPT/Claude MCP: know what is next, resolve unconfirmed sessions, handle recurrence exceptions, close individual/group lessons with verified attendance and teaching evidence, review incomplete work, and reconcile financial obligations without inventing received cash.

## Scope and coordination
1. **Lesson state and exception lifecycle:** distinguish planned, occurred/awaiting confirmation, completed/closed, cancelled, rescheduled and no-show where applicable. Model event occurrence separately from per-student attendance and from financial billability. Past scheduled lessons are NOT automatically treated as taught. One group occurrence remains one teacher work item with participant-level evidence. Define safe transition, reopen/correction, idempotency and audit rules. Extend the daily-workflow change rather than duplicating its briefing and close service.
2. **Recurring schedule exceptions:** inspect existing recurrence support; add only missing single-occurrence reschedule/cancel/skip, series edits with clear scope, previews, conflicts, timezone/DST correctness, roster snapshots and makeup linkage. No silent rewrite of completed historic occurrences.
3. **Teaching notes and report publication:** separate coach-private notes, verified material/assignment/attendance evidence, and shareable summaries. Sharing requires deliberate audience selection, preview and explicit approval; contact relationship alone grants no access. Preserve source/provenance and taught-vs-mastered distinction. Integrate with existing student/contact portal proposal.
4. **Optional day-end and period-end review:** a concise queue for unconfirmed lessons, attendance gaps, unfinished capture, upcoming prepaid-credit exhaustion, unresolved aliases, and financial items awaiting review. End-of-month view distinguishes expected earnings, obligations, paid allocations, and unknown/unreconciled entries. Not a mandatory wizard.
5. **Financial usability and partial settlement:** after the compensation change, expose obligation balances, partial payments, allocation of one received payment to multiple obligations with explicit approval, correction/reversal and auditable provenance. Existing package/credit balances and expiry must be visible and reconciled against lesson policy. Never equate earned, billed, paid, or received.
6. **Contact responsibilities:** build on Contacts and portal changes to distinguish payer, scheduler, report recipient and authorized viewer. Explicitly prevent workplace sponsorship from becoming a default payer for unrelated private lessons.
7. **Agent-first workflows:** same typed teacher services for UI and MCP; focused review/commit tools for lifecycle transitions, recurrence exceptions, summary approval, day-end review and settlement; predictable validation errors, no invented facts or autonomous financial postings.

## Explicitly excluded
No multi-debtor split of one obligation (e.g. divorced parents owing 50/50), no automatic tutor/agency Stripe payout splitting, no bank/tax/payroll engine, no mandatory AI-generated teaching evaluations, no unsolicited automated messages, no generalized school ERP or public marketplace. These are distinct future product decisions.

## Delivery sequence
- Phase 0: inventory existing code, active OpenSpec scope and MCP tools; publish implemented/planned/missing/deferred gap matrix; confirm schema ownership and UX edge cases.
- Phase 1: lesson state/exception model and recurrence integrity; reuse existing daily lesson close.
- Phase 2: report privacy/approval and contact-aware recipient workflow.
- Phase 3: optional day-end/period-end queue and package balance visibility.
- Phase 4: partial settlement and reconciliation after financial foundations.
Each phase may ship independently only with its own web/MCP parity and automated verification.

## Acceptance gates
- An eight-student group occurrence appears once in the coach's teaching workload and financial earning calculation; attendance and learning evidence remain per participant.
- A past scheduled session with no confirmation is pending, not automatically completed or billed.
- One-off reschedule does not alter past series history; conflicts and DST changes are previewed.
- Private notes cannot appear in a shareable report; only explicitly approved audiences can access a summary.
- A 180 ILS expected earning with 60 ILS recorded as received remains 120 ILS outstanding; receipt is never fabricated from attendance.
- Missing, ambiguous and provider-unavailable data remain visibly unknown; retries cannot double-close a lesson, duplicate a charge or double-allocate a payment.
- Every teacher website field/action has a same-PR MCP counterpart, registry change and authenticated parity test; strict 93-scenario browser/MCP baseline remains green with zero business-route gaps.
- Database changes update authoritative baseline and document reviewed one-time live transitions under ADR-0015. No production migration or deployment is authorized by this proposal.

> **Cross-change schema coordination (2026-11-19):** Potential additional schema: lifecycle exceptions, audit and recurrence; confirm in inventory before design. Reuse existing native finance ledger; do not introduce a second obligation/payment model. See [`../SCHEMA_ROADMAP.md`](../SCHEMA_ROADMAP.md) for shared dependencies and ADR-0017 single-final-cutover rules. Passing the Contacts/Finance PR does not automatically accept this proposal.
