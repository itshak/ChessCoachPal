> **2026-11-21 schema-ownership handoff:** All outstanding physical DDL, source schema/type/RLS changes and schema-generated regression tasks in this checklist are now tracked under the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/tasks.md)** (ADR-0019). Keep this proposal's functionality, UI, MCP and acceptance tasks open until independently verified. Historical SQL implementation instructions here are not independent migrations. Do not mark work complete solely because merged code exists.

# Tasks

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


## 0. Inventory and scope
- [ ] Compare existing implementation and active OpenSpec changes for lesson close, recurrence, reports, contacts, credits, compensation, and MCP registry; classify implemented/planned/gap/deferred.
- [ ] Document state transition matrix, cancellation/no-show billing policy, group attendance semantics, contact sharing grants, package accounting and failure modes before implementation.
- [ ] Define phased acceptance scenarios and baseline/live-transition implications; no schema or production changes at proposal stage.

## 1. Lesson lifecycle and recurring exceptions
- [ ] Reuse/extend existing lesson-close domain service with explicit occurrence confirmation, transition validation, corrections and audit trail.
- [ ] Implement recurrence preview, one-off exceptions, future-series edits, conflicts and DST safeguards without rewriting history.
- [ ] Add teacher website actions and matching MCP tools/registry entries in the same PR.
- [ ] Add authorization, idempotency, group-counting, no-show, retry and parity tests.

## 2. Report sharing
- [ ] Separate private notes from publishable verified summary fields at service/data boundaries.
- [ ] Implement summary preview, recipient scope, explicit approve/revoke and contact portal integration after prerequisites.
- [ ] Add website/MCP operations and tests for privacy, revocation, missing consent, ambiguous contact roles and outages.

## 3. Review and credits
- [ ] Add derived optional day-end and period-end action queues with clear resolution links.
- [ ] Surface prepaid package remaining units, expiry, corrections and consumption policy in relevant student/lesson context.
- [ ] Add website/MCP operations and tests for workplace scoping, missing data, archive history and parity.

## 4. Partial settlement and reconciliation
- [ ] Extend the approved finance domain to record partial receipt allocations and reversals, with explicit payer/account attribution and auditability.
- [ ] Implement outstanding balance and period-end reconciliation without conflating earning, charge and received cash.
- [ ] Add web/MCP review and commit tools with concurrency, retry, idempotency and over-allocation tests.

## 5. Verification and release discipline
- [ ] For any schema changes, update authoritative baseline and prepare reviewed one-time populated-beta transition under ADR-0015.
- [ ] Run focused tests and strict full browser/MCP parity suite (all 93 scenarios, zero partial/gap teacher routes), lint/typecheck/build and GitHub Actions.
- [ ] Record merged commit and green CI evidence in docs/STATUS.md before marking implemented; archive OpenSpec only after actual acceptance.
- [ ] Keep real ChatGPT/Claude vendor-client sign-off in the final local prepublication v0.1.0 release gate.
