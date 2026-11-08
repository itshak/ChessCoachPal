# Change: enforce-mcp-website-functional-parity

**Status:** APPLYING / NOT ACCEPTED. Dedicated owner of website↔MCP functional equality; separate from the [chess-specific narrative lesson/Lichess change](../support-conversational-lesson-and-lichess-workflows/proposal.md).

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
