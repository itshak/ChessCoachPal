> **2026-11-21 current-owner update:** This document is a dated historical snapshot/runbook. All unfinished DDL planning has moved to [one consolidated final-schema + Freemium P0](../openspec/changes/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md) under ADR-0019. Do not treat earlier draft-PR/source status or original freeze references below as current implementation or live cutover authority.

# Unified operator-only SaaS schema — inventory and handoff

**2026-11-19 candidate. Not accepted, merged, released, deployed or approved for live cutover.**
Implements the schema-only prerequisite in [OpenSpec](../openspec/changes/2026-11-19-freeze-unified-saas-schema-and-regressions/proposal.md), under [ADR-0017](adr/0017-pre-v1-single-final-cutover-no-compatibility.md) and [ADR-0018](adr/0018-operator-only-saas-and-tenant-scaling.md). The only canonical new-install migration is `supabase/migrations/20261107000000_chesscoachpal_baseline.sql`; `scripts/schema-transition-manifest.json` binds its SHA-256. This is not a customer self-hosting edition, staged compatibility migration, production deployment or permission for a database reset.

| Persisted domain | Canonical records | Functional OpenSpec owner |
| --- | --- | --- |
| Teacher and workplace | `teachers`, `teacher_settings`, `workplaces`, `workplace_enrollments` | Workplace context and multilingual experience; teacher UUID is tenant, workplace is only a filter |
| Student, lesson and recurrence | `students`, `class_groups`, `lesson_slots`, `teaching_sessions`, `session_attendance`, session note/attendance/roster audit | Professional and daily workflows; reuse existing status, slot-occurrence date, reschedule/makeup provenance; do not introduce a duplicate daily queue |
| Contacts and payers | `contacts`, `student_contacts`, `billing_accounts`, `student_billing_assignments` | Contact identity and finance; payer is not inferred from guardian/contact |
| Scoped external sharing | `portal_access_grants`, `portal_event_invitations` | Explicit portal grants; old household-token access never inherited |
| Compensation and ledger | `compensation_agreements`, `financial_obligations`, `received_payments`, `payment_allocations`, `financial_reversals` | Teacher-confirmed posting, audited separate receipt/allocation; no speculative second ledger |
| Federation and rating history | `student_federation_memberships`, `student_rating_snapshots`, chess profile history | FIDE/national identities and immutable source-attributed snapshots, distinct from strength/mastery |
| **Durable online rating sync (added now)** | `student_rating_sync_consents`, `student_rating_refresh_jobs`, `student_rating_refresh_receipts` | Future online rating sync; provider/handle revision, bounded lease/retry queue, idempotency and append-only attempts |
| Next actions | Derived views over lessons, homework, attendance and rating state | Daily coaching; no independently drifting queue persisted by default |

## Schema invariants and feature boundary

The new tables require provider-specific affirmative permission; a saved online handle alone does **not** enable it. Only server-side authorized code may write consent/job state; authenticated teachers can read their own records, and anonymous users cannot. Foreign keys pin jobs and receipts to the same teacher and student (and the correct consent provider). Job execution must revalidate the current owner, active-student state, consent, account-handle revision and provider rate limits **before fetch and again before commit**. This validation, provider API calls, scheduled workers, web/MCP consent controls, error display and history backfill belong to the *downstream* rating-sync change and are NOT delivered here.

This source-only change does not activate synchronization, external messages, payments, a portal grant, an official federation adapter or a live data transition. Existing full website/MCP business coverage must remain intact. Tenant A/B isolation, financial immutability and portal privilege checks stay mandatory.

## Acceptance and release gates

- `schema:canonical:guard`, its unit tests, disposable clean-install SQL assertions, TypeScript, exact-head CI, authenticated browser/MCP E2E, security audit, Compose and backup-restore must pass. The new SQL privilege/owner-FK checks are part of `scripts/schema-final-baseline-synthetic.sql`.
- An **independent** review of real source-schema inventory, current invoice/payment/credit/event/Storage records, explicit contact/payer mappings, safe guest token replacement and a verified **off-host backup plus successful restore** is still needed. Green synthetic CI never proves historic data preservation.
- Under ADR-0017, select one operator-approved direct source-to-final conversion **or** a clean build and deliberate reviewed reimport. Do not run cutover, reset production, release or archive active OpenSpecs merely because this candidate compiles.
- All subsequent functionality must implement against this unified canonical schema, and any unexpected required DDL must amend this schema-phase OpenSpec before feature work resumes. Keep private customer data and confidential commercial strategy out of public GitHub.
