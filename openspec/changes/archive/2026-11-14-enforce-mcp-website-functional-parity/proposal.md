> **Dependency gate (2026-11-12):** Implement [consolidate-canonical-lessons-and-attendance](../2026-11-13-consolidate-canonical-lessons-and-attendance/proposal.md) first. This prerequisite owns removal of duplicate lesson/attendance physical models and transfer of all calendar, finance, portal, notes and reporting consumers. Resume this parity change after cutover; it retains ownership of all 93 historical and new scenarios, strict merged-main parity and final archive. Do not mark B3/B5/B6 or C1–C3 complete based solely on the cutover.

# Change: enforce-mcp-website-functional-parity

**Status:** ARCHIVED — accepted on merged main, 2026-11-14. All 59 teacher route families, 93 original cases and 26 additional chess/canonical scenarios verified; v0.1.0 live-client publication remains separate. Dedicated owner of website↔MCP functional equality; separate from the [chess-specific narrative lesson/Lichess change](../../support-conversational-lesson-and-lichess-workflows/proposal.md).

## Why
Teacher workflows in ChessCoachPal must be controllable from ChatGPT, Claude, Codex or another delegated MCP client. An optional website cannot offer unique teacher-owned business data/actions. The audited baseline has **43 teacher-business routes: 40 gaps, 3 partial, 0 fully verified**. The [93-case checklist](../../../../docs/MCP_WEBSITE_PARITY_CHECKLIST.md) remains unchecked. Existing 28 MCP tools are a useful subset, not full parity.

## Deliverables
1. Accept and enforce [ADR-0003](../../../../docs/adr/0003-mcp-website-business-parity.md): every new teacher website business feature gets a matching typed/scoped MCP tool and tests in the **same PR**; explicitly justified secure browser approval for credential-only steps.
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

**Acceptance:** OpenSpec remains active until every task, complete registry and all 93 original plus 26 new cases are verified on merged main; green normal CI is insufficient. The complete development candidate is tested on GitHub Actions, but does not replace exact merged-main proof. Live real-client publication checks remain separate.

## Accepted slice and outstanding work

**Phase A evidence (merged main):** [PR #20](https://github.com/itshak/ChessCoachPal/pull/20), commit [759f104](https://github.com/itshak/ChessCoachPal/commit/759f1042c351efba1fc7293bf0da48e71612bb23); [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42481967664) passed source audit, PR-guard tests, TypeScript, 342 unit tests, Docker and Compose; [fresh synthetic E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42481967709) passed (26 browser tests); [restore](https://github.com/itshak/ChessCoachPal/actions/runs/42481967696), [self-host](https://github.com/itshak/ChessCoachPal/actions/runs/42481967682), and [security](https://github.com/itshak/ChessCoachPal/actions/runs/42481967641) passed.

The source registry now includes 29 real MCP tools and 1 complete report route, but 39 teacher routes remain missing and 3 partial. **No approval of all 93 individual checklist scenarios is implied**; this OpenSpec stays active through phases B–F.

### Incremental Phase B delivery — dashboard and notifications

**Additional verified increment:** [PR #21](https://github.com/itshak/ChessCoachPal/pull/21) merged at [5a52fde](https://github.com/itshak/ChessCoachPal/commit/5a52fdeb47e11b0498f1d983adc2adb86bd97978). [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42485032664), [OAuth/browser E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42485032822), [self-host](https://github.com/itshak/ChessCoachPal/actions/runs/42485032685), [restore](https://github.com/itshak/ChessCoachPal/actions/runs/42485032699), and [security](https://github.com/itshak/ChessCoachPal/actions/runs/42485032780) all passed. E2E needed one retry after a transient Supabase Docker port collision on the shared runner; the subsequent full suite passed.

The source registry now lists 3 MCP-covered teacher routes, 3 partial and 37 gaps. All 93 detailed behavioral checklist scenarios remain unchecked; this change is **not** accepted or archived.


## Current status — 2026-11-09

[PR #42](https://github.com/itshak/ChessCoachPal/pull/42) merged as [d93b6ef](https://github.com/itshak/ChessCoachPal/commit/d93b6efb0c6f96d1f07e48640ee8e342af4e891b). Shared, bounded website/MCP lesson history now distinguishes old private lessons from coaching sessions, flags likely cross-model duplicates without deleting them, unions overlapping instructor minutes, and never guesses historic workplace attribution. PR-head GitHub CI, E2E, security, self-host and backup/restore workflows passed (see STATUS.md).

**No full acceptance:** Current registry = 43 route families have tools, 5 verified, 8 partial, 32 gaps. **0/93** detailed behavior/security scenarios are signed off. Cross-model mutations, report/material aggregates, transactionality and replay, external side effects, student lifecycle, and cross-tenant test evidence remain unresolved. Normal CI does not replace strict parity. Remain ACTIVE until the strict gate and complete checklist pass on merged main.


## Final archived acceptance — 2026-11-14

Source [merged-main `07ebb4d2e1ea92aca72fb0c231b5bf9092aea5e0`](https://github.com/itshak/ChessCoachPal/commit/07ebb4d2e1ea92aca72fb0c231b5bf9092aea5e0): [strict CI](https://github.com/itshak/ChessCoachPal/actions/runs/43617008893), [authenticated browser/delegated MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43617008841) (**235 passed, 5 intentionally skipped, zero failed**), [security history audit](https://github.com/itshak/ChessCoachPal/actions/runs/43617008878), [self-host Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43617008758), and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43617008870), all successful. The branch-source acceptance also passed [236 browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43616266395) and [strict CI](https://github.com/itshak/ChessCoachPal/actions/runs/43616266397).

This change is implemented and its delta requirements are applied at [teacher-mcp-parity](../../../specs/teacher-mcp-parity/spec.md). The canonical attendance prerequisite was archived separately. No historical CogNote attendance compatibility or live customer-data migration is provided; the pre-v1.0 fresh-install contract remains in force. Real ChatGPT/Claude sign-off is reserved for the final v0.1.0 publication gate.
