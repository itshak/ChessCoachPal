# ADR-0019: One final pre-production schema owner, provider-neutral commercial entitlements

- **Status:** Accepted architecture decision; source implementation frozen on [merged main](https://github.com/itshak/ChessCoachPal/commit/0147c7aa34f680b6defa9f202f28c64e9fc6b5ba). Downstream feature acceptance, release and live cutover remain separate.
- **Date:** 2026-11-21
- **Owners:** ChessCoachPal product and platform
- **Relates to:** ADR-0001, ADR-0003, ADR-0007, ADR-0017, ADR-0018; [consolidated OpenSpec](../../openspec/changes/archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md).
- **Supersedes for future DDL planning:** `2026-11-19-freeze-unified-saas-schema-and-regressions` (historical proposal retained but no longer a competing schema owner).

## Decision and rationale

One **consolidated, schema-only P0 OpenSpec** shall collect **all currently anticipated pre-production database changes**, including the already-open feature proposals and the Free/Pro foundation, into the sole authoritative `supabase/migrations/20261107000000_chesscoachpal_baseline.sql` and matching type contracts. Remaining proposals implement **behavior, UI, provider adapters, MCP tools and tests** against that schema; they may not independently introduce planned DDL. A genuinely unexpected requirement requires an explicitly reviewed amendment of the consolidated schema OpenSpec **before freeze**, or a new post-freeze ADR/change-control decision afterward. The goal is to avoid *known* schema churn, not to guarantee no future migration for unforeseeable products.

ChessCoachPal is an **operator-managed SaaS**, not a supported customer self-hosting product (ADR-0018). The signed-in teacher UUID remains the tenant key; workplaces are not tenants. The domain backend, not the chat agent or payment callback, enforces subscription access, business permissions, quotas, and data invariants consistently for website and MCP.

## Separation of concerns

1. **Canonical teacher data:** identities, archived student history, sessions, roster/attendance, materials, evidence, workplaces, contacts, authorized sharing, scheduling and finance remain teacher-owned. Do not turn records into commercial entitlement rows or erase them on downgrade.
2. **Commercial plan catalogue:** immutable/versioned plan definitions and typed capabilities determine the current *offer*, without embedding undisclosed prices or proposed numerical thresholds in the open repository.
3. **Subscription state:** normalized provider-neutral SaaS customer/subscription/event records record *our platform fees*. They are separate from teachers' invoices to their students, `received_payments`, `payments`, `credit_packages`, `credit_adjustment_events` and compensation obligations.
4. **Individual grants:** independent dated, revocable, auditable overlays support an operator-authorized capacity override and separate time-limited whole-plan access. Inherited plan labels must not be treated as unlimited Pro or automatically cancel a separately valid paid subscription. Multiple grants may coexist; no particular cohort benefit is committed.
5. **Effective entitlements:** deterministic, fail-closed evaluation merges Free baseline, verified paid state, current time-bounded plan grants and individually authorized additive capability grants. No teacher-controlled field, environment limit, UI badge, cached MCP tool list or checkout success page can grant premium access.

## Critical semantics

- Only **active distinct canonical students** consume active-student capacity; archival preserves data and counts zero, regardless of group or workplace count. Student create/reactivation/import/restore and ordinary or archived lesson workflows must share one PostgreSQL transactional guard and one authoritative capacity state; concurrent writers serialize on an account-owned row.
- A teacher above a lower limit after expiration/downgrade retains existing students, workplaces and history; ordinary safe lesson capture, correction, reading and export remain accessible. Block only *growth or premium-only new actions* as appropriate; provide non-destructive reconciliation and upgrade options. No forced destructive downgrade.
- One immutable Personal workplace per coach is guaranteed by transactional provisioning. Groups and private lessons are available in Free. Professional workplace capacity is a separately typed quota; active professional workplace count is not group count. Existing beta workplaces/history are not silently hidden or deleted on introducing a gate.
- Plans and grants do **not** grant privileged OAuth scopes or portal permissions. MCP advertisements are not authorization. The same server-side entitlement check applies to web, MCP, imports, background workers and SQL mutation paths. Return structured `UPGRADE_REQUIRED` or `CAPACITY_EXCEEDED` without disguising a premium limitation as missing data.
- Checkout events must be verified, deduplicated, replay-safe and order-safe. An obsolete subscription deletion must not demote a newer subscription. A payment provider adapter is replaceable; provider IDs and immutable external receipts are uniquely constrained by provider and seller account. Trial, cancel-at-period-end, grace, paid-through, refund and dispute states are distinct.
- Use explicit capability keys/types with audited review. Quotas may be unlimited through a **typed unlimited value**, never magic sentinel numbers. For concurrent writes, grant/plan changes, capacity updates and usage reservations must serialize under PostgreSQL locks; application previews do not authorize commits.
- No pricing, unapproved numerical quotas, named payment-provider choice, private market hypotheses, student PII or secrets in the public schema/proposals. Feature placement in Free/Pro is configurable but essential corrections, export, archived-history access and ordinary core lesson workflows remain available.
- Meter **meaningful bounded work**, not raw AI/MCP tool invocations. Event deduplication and time windows are durable; no speculative large AI usage billing subsystem.
- Plan data, subscription status and audit trails may only be changed by trusted, explicitly authorized platform operations with restrictive RLS/grants; normal teacher authenticated roles have owner-scoped read surfaces only.

## Other roadmap schema decisions included now

Retain `workplace_enrollments` as the sole dated membership history; `student_rating_snapshots` as the sole rating-evidence stream; the existing immutable teacher-finance obligation/receipt/allocation/reversal ledger; canonical materials/skill-evidence records; and `lesson_slots` / `teaching_sessions` as the recurrence and occurrence source. Add only **missing** durable elements: per-occurrence exceptions/revisions if required for professional recurrence, explicitly approved and revocable report-publication snapshots, validated workplace kind/status and preference hierarchy, necessary student-specific learning provenance, and entitlement/subscription audit/usage. Do not add an independently drifting daily action queue or a generic custom-field designer. Do not create an Academy or organization/tenant model ahead of validated demand.

## Verification / change control

The consolidated OpenSpec SHALL produce a table-and-field ownership matrix, a baseline checksum and generated types, SQL-backed owner-A/B/RLS/SECURITY DEFINER and concurrency tests, full authenticated website/MCP parity and idempotent receipts, exact-head CI/E2E/security/Compose/synthetic second-instance restore, and a documented no-planned-DDL handoff. No unchecked task may be marked complete by a documentation merge or a green historical CI run.

**Source approval, feature acceptance, release and populated-data cutover are four separate gates.** ADR-0017 requires a distinct operator-authorized one-time transition or clean rebuild/reimport of actual deployed data, verified encrypted off-host backup and restored copy, Auth/Storage/portal/finance/history reconciliation and explicit target approval. This ADR authorizes **documentation/planning only**, not SQL execution on a live service.
