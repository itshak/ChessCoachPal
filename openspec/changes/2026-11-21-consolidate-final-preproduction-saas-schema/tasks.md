# Consolidated final-schema implementation and acceptance checklist

**2026-11-21 implementation candidate (draft PR #115):** The consolidated canonical baseline now contains 18 new domain/commercial relations, normalized SQL entitlement/active-roster guards, Personal/Professional workplace lifecycle, extensible rating categories, teacher evidence, recurrence exceptions and explicitly approved report snapshots, with matching TypeScript and web/MCP compatibility changes. The full field-level source status and limits are documented in `docs/FINAL_SCHEMA_IMPLEMENTATION_STATUS_2026-11-21.md`. **Every Phase 2 acceptance gate is still subject to exact-head SQL/E2E evidence; checkboxes below intentionally remain unchecked until accepted.** Only this proposal owns the pre-production DDL; previous merged candidates and test-only PR #113 are inputs, not independent full acceptance.

## 2026-11-22 implementation evidence pending final-head checks

A single source candidate on draft PR #115 now includes all 18 planned new relations, canonical SQL entitlement authority, explicit plan/grant/subscription audit triggers, the normalized PR #113 recovery race and new professional-workplace/rating/report scoping regressions. Physical source inventory currently counts 105 tables (60 explicitly typed, 45 requiring deliberate type/internal ownership decisions). Static parser fixes and the latest SQL SHA-256 require **their own** five-workflow exact-head pass. These are implemented slices, **not** unchecked Phase 0/1/2 signoffs, and production cutover remains separate.

## Phase 0 — audit and ownership (P0)

- [ ] Pin exact merged-main SHA and inspect every open PR for DDL, RLS, TypeScript type, migration, seed and service-contract conflict; record update on PR #113 and any new PRs before implementation.
- [ ] Regenerate exhaustive table/column/FK/unique/index/trigger/policy/function inventory from authoritative SQL and live target via read-only private inspection; reconcile 87 source tables and previously reported 40 typed/47 untyped; label internal-only contracts.
- [ ] Sign off [crosswalk](../../../docs/FINAL_SCHEMA_REQUIREMENTS_CROSSWALK_2026-11-21.md) and every downstream persistent requirement: contacts/payer, workplace/locale, enrollment/import/archive/credits, portal, compensation/financial truth, ratings/consent/jobs, recurrence/lesson revisions, published reports, learning provenance and Free/Pro.
- [ ] Decide exact minimal DDL for pending recurrence exceptions, report publication, workplace overrides and educational evidence; reuse existing tables or explicitly document none needed. No speculative new Academy source of truth.

## Phase 1 — consolidated baseline (P0)

- [ ] Implement versioned `capability_definitions`, `plan_versions`, `plan_capabilities`, account entitlement state, time-bounded grants, append-only audit and meaningful usage/idempotency records with typed CHECKs/FKs/indexes/uniqueness and restricted grants.
- [ ] Implement provider-neutral platform customer/offer/subscription/webhook-event schema, ordering/replay constraints and explicit paid-through/grace/cancel states, with *no checkout activation or migration of teacher finance receipts*.
- [ ] Replace inherited Stripe-only `teachers` plan/ID authority, `hosted_enforced` opt-out, conflicting app ENV limits and unrestricted founding plan semantics with one effective entitlement SQL boundary; provide a reviewed one-time data mapping, not runtime dual writes.
- [ ] Apply finalized workplace Personal/Professional, lifecycle and per-workplace preference schema; preserve existing named beta workplaces, source lesson attribution and safe over-limit downgrade access.
- [ ] Complete existing temporal enrollment, student archive, session/roster and credit safety; ensure teacher-lock quota serializes all create/reactivate/import/bulk/recovery/direct-SQL paths.
- [ ] Finish contacts, payer, portal grants and immutable teacher finance reconciliation at field level, avoiding duplicate receipts and unauthorized contact/portal inheritance.
- [ ] Replace fixed `student_rating_snapshots` provider/category CHECK lists with reviewed extensible provider/category lookup and tenant-safe provenance; verify an approved new federation category can be represented without DDL.
- [ ] Finalize federation/category ratings and immutable snapshots, provider consent/status/job receipt, source handle revisions and teacher evidence semantics.
- [ ] Implement only justified recurrence exception, lesson amendment audit and shareable report publication/approval snapshot schema; no independent daily queue, generic report/financial truth or duplicate material evidence.
- [ ] Remove executable inherited Family/Studio/self-host customer-contract artifacts and stale schema columns/comments that violate ADR-0017/0018; update selected schema guard/manifest checksum atomically.
- [ ] Regenerate TypeScript contracts and required seeds/fixtures; update *existing* website/MCP services broken by finalized schema with identical domain semantics. New subscription and feature UI/provider workflows stay downstream.

## Phase 2 — SQL and behavioral proof

- [ ] SQL-backed Free/Pro/individual-grant/trial/paid precedence, expiration, cancellation, concurrent plan changes, and cap downgrade; no silent data deletion and no premium write after entitlement expiry.
- [ ] SQL-backed 0/1/N capacity, concurrent student reactivation (including PR #113), import/restore/bulk, direct PostgREST attempts and group/workplace deduplication; count rollup/reconciliation and rollback on limit rejection.
- [ ] Provider event replay/out-of-order/newer-subscription vs old-deletion, unsupported provider, forged IDs and failed writes; documented no checkout-success grant and bounded grace.
- [ ] Tenanted cross-user/FK/RLS, service-role and SECURITY DEFINER negative probes for **all new and modified** tables, raw authenticated/anon access, delete/update attempts on immutable ledger and provider events.
- [ ] Dated enrollment/DST/future obligation, archival historical read/correction, credit funding/reversal, payer/portal scope, group session counting and imported unknown history tests.
- [ ] Recurring this/this-and-future/all and cancelled *unmaterialized* occurrence replay; published report approval/revoke/supersede and guest scope; no private-note or cross-child disclosure.
- [ ] Website/MCP parity for each already-supported operation, typed `UPGRADE_REQUIRED` and `CAPACITY_EXCEEDED`, idempotency, full authenticated read-back and consistent plan-summary capability discovery. No raw tool-call billing meter.
- [ ] Generated types, schema RLS coverage and canonical no-legacy guards, static analysis, fresh database bootstrap, exact-head GitHub CI, E2E, security, Compose and a clean second-instance synthetic backup/restore all green; record exact SHA/run links, skips and outstanding acceptance.
- [ ] Final manifest, read-only schema diff, property-specific ownership matrix, necessary indexes and type coverage decisions approved; record downstream no-planned-DDL handoff. Only then archive consolidated schema OpenSpec as **source implemented**.

## Phase 3 — independent operational gate (NOT authorized by these tasks)

- [ ] Read-only inventory of actual private beta deployed revision, schema, Auth, Storage, students, groups, reports, invoices, payments, credits, portal tokens, grants, subscriptions (if any), and archived history; never publish private values.
- [ ] Encrypted off-host backup plus independently verified restore; determine one target-specific direct transformation **or** clean final baseline/reimport with explicit row/ID/financial/portal mapping, no inferred current enrollments.
- [ ] Obtain separate operator authorization for exact source/target, execution/recovery plan and privacy reviews; perform cutover/reconciliation and production parity checks **only** under ADR-0017.
- [ ] Complete the independent downstream feature and live-client acceptance before public paid rollout; a frozen schema is not feature completion or commercial readiness.
