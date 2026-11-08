# Change: enforce-mcp-website-functional-parity

**Status:** ACTIVE; PHASE A ACCEPTED, FULL PARITY NOT ACCEPTED. Dedicated owner of website↔MCP functional equality; separate from the [chess-specific narrative lesson/Lichess change](../support-conversational-lesson-and-lichess-workflows/proposal.md).

## Why
Teacher workflows in ChessCoachPal must be controllable from ChatGPT, Claude, Codex or another delegated MCP client. An optional website cannot offer unique teacher-owned business data/actions. The audited baseline has **43 teacher-business routes: 40 gaps, 3 partial, 0 fully verified**. The [93-case checklist](../../../docs/MCP_WEBSITE_PARITY_CHECKLIST.md) remains unchecked. Existing 28 MCP tools are a useful subset, not full parity.

## Deliverables
1. Accept and enforce [ADR-0003](../../../docs/adr/0003-mcp-website-business-parity.md): every new teacher website business feature gets a matching typed/scoped MCP tool and tests in the **same PR**; explicitly justified secure browser approval for credential-only steps.
2. CI gates: complete source inventory with HTTP methods and live tool references, mandatory evidence for complete routes, PR changed teacher-surface registry/MCP/E2E check, release strict failure on any gaps or any unchecked scenario.
3. First implementation slice: refactor `/api/coaching/report` to share one teacher-owned query with read-only `ccp_v1_reports_workplace_summary`, including CSV/text exports from `lib/coaching-report.ts`. Compare website vs OAuth/MCP values and deny foreign tenant requests in GitHub E2E.
4. Close **every remaining inventoried** teacher business action and field in subsequent focused increments: workplaces, students, groups, schedule, historical attendance, learning materials, progress, guardians, events, reports, billing, payments, settings and data transfer. Include safe read/list, typed write and human approval paths.
5. Verify all **93** browser↔MCP behavioral/security scenarios and all teacher-business route families on synthetic GitHub CI before allowing the versioned release gate to pass.

## Phases
- **A** Policy/guard, report summary and CSV/text adapter (this first PR).
- **B** All student/workplace identity/profile/aliases/rosters/skill and account fields.
- **C** Schedule/lessons/attendance/corrections and covered vs assigned learning materials.
- **D** Families/events/communications/studio policies with scoped explicit consent.
- **E** Billing, imports/exports, teacher settings and narrow provider-secret handoffs.
- **F** Full 93-case browser↔MCP suite, RLS and fresh-database validation, accepted merged-main evidence, archive.

**Boundaries:** No generic SQL, unbounded exports, cross-teacher queries, false "browser-only" waivers or unverified tool claims. Pre-1.0 schema changes follow ADR-0001, with no backward compatibility requirement. **Phase A needs no database reset.** Live ChatGPT/Claude acceptance is deferred to final local prepublication sign-off, not development CI.

**Acceptance:** OpenSpec remains active until every task, complete registry and all 93 cases are verified on merged main; green normal CI is insufficient.

## Accepted slice and outstanding work

**Phase A evidence (merged main):** [PR #20](https://github.com/itshak/ChessCoachPal/pull/20), commit [759f104](https://github.com/itshak/ChessCoachPal/commit/759f1042c351efba1fc7293bf0da48e71612bb23); [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42481967664) passed source audit, PR-guard tests, TypeScript, 342 unit tests, Docker and Compose; [fresh synthetic E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42481967709) passed (26 browser tests); [restore](https://github.com/itshak/ChessCoachPal/actions/runs/42481967696), [self-host](https://github.com/itshak/ChessCoachPal/actions/runs/42481967682), and [security](https://github.com/itshak/ChessCoachPal/actions/runs/42481967641) passed.

The source registry now includes 29 real MCP tools and 1 complete report route, but 39 teacher routes remain missing and 3 partial. **No approval of all 93 individual checklist scenarios is implied**; this OpenSpec stays active through phases B–F.

### Incremental Phase B delivery — dashboard and notifications

**Additional verified increment:** [PR #21](https://github.com/itshak/ChessCoachPal/pull/21) merged at [5a52fde](https://github.com/itshak/ChessCoachPal/commit/5a52fdeb47e11b0498f1d983adc2adb86bd97978). [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42485032664), [OAuth/browser E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42485032822), [self-host](https://github.com/itshak/ChessCoachPal/actions/runs/42485032685), [restore](https://github.com/itshak/ChessCoachPal/actions/runs/42485032699), and [security](https://github.com/itshak/ChessCoachPal/actions/runs/42485032780) all passed. E2E needed one retry after a transient Supabase Docker port collision on the shared runner; the subsequent full suite passed.

The source registry now lists 3 MCP-covered teacher routes, 3 partial and 37 gaps. All 93 detailed behavioral checklist scenarios remain unchecked; this change is **not** accepted or archived.


## Current status — 2026-11-09

[PR #42](https://github.com/itshak/ChessCoachPal/pull/42) merged as [d93b6ef](https://github.com/itshak/ChessCoachPal/commit/d93b6efb0c6f96d1f07e48640ee8e342af4e891b). Shared, bounded website/MCP lesson history now distinguishes old private lessons from coaching sessions, flags likely cross-model duplicates without deleting them, unions overlapping instructor minutes, and never guesses historic workplace attribution. PR-head GitHub CI, E2E, security, self-host and backup/restore workflows passed (see STATUS.md).

**No full acceptance:** Current registry = 43 route families have tools, 5 verified, 8 partial, 32 gaps. **0/93** detailed behavior/security scenarios are signed off. Cross-model mutations, report/material aggregates, transactionality and replay, external side effects, student lifecycle, and cross-tenant test evidence remain unresolved. Normal CI does not replace strict parity. Remain ACTIVE until the strict gate and complete checklist pass on merged main.
