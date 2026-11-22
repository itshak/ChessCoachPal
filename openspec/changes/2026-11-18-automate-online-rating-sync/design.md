> **2026-11-21 schema-ownership handoff:** All anticipated physical persistence in this design is owned by the **single [consolidated schema P0](../2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** under ADR-0019. This design remains a downstream feature contract. Superseded old freeze references below are historical; no independently staged feature DDL or live database change is authorized.

# Design: public online-rating refresh without per-click friction

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


> **Shared adapter proposal:** [Rating-provider boundaries](../../../docs/RATING_PROVIDER_BOUNDARIES.md). Keep provider retrieval separate from shared website/MCP policies and persistence. No independent DDL or deployment is proposed.

## Current implementation
lib/chess-public-ratings.ts reads official public profile/stats; lib/server/student-rating-snapshots.ts offers refreshPreview/refreshCommit, manually recordable snapshots; components/teacher/StudentChessProfileEditor.tsx and StudentRatingHistoryPanel.tsx expose a multi-click workflow; app/api/cron currently has no rating refresh job.

## Authorization semantics
A teacher opting into a saved public account lookup grants a narrow provider-specific permission for current rating fetching, not access to private games or student credentials. Store consent state with explicit source handle, allowed provider and timestamp/revision, including a revoke action. New profile handle + consent SHALL enqueue; changing username invalidates prior identity association for future observations and revokes stale queued work. Existing snapshot history keeps original source_username. Unconsented creation records handle only.

## Refresh triggers and jobs
A durable provider job/receipt has teacher/student/provider/handle revision and input hash, states pending/running/succeeded/stale/failed/retry, next eligible time and attempt count. A successful profile save never depends synchronously on provider API health. Worker validates archived_at IS NULL for recurring tasks, owner, current handle revision and consent before fetch and before commit; manual explicit requests for an archived student may be permitted separately. Use teacher local timezone/session proximity only as an optimization, not required for daily correctness; do not refresh a provider more often than its safe declared minimum interval.

Treat rate-limited errors, timeouts, private/missing accounts and unavailable categories as distinct. Never overwrite a valid existing latest rating with null/zero. Group updates per account and time control. Store observedAt and fetchedAt appropriately; immutable evidence and digest preserve idempotent refresh.

## Optional history
Lichess history may expose rating time series; only record explicit real provider-observed points. Chess.com published archives represent games rather than a guaranteed full official time series; derived values must identify their derivation and gaps, or be omitted. Backfill is user-triggered and quota-limited, never a silent expensive sync on every student.

## API/MCP and tests
Shared operations for provider consent on/off, refresh request/status/list/history with stable typed responses and explicit server-side host allowlist. Website and MCP equivalent teacher business operations; public remote read authorization is separate from agent write approval. Mock 429/404/stale/replay/username changed, and verify tenanted RLS and no child PII leak.
