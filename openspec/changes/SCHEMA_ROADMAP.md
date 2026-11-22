> **2026-11-22:** Historical roadmap; source freeze is complete and this file does not authorize feature DDL. See the [merged source decision](archive/2026-11-21-consolidate-final-preproduction-saas-schema/SOURCE_ACCEPTANCE.md).

> **2026-11-21 current-owner update:** This document is a dated historical snapshot/runbook. All unfinished DDL planning has moved to [one consolidated final-schema + Freemium P0](archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md) under ADR-0019. Do not treat earlier draft-PR/source status or original freeze references below as current implementation or live cutover authority.

# Cross-change canonical schema roadmap (2026-11-19)

> Planning status, not an implementation or production-cutover certificate. The branch PR #104 remains draft until all acceptance gates are independently verified.

## Rule

ADR-0017 requires one final authoritative fresh-install schema and **one separately authorized final live cutover** (or verified clean rebuild/import). A passing PR E2E suite does not close other OpenSpec proposals or certify historical data reconciliation. Do not create per-proposal production migrations, compatibility tables or dual writers.

## Active proposals and schema impact

| Proposal | Schema status | Boundary / next action |
| --- | --- | --- |
| `2026-11-17-introduce-multilingual-support` | Existing candidate: teacher preferred-locale field; verify current baseline and finish acceptance | Existing locale column is not evidence that all locale UX and parity gates passed. |
| `2026-11-18-add-workplace-context-and-retire-studio` | Existing candidate: teacher workplace selection and scoped ownership; verify current baseline and acceptance | The workplace selector E2E was failing on eaef867 parent; recheck exact-head E2E. |
| `2026-11-18-automate-online-rating-sync` | Future schema REQUIRED: consent, queued refresh jobs, receipts, provider status and tenant grants | Not included in the accepted baseline solely because the contacts/finance PR passes. |
| `2026-11-18-explore-brand-and-redesign-coach-ui` | No database schema change planned | Do not change database as a byproduct of design work. |
| `2026-11-18-extend-professional-coach-workflows` | Potential additional schema: lifecycle exceptions, audit and recurrence; confirm in inventory before design | Reuse existing native finance ledger; do not introduce a second obligation/payment model. |
| `2026-11-18-implement-workplace-compensation-and-billing` | Existing candidate: agreements, obligations, payments and allocation ledger; acceptance pending | No final financial reconciliation or live cutover authorized. |
| `2026-11-18-improve-daily-coach-workflows` | No committed new table yet; may require persisted queue state after inventory | Prefer derived queues from canonical sessions and students where practical. |
| `2026-11-18-introduce-fide-national-ratings` | Future schema REQUIRED: federation identities/memberships, official category/source evidence and generalized rating snapshots | Do not duplicate consent/job primitives planned for automatic online rating sync. |
| `2026-11-18-replace-families-with-contacts` | Existing candidate: contacts, student links, billing accounts; final cutover/reconciliation pending | Legacy mapping and financial preservation remain explicit release gates. |
| `2026-11-18-scope-student-contact-portal` | Existing candidate: scoped grants and revocations; acceptance pending | Guest/RLS denial and restore/reconciliation gates must pass before acceptance. |

## Mandatory schema-first execution gate

[Unified SaaS schema and regression repair](archive/2026-11-19-freeze-unified-saas-schema-and-regressions-superseded/proposal.md) is now **the first remaining implementation change**. It collects all schema requirements from every active proposal, finalizes one baseline and fixes schema-induced regressions before any downstream feature work. All other active proposals depend on its reviewed freeze and exact-head checks; their previous per-feature schema instructions are requirements handed to this foundation, not separate DDL phases.

## Historical planning sequence (superseded by schema-first gate)

1. Accept Contacts/Billing, Portal, Workplace Context and Compensation candidate code only after exact-head CI, full authenticated browser/MCP E2E, security, restore and OpenSpec acceptance. Historical invoices, payments, credits, packages, event RSVPs and Storage must be independently reconciled. This is **not** a live cutover.
2. Before finalizing the schema, resolve the FIDE/national-rating data model and automatic online rating consent/job/evidence model together, sharing snapshot provenance and provider abstractions without duplicate tables.
3. Inventory professional lifecycle/recurrence and daily queues for any genuinely persistent new entities; prefer deriving existing data and reuse the native immutable financial ledger.
4. Complete multilingual acceptance; branding/UI work should not mutate the database.
5. Freeze and verify the unified canonical target, regenerate types, run fresh-schema and restored-copy checks, full CI/E2E/parity/security/Compose/backup tests, and prepare operator-reviewed reconciliation. Only explicit separate approval can authorize the final real-data transition.

## Evidence status

On commit `eaef867`, CI, security history, Compose and backup/restore checks were reported successful; E2E was still running at the time of this roadmap update. This file makes no claim of a passing E2E or completed historical reconciliation.

## Binding SaaS and tenant architecture (2026-11-19)

[ADR-0018](../../docs/adr/0018-operator-only-saas-and-tenant-scaling.md) establishes operator-only SaaS (no customer self-hosting), shared canonical PostgreSQL schema, authenticated teacher UUID ownership, RLS and composite tenant-aware foreign keys, and shard-compatible design **without** implementing sharding now. All schema-first proposals must preserve these constraints; no live-data migration is authorized.
