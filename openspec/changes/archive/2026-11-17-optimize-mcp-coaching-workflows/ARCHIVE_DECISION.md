# Archive decision — workflow-oriented MCP coaching operations

**Decision:** IMPLEMENTED and ACCEPTED for the server-side product contract on **2026-11-17**. The implementation source was merged in [PR #97](https://github.com/itshak/ChessCoachPal/pull/97) at exact `main` commit [`ebb4af86b9ee4a826a21b8841c062763c7b8c219`](https://github.com/itshak/ChessCoachPal/commit/ebb4af86b9ee4a826a21b8841c062763c7b8c219). This archive applies the additions to the canonical `agent-first-mcp-workflows` and `teacher-mcp-parity` OpenSpec specifications; the prior parity spec was converted from its legacy layout to the current required heading/scenario structure **without dropping requirements**. The OpenSpec configuration rule quoting was corrected.

## What was delivered

- **Full MCP-first feature preservation.** The exact main-baseline catalog had 195 distinct `ccp_*` tool names. The accepted code retains all 195 and adds precisely three: `ccp_lessons_capture_completed`, `ccp_materials_lesson_use_preview` and `ccp_materials_lesson_use_commit`. Exactly **198 tools** are registered under the **same `/mcp`** connection. No generic arbitrary executor, compulsory skill, second MCP connection or user-visible record-level capability was removed.
- **Workflow 1 — record a completed group lesson:** Reviewed name/alias, workplace and actual-time preview, then one explicitly confirmed all-or-nothing SQL operation creating one canonical session and frozen attendance with **individual status and pupil notes**, counted once for teacher minutes, with strict idempotent replay and owner/schedule checks. A separate scheduler still leaves attendance unknown.
- **Workflow 2 — use chess material in a completed lesson:** Reviewed preview plus one transaction to reuse/create a typed chess material, create its session association and record independent **teacher-attested** participant stage evidence. It checks actual attendance, teacher ownership, date, revision, collision, idempotency and foreign IDs. No link or taught status is equated with skill mastery.
- **Read-side lesson memory:** The existing `ccp_coach_briefing_get`/website service now returns only the identified pupil's recorded attendance note (not another group member's private comments), with source IDs and known/unknown distinction.
- **Catalog discovery and quality:** `tools/list` now selects tools using actual OAuth scope, not the hint about read-only network behavior; guessed writes are scope-checked before schema validation. Accurate side-effect annotations, workflow-neutral initialization guidance, the source-derived 198-tool audit, context/ambiguity selection matrix and catalog-quality CI guard ship alongside the source.
- **Prior capabilities untouched:** PR #95 historical attendance dates vs scheduled lessons, advanced mixed imports, student/family spreadsheet onboarding, confidential CSV/ZIP export vs JSON restore; canonical corrections, family/guardian, calendar, lesson reports and financial/private operations retain their existing independently approved paths. Composite tools never silently send mail, charge or publish to Lichess.

## Acceptance evidence (exact merged main)

| Gate | GitHub Actions | Result |
| --- | --- | --- |
| CI — TypeScript, schemas, release helpers, static catalog, parity, units, lint, Docker/Compose | [run 44168139027](https://github.com/itshak/ChessCoachPal/actions/runs/44168139027) | **PASS** — 487 unit tests across 60 files, catalog 198/198, 78/78 teacher business route families, 42/42 additional workflow cases, 93/93 original parity cases |
| Authenticated website ↔ delegated OAuth MCP (synthetic teachers, browser and DB) | [run 44168139268](https://github.com/itshak/ChessCoachPal/actions/runs/44168139268) | **PASS** — 277 passing, five intentional skips, plus three separate scheduling repeats; includes late SQL child-failure complete rollback, existing-material reuse, cross-client replay, read-only grant discovery and pupil-note privacy |
| Security-history audit | [run 44168138614](https://github.com/itshak/ChessCoachPal/actions/runs/44168138614) | **PASS** |
| Self-host Compose fresh application | [run 44168139157](https://github.com/itshak/ChessCoachPal/actions/runs/44168139157) | **PASS** |
| Separate backup/restore smoke | [run 44168138711](https://github.com/itshak/ChessCoachPal/actions/runs/44168138711) | **PASS** |

The **original PR-head** full matrix also passed at `f4e1a70`: [CI](https://github.com/itshak/ChessCoachPal/actions/runs/44166646449), [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/44166646844), [security](https://github.com/itshak/ChessCoachPal/actions/runs/44166646336), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/44166646419) and [restore](https://github.com/itshak/ChessCoachPal/actions/runs/44166646346). Exact merged-main validation was separate, not assumed from PR checks.

## Deliberately separate blockers and boundaries

**The GitHub Release publication workflow is NOT green.** [Run 44168138986](https://github.com/itshak/ChessCoachPal/actions/runs/44168138986), including a retry, failed in its already-existing-tag lookup: it treated the pre-existing, published `v0.1.6` release as if the tag were unpublished, then rejected reuse of the older tag. The published release genuinely exists at a different, earlier source SHA. See [issue #98](https://github.com/itshak/ChessCoachPal/issues/98). This is **not** a passed publication gate; do not move, delete, reuse or republish the existing tag just to clear CI. The code-change's required development matrix above is independently green.

**This acceptance does NOT deploy or upgrade the running private-beta instance.** The additive SQL file `20261117190000_mcp_workflow_composition.sql` has been source-reviewed and tested with the fresh schema; an actual data-bearing Coolify deployment requires separately approved forward-only migration after off-host backup and isolated restore verification, with no reset of teacher/student data. `main` merge is not equivalent to a production rollout.

No paid token benchmark, smaller-model reliability claim, live ChatGPT/Claude plugin/client certification, public Plugin Directory publishing, real-money payment or external Lichess write was attempted. These are distinct product/release/operational gates, not conditions of this server implementation acceptance.

## Decision authority

ADR-0003 full website/MCP business parity remains binding. [ADR-0014](../../../../docs/adr/ADR-0014-mcp-workflow-composition.md) accepts the **workflow-first, granular-always-available** architecture. The generated [tool audit](../../../../docs/MCP_TOOL_WORKFLOW_AUDIT.md) remains a reviewable engineering artifact, not an instruction to artificially reduce the number of tools or a substitute for real-world vendor-model tests.
