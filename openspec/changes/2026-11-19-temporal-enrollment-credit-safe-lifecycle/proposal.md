> **2026-11-21 schema-ownership handoff:** All remaining planned tables, columns, constraints, RLS and persisted state from this proposal belong to the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** (ADR-0019). This proposal remains responsible for feature services, UX, MCP parity and independent acceptance. Its earlier DDL instructions are requirements to P0, not authority for an independent migration. No live cutover is authorized.

# Change: temporal multi-workplace enrollment and credit-safe student lifecycle

**Status:** Verified source slices merged; exact-head evidence and open scope are tracked in [the source checkpoint](SOURCE_ACCEPTANCE.md). No production transition or archive. **Priority:** P0, schema freeze amendment prerequisite. **Owner:** canonical schema and shared domain service. **Depends on:** the inventory and freeze governance in `2026-11-21-consolidate-final-preproduction-saas-schema`; this amendment must be incorporated **before final acceptance of the frozen baseline**, not as an unreviewed second production migration.

## Original problem (historical)
At proposal time, the `workplace_enrollments` stores only current links. Unenrollment destroys the last workplace association, and bulk lifecycle archiving refuses current enrollments but reactivation does not restore them. The canonical `credit_packages` and `credit_redemptions` track prepaid lessons independently of membership. Archiving with unused paid entitlement, outstanding invoices, future sessions or future memberships needs explicit atomic disposition, not silent deletion.

## Approved design direction (subject to schema and test gates)
- One canonical temporal `workplace_enrollments` table, one row per continuous student/workplace period, allowing multiple simultaneous workplaces and retaining closed/cancelled periods.
- Derived current/previous/future status, teacher-local calendar dates, no overlapping periods for the same student+workplace, no automatic enrollment from historical attendance.
- Archived student cannot retain a current/future enrollment. Archive preview enumerates all affected memberships and future lesson commitments; commit atomically closes/cancels explicitly approved items.
- Credit entitlement is **independent** of enrollment. An archived student may retain unused credits on hold, but cannot redeem until reactivated and eligible. No automatic refunds, forfeiture, transfer, expiry extension or paid-status assumptions.
- Credit package workplace is an **entitlement scope**, not an implicit membership or future lesson booking. It must reference an owned workplace, with explicit cross-workplace usage policy. A lesson can consume a credit only when it matches student, duration, workplace, eligibility and financial constraints.
- Prepaid status requires verified payment evidence. Issued-but-unpaid packages and partially paid invoices are distinct from fully funded entitlements. Preserve invoice, payment, redemption and refund audit.
- Archive default: preserve unused entitlement on hold, preserve paid/unpaid obligations, and show explicit action choices. Refund, transfer and forfeit are separate confirmed audited financial workflows; do not implement until ledger accounting and permissions are verified.
- Reactivation preview suggests all last verified workplaces and shows held credits separately; teacher confirms selected new memberships. Restoring a workplace never automatically redeems credits or schedules lessons.

## Scope
Canonical SQL and RLS, typed schema and migration plan; shared website/MCP preview/commit for enrollment, archive, reactivation, credit disposition; historical evidence reconciliation; robust structured clarification and exact IDs; authenticated parity and transactional/financial tests. No live data writes without verified off-host backup+restore and operator-approved cutover.

## Dependencies
This proposal precedes workplace UI context, daily workflows, professional lesson lifecycle and compensation/billing implementation. Contact/payer foundation must be coordinated with financial ledger. Rating, localization and brand work can proceed after schema acceptance.

## Acceptance
Cross-tenant RLS; no overlapping same-workplace intervals; multi-workplace coexistence; future cancellation retained; archived/no-future-membership invariant; hold preserves entitlement and expiry policy explicitly; paid vs unpaid vs partial; no double redemption/charging; refunds and transfers cannot exceed unredeemed funded value; atomic archive/rollback; replay, concurrency, teacher-local dates, web/MCP parity; live dry-run report and restore rehearsal.

## Amendment (2026-11-21): archived learner encountered during lesson creation
A coach saying “add a lesson for Daniel” must not receive a misleading *student not found* result merely because Daniel is archived. A teacher-owned exact name/alias/ID match across active **and archived** records must return a non-mutating, structured reactivation choice; ambiguous identities must be disambiguated first. **No reactivation or enrollment occurs from preview or from AI inference.**

For a new scheduled or newly completed lesson, the coach explicitly approves the stable student ID(s), reactivation(s), exact workplace membership(s), time, affected active-student capacity and lesson. The preferred commit is **one server-side idempotent transaction** for all required reactivations, selected effective-dated enrollments and exactly one canonical lesson; either everything succeeds or none of it does. Route through the shared domain service for website and MCP, never chain unguarded separate writes on the agent side. Historical lookup, correction of an existing past lesson, and approved historic evidence imports do **not** require reactivation.

Reuse the existing temporal lifecycle quota, revision, historical workplace and credit safeguards. A closed workplace is a suggestion with provenance, not permission to re-enroll; new or ambiguous workplace relationships need their own reviewed enrollment decision. Do not restore prior groups/recurring schedules, consume credits, grant portal/billing rights or infer attendance/mastery by reactivating. In a mixed active/archived group, one denied or blocked learner blocks the entire proposed new lesson until the coach reviews a revised roster. The full amendment is not claimed complete: the [source checkpoint](SOURCE_ACCEPTANCE.md) distinguishes the verified scheduled recovery path from completed/full historical backfill and the pending operator gates.
