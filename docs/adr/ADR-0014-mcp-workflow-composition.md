# ADR-0014: User-workflow-first MCP operations with complete granular parity

- **Date:** 2026-11-17
- **Status:** Accepted for server-side implementation on merged main `ebb4af8`; deployment/client certification remains separate
- **OpenSpec:** [archived optimize-mcp-coaching-workflows](../../openspec/changes/archive/2026-11-17-optimize-mcp-coaching-workflows/proposal.md)
- **Existing binding policies:** ADR-0003 (complete website/MCP business parity), ADR-0006 (unversioned canonical tool names), ADR-0007 (root-object schemas, actual dispatch/read-back), ADR-0013 (non-destructive live SQL rollout).

## Context

ChessCoachPal's MCP remains the primary business interface; the website is an optional visual editor and secure credential/approval surface. The audited source before this implementation listed **195 tools**, with 76/76 mapped teacher route families passing the existing strict static/behavior ledger. A simple tool-count reduction would make uncommon record-level corrections unreachable and does not prove client tool-search benefits. The broad catalog includes genuinely useful task-oriented operations already (e.g. `ccp_coach_briefing_get`, verified Lichess chapter preview/atomic commit, PR #95 historical date-list import and paginated data export).

The remaining common friction is **model-driven orchestration across many dependent writes**, especially a completed multi-student lesson with distinct attendance notes and a new material used in the lesson. Combining writes is desirable only where domain validation and a single database transaction make it safe.

## Proposed decision

1. Continue exposing **every authorized granular capability** through **one** `/mcp` endpoint, with the same canonical website business services and tenant permissions. Do not create a generic arbitrary executor, separate required MCPs, mandatory agent skill, or dynamically switch tool catalogs by conversation turn.
2. Provide **named, typed task-intent commands** for frequently requested teacher outcomes. Prefer preview → explicit confirm → committed receipt. Avoid hiding significant external side effects behind a one-click tool.
3. For a completed 2–50-participant ad-hoc group lesson, the server may coordinate canonical session creation and full frozen-roster attendance completion in one SQL transaction, preserving one instructor-time duration and one independent note/status per learner. The user must explicitly provide all attendance decisions; otherwise use existing scheduling or per-session completion tools. An existing capture preview may resolve names/aliases/workplace/time, but it does **not** itself write or imply attendance.
4. For recording typed material usage in an **existing completed lesson**, provide a non-mutating review then one SQL transaction that selects or creates a typed material, links it to the session and records explicit, participant-scoped `assigned`, `taught` or teacher-attested `completed` evidence. Distinguish absence from taught claims, don't infer mastery and don't send anything to Lichess or external providers.
5. Preserve all existing granular and specialized workflows; choose correct semantics over an arbitrary number-of-calls or tool-count target. PR #95 historical evidence remains distinct from actual completed calendar lessons; CSV export remains paginated in MCP and a downloadable ZIP on web, with JSON as the restorable backup.
6. Normalize tool naming/description quality with static CI checks and a source-derived audit. Hosts supporting progressive ToolSearch can defer full schemas; the MCP server itself cannot guarantee which tools a particular consumer assistant loads into context.
7. Keep OAuth scope, tenant/RLS authorization, plan entitlement and explicit consent at the SQL transaction boundary. An advertised tool is not authorization. Never leak secrets or provide raw SQL.

## Accepted implementation

- `ccp_lessons_capture_completed` → `teacherCompletedGroupCapture` → `ccp_teacher_completed_group_lesson_create`; matched website POST `/api/coaching/lesson-capture/completed`.
- `ccp_materials_lesson_use_preview`/`_commit` → `teacherMaterialInLessonPreview/Commit` → `ccp_teacher_lesson_material_use_commit`; matched website POST/PUT `/api/coaching/materials/lesson-use`.
- `scripts/mcp-tool-workflow-audit.mjs` and generated `docs/MCP_TOOL_WORKFLOW_AUDIT.md` enumerate the current catalog and flag invalid/overlong definitions. The source of truth remains `lib/server/agent-tools.ts`; counts and classifications are not immutable release targets.
- The canonical fresh-install baseline includes both RPCs. Existing data-bearing environments need the additive `20261117190000_mcp_workflow_composition.sql` after the approved historical-lifecycle extension. This is a **new, specifically reviewed forward-only exception** under the operational principles of ADR-0013, not authorization to add arbitrary SQL migrations. The allowed filename list in `scripts/pre1-schema-guard.mjs` is explicit.
- Never run the entire baseline against a live database, never reset teachers/children's records, and do not claim a Git merge automatically updates Coolify's PostgreSQL. Before any rollout to existing data: confirm off-host backup, successful isolated restore, signed-off additive schema, privileges/RLS, idempotent repetition and fresh/upgrade tests; apply the new migration through an operator-controlled safe process. Roll back app deployment if DB compatibility fails; new additive SQL can remain dormant.

## Rejected alternatives

- **Drop most tools and keep only a “core 12”:** breaks legitimate granularity and clients without deferred tool discovery.
- **`ccp_execute(name,json)` meta-tool:** hides business semantics, policy and reviewability; not appropriate for public plugin submission.
- **Compose writes in the AI agent or the Next.js route:** introduces partial writes and dangerous retries across several independent requests.
- **No previews or confirmations:** lowers call count at the expense of wrong-recipient data and unrequested writes.
- **Require expensive model A/B tests before development:** unnecessary for deterministic business invariants; actual vendor clients remain separate acceptance.

## Verification and decision boundary

Development requires current source/catalog lint, TypeScript/unit, strict parity registry, authenticated website↔delegated MCP tests (including replay, foreign tenant, ambiguity, database rollback, non-default fields), security-history, new-install Compose and off-machine restore. The five new named E2E ledger rows in `docs/MCP_NEW_PARITY_SCENARIOS.md` have passed; no ChatGPT or Claude real-client certification is implied.

Do not claim live ChatGPT/Claude tool-selection or cheaper model reliability from these server-side tests. A static “minimum safe tool sequence” comparison is an engineering proxy, not measured model token savings.

**Accepted evidence:** PR #97 merged to [`ebb4af8`](https://github.com/itshak/ChessCoachPal/commit/ebb4af86b9ee4a826a21b8841c062763c7b8c219). [CI](https://github.com/itshak/ChessCoachPal/actions/runs/44168139027), [auth website/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/44168139268), [security](https://github.com/itshak/ChessCoachPal/actions/runs/44168138614), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/44168139157) and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/44168138711) passed on exact main. Source/feature activation on the existing live database is not part of this decision. The separate GitHub Release workflow remains red because it misidentifies the already published v0.1.6 tag; [issue #98](https://github.com/itshak/ChessCoachPal/issues/98) tracks this and no retagging/release/deployment is authorized.
