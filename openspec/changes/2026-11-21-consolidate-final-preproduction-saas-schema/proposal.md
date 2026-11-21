# Change: consolidate the final pre-production SaaS schema, including Freemium/Pro

**Status:** Proposed; P0 consolidated **schema-only** change, NOT implemented/frozen/deployed.  
**Decision:** [ADR-0019](../../../docs/adr/0019-single-final-schema-and-commercial-entitlements.md), plus ADR-0017/0018.  
**Only schema owner:** supersedes the older schema-freeze proposal as the active DDL planning owner. **All other active OpenSpecs are downstream functional owners**.

## Why now

The single baseline already declares 87 public application tables, but active proposals still require unreviewed persistent decisions around workplace settings and lifecycle, professional lesson/recurrence exceptions, published coaching reports, rating evidence, consent/job execution, payment reconciliation and tenant-safety/type coverage. The inherited hosted entitlement model models Free/Trial/Pro/Founding/Gifted through mutually exclusive teacher fields, Stripe-specific IDs and an active-student counter whose database and app authorities can diverge. Commercial product configuration, individual founding benefits, future feature gates and verified subscription state cannot be reliably represented with those columns alone.

Finalizing only the already-proposed feature schema would guarantee a second structural migration for future Free/Pro. Build the **generic schema foundation now**, without choosing public prices, numerical caps, the processor, Academy operations or speculative premium UI.

## In scope: ONE consolidated schema phase

1. Exhaustively inventory the authoritative baseline, every one of the 13 historical active proposals (including older P0), 87 existing tables, matching TypeScript contracts, relevant API/MCP/SQL callers, open PRs and restore/runbook assumptions; declare a single owner and keep-or-adjust/drop/new decision for every relation and required persistent field. [Crosswalk](../../../docs/FINAL_SCHEMA_REQUIREMENTS_CROSSWALK_2026-11-21.md).
2. **Freemium foundation:** typed versioned plan catalogue, capability definitions/limits, independent individual grants (including durable higher Free limits and expiring plan access), effective entitlement state and audit, serialized active-student and professional-workplace capacity, optional bounded usage windows and provider-neutral SaaS subscription/customer/offer/event records.
3. **Student lifecycle:** preserve canonical ID, archive and history, temporal `workplace_enrollments`, exact same student once in the roster quota, reviewed reactivation and archived-lesson recovery, group and future-session consistency, independent prepaid credit entitlements. No duplicate membership timeline or financial ledger.
4. **Workplaces / preferences:** guarantee one Personal workspace, distinguish Personal from Professional, model archive status and relevant effective-dated typed workplace defaults, teacher-global settings/locale, validated selected-workplace view preference, no invented membership from historic attendance.
5. **Contacts / finance / portal:** finish tenant-scoped Contacts, payer identities, invoice/obligation/received money/credit-funding boundaries, effective agreement revisions and immutable reversal evidence; portal grant scopes, digest-only bearer credentials, revocation and resource-level auth; resolve any remaining legacy Family/Studio/guardian physical runtime coupling.
6. **Ratings / teaching evidence:** resolve provider-neutral federation identity and category/provenance for FIDE/national/online rating snapshots, provider-specific consent and durable refresh queue/receipt; preserve distinction between chess strength, introduced/practiced/demonstrated/needs-review *teacher evidence* and independently observed external ratings.
7. **Professional and daily workflows:** reuse `lesson_slots`, `teaching_sessions` and audited session history; finalize only missing persistent single/future/all recurrence-exception and lesson-correction provenance. Support explicit approved/revocable report-publication snapshots and audiences via existing scoped grants. Daily action lists remain derived unless an irreducible user decision needs a small durable record.
8. Complete RLS/tenant FKs/indexes, least-privilege grants, SECURITY DEFINER call boundaries, generated types, schema manifest, fixture revisions and necessary regression repair of **already implemented** website and MCP consumers. Fix inherited misleading SaaS/self-host defaults and conflicting entitlement SQL/app checks.

## Explicitly out of scope

This planning change does **not** implement new functionality, a payment provider, paid checkout, public pricing, user-facing plan gates, background rating fetch, new report publication UI, daily queues, Academy/multi-teacher operations, official tax/accounting integration, sharding, generic custom-field builder, a second ledger or customer self-hosting. No live schema execution/reset, no release, no automatic OpenSpec archiving. After schema acceptance, these are downstream feature/service changes **without planned DDL**.

## Dependencies and precedence

The previous `2026-11-19-freeze-unified-saas-schema-and-regressions` supplied inventory and initial schema discipline. **This change replaces it as the sole unfinished schema owner**, incorporating its unchecked work. The sibling proposals remain active only for independently verifiable feature, service, UI, MCP and data-reconciliation scope; if they appear to request their own tables, those requests are requirements to this P0, not authorization for per-feature migrations.

Open [PR #113](https://github.com/itshak/ChessCoachPal/pull/113) is a lifecycle concurrency **test** against the current baseline, not a competing schema change; inspect and rerun it against the final candidate.

## Acceptance

One clean canonical SQL and exact manifest install all approved persistable domain requirements; typed ownership and no duplicate authorities; tenant RLS/FK/privilege and concurrency tests reject bypasses; existing web/MCP behavior remains complete and consistent; verified browser/MCP responses include typed premium/limit statuses; full exact-head CI, auth E2E, security, Compose, backups and isolated second-instance restore pass; the crosswalk has no unresolved *planned* schema gaps; operator-reviewed actual data cutover remains separately gated by ADR-0017. Only then may this change be archived as implemented.

No commercial numbers, private strategy, PII, credentials or real production exports may appear in this public change.
