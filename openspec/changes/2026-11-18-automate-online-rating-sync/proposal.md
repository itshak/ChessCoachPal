# Change: automate consented public Lichess and Chess.com rating synchronization

> **Schema-first execution gate (2026-11-19):** [`2026-11-19-freeze-unified-saas-schema-and-regressions`](../2026-11-19-freeze-unified-saas-schema-and-regressions/proposal.md) is the **mandatory first implementation change**. All schema DDL, tenant/RLS/FK/index work, generated DB types and schema-induced regressions belong to that change; this proposal must wait for its reviewed schema freeze and passing exact-head gates before implementing its remaining business functionality. Its existing schema statements describe requirements for the foundation, **not** permission to add per-feature DDL later. Operator-only SaaS and future shard-compatible UUID/RLS design follow [ADR-0018](../../docs/adr/0018-operator-only-saas-and-tenant-scaling.md); no customer self-hosting or live cutover is authorized.


> **ADR-0017 final-cutover override (2026-11-18):** No backward compatibility or legacy dual-writes before v1. The final deliverable uses the clean canonical baseline and current website/MCP contracts. All planned features deploy with **one final** live migration **or** verified clean rebuild/reimport at the operator's choice; no per-feature production migration. Existing data handling is a deliberate one-time import/mapping decision, not an obligation to retain obsolete Family/Studio/guardian APIs or old portal tokens. Security, tenant isolation and explicit new grants remain required.


**Status:** Proposed implementation, not currently automatic.
**Priority:** P1; follows the federation snapshot model.
**Depends on:** 2026-11-18-introduce-fide-national-ratings for shared provider-neutral snapshots.

## Why
The existing website StudentChessProfileEditor can save Lichess/Chess.com handles, while StudentRatingHistoryPanel requires separate checkbox, preview and explicit confirm actions to write live public-provider observations. Existing public provider readers and snapshot services work but do not automatically refresh on a new handle or schedule active learner updates. Archived students need historical preservation without ongoing polls.

## Outcome
A teacher authorizes public handle lookups once with explicit scope; saving/changing a handle queues a first refresh and active learners receive rate-limited cadence-aware updates. The teacher can manually refresh from website or MCP; old snapshots remain immutable and source-attributed. Historical backfill is optional and honestly incomplete where provider data is insufficient.

## Scope
- Persist student/provider-level lookup consent, saved username and last approved account revision; handle added/changed/removed paths go through website and MCP shared services.
- Fetch public ratings when handle added/changed AND consent exists, with background queued execution; do not block student creation or profile edits on provider availability.
- Run bounded scheduled refresh for active students, optionally more targeted before upcoming lessons; no recurring fetch for archived learners. Manual refresh may still be requested for archived students with explicit authorization.
- Provider quota, per-host throttling, retries with exponential backoff, circuit breaker, cache, deduplicated idempotent evidence and stale/error UI status.
- On-demand history/backfill: use authentic Lichess rating-history where supported and Chess.com games/archive public evidence if reconstructible, explicitly label gaps/inference and never synthesize official daily historical ratings.
- Website/MCP status, manual refresh, history, source, effective/observed/fetched dates, and independent read-back.

## Non-goals
No private API token/student password request, mandatory daily sync of all students, guessed username ownership, arbitrary website crawling, rating-to-strength automation, large AI-driven performance analysis or automatic child-data publication.

## Acceptance
Consented new handle fetches without extra click; denied consent does not. Archived excluded from recurring jobs, sync failure preserves last good snapshot, retries are deduplicated, and website/MCP display identical provenance.

> **Cross-change schema coordination (2026-11-19):** Future schema REQUIRED: consent, queued refresh jobs, receipts, provider status and tenant grants. Not included in the accepted baseline solely because the contacts/finance PR passes. See [`../SCHEMA_ROADMAP.md`](../SCHEMA_ROADMAP.md) for shared dependencies and ADR-0017 single-final-cutover rules. Passing the Contacts/Finance PR does not automatically accept this proposal.
