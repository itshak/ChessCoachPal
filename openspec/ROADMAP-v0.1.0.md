# ChessCoachPal — OpenSpec roadmap to v0.1.0

**Status:** Milestones 1, 2 (tested MCP/OAuth foundation) and 3 archived; remaining tool coverage (2b), 4 and 5 active · **updated:** 2026-11-07 · **version today:** 0.0.0 (unreleased)

## One release, five actionable milestones

| Order | OpenSpec change | Outcome | Prerequisites |
| --- | --- | --- | --- |
| 1 | [complete-coaching-workflows](changes/archive/2026-11-07-complete-coaching-workflows/proposal.md) — **ACCEPTED** | Teacher-owned workplaces, students, group/private sessions, attendance, policy, notes and website workflow; [PR #4](https://github.com/itshak/ChessCoachPal/pull/4) merged | [CI 42407121579](https://github.com/itshak/ChessCoachPal/actions/runs/42407121579), [E2E 42407121512](https://github.com/itshak/ChessCoachPal/actions/runs/42407121512) |
| 2 | [connect-chatgpt-and-claude](changes/archive/2026-11-07-connect-chatgpt-and-claude/proposal.md) — **ARCHIVED VERIFIED FOUNDATION** | GitHub-tested MCP/OAuth with safe teacher-scoped reads, single attendance and lesson-note writes; actual platform compatibility reserved for final release | [PR #5](https://github.com/itshak/ChessCoachPal/pull/5), [main E2E 42412035415](https://github.com/itshak/ChessCoachPal/actions/runs/42412035415) |
| 2b | [expand-agent-coaching-tools](changes/expand-agent-coaching-tools/proposal.md) — **ACTIVE FOLLOW-ON** | Complete original v0.1.0 agent CRUD/scheduling/resource tool scope with automated GitHub E2E/security tests | #2 gateway, #1 domain, #3 learning resources |
| 3 | [add-chess-learning-basics](changes/archive/2026-11-07-add-chess-learning-basics/proposal.md) — **ACCEPTED** | Configurable chess categories, persisted/approved observation history, curated HTTPS/Lichess links and scoped MCP read/propose/link; [PR #7](https://github.com/itshak/ChessCoachPal/pull/7) merged | [CI 42415536708](https://github.com/itshak/ChessCoachPal/actions/runs/42415536708), [E2E 42415536816](https://github.com/itshak/ChessCoachPal/actions/runs/42415536816) |
| 4 | [remove-cognote-legacy-and-secure-data](changes/archive/2026-11-08-remove-cognote-legacy-and-secure-data/proposal.md) | Clean chess-only baseline, tested teacher isolation, privacy/licensing audits and reliable branding | Coordinate schema changes with #1; security findings gate #2 and #5 |
| 5 | [verify-self-hosting-and-release-v0-1-0](changes/verify-self-hosting-and-release-v0-1-0/proposal.md) | Verified fresh self-host, backup/restore, complete release gates and actual GitHub v0.1.0 release with sources and changelog | #1–#4 accepted and all release readiness checks passed |

The five high-level milestone numbers indicate **release outcomes**, not mandatory serial execution. The extra 2b OpenSpec change preserves unfinished work from the archived Milestone 2 gateway and counts as the **remaining development portion of milestone 2**, not a sixth independently required milestone outcome. Remaining development changes 2b and 4 may proceed concurrently; Milestone 5 cannot publish until they have been automatically verified and accepted on GitHub and final local client sign-off is recorded.

**Development-versus-release boundary (binding):** All implementation and verification for Milestones 2b, 3 and 4 runs in GitHub Actions with synthetic identities/data; it does not depend on ChatGPT or Claude credentials, real Lichess availability, a developer's local computer or manually demonstrating a provider. **Exactly one manual platform check is deferred to the last step before actually publishing v0.1.0:** on the maintainer's machine, connect both real ChatGPT and Claude clients to a locally controlled synthetic ChessCoachPal instance made reachable through HTTPS, verify delegated tool calls/website correction and record sanitized results. The final release PR and version bump must not merge before this manual sign-off. GitHub automatically runs its release gates and publishes only after approval; no actual provider session is needed inside GitHub Actions.

## Scope and decision rules

- The product is **agent-first**: real conversational data entry through ChatGPT and Claude is a v0.1.0 requirement, not an optional later enhancement. The website remains complete and functional without any AI subscription.
- Core entities: teacher-owned students, configurable workplaces, groups, individual and group teaching sessions, membership snapshots, per-student attendance, notes, chess observations and selected chess learning resources.
- Pre-1.0 code and schemas are **not compatible with CogNote or any previous ChessCoachPal version**, per [ADR-0001](../docs/adr/0001-pre1-breaking-changes.md). Edit the current fresh-install schema and remove inherited code outright. Do not implement old-schema migrations, legacy API aliases, dual reads, or backfills. Never silently reset real data.
- Shared Postgres/Supabase/RLS data model. AI clients never receive a service-role key; authorization and per-teacher ownership are mandatory.
- **Deferred beyond 0.1.0 unless separately approved:** full pay-contract and billing reconciliation engine, Lichess/Chess.com ratings synchronization, chessboard/engine, full Google/Notion integration adapters, multi-teacher organization SaaS, and advanced reporting. These are not hidden acceptance requirements of this release.
- Each active development proposal has its own design, specification and tasks. Check a development task only after code is merged to main **and** passing GitHub Actions evidence (commit and run URL) is recorded in docs/STATUS.md. No actual-provider transcript is needed to accept/archive a development change; that evidence belongs exclusively to Milestone 5 immediately before v0.1.0 publication. A draft PR is progress, not acceptance.
- Do not archive a change merely because files exist; archive it only after all its scoped acceptance criteria have passed or explicitly supersede it without claiming implementation.

## Acceptance gates for first functional v0.1.0

1. A new teacher can start from a **fresh** self-hosted database, authenticate and complete the core website teaching flow.
2. Automated GitHub MCP/OAuth security and tool-contract coverage passes for the implemented scope. **Immediately before the actual v0.1.0 publication**, the maintainer manually connects real ChatGPT and Claude clients from their machine to an HTTPS-reachable local synthetic instance, verifies authorized write + website correction, and records sanitized release-only acceptance; this is not an early development test.
3. Chess-specific teaching notes, observations and external resource links operate without requiring a chess engine or vendor accounts.
4. Legacy music-only paths/dependencies/data disappear; RLS and authorization tests isolate teachers; privacy/history and third-party license review has documented evidence.
5. Docker startup, PostgreSQL + uploaded-object backup/restore, tests, build, browser E2E and release artifacts pass. Finish every item in [docs/RELEASING.md](../docs/RELEASING.md) before preparing the version.

## Evidence as of 2026-11-07

- **Merged main:** CogNote-derived baseline, initial ChessCoachPal brand, ADR-0001, GitHub Actions CI/release workflow, 0.0.0 development version. CI typecheck/unit/Docker/Compose pass in main run [42394424081](https://github.com/itshak/ChessCoachPal/actions/runs/42394424081).
- **Milestone 1 accepted:** [PR #4](https://github.com/itshak/ChessCoachPal/pull/4) merged as main commit [a87fb63](https://github.com/itshak/ChessCoachPal/commit/a87fb63a8440a358d039187be48fce5a14609e36); [CI 42407121579](https://github.com/itshak/ChessCoachPal/actions/runs/42407121579) passed typecheck/unit/Docker/Compose, [E2E 42407121512](https://github.com/itshak/ChessCoachPal/actions/runs/42407121512) passed 25 browser tests, 5 skipped, fresh synthetic Supabase database. The PWA and coaching selectors have been fixed.
- **Superseded:** coaching [PR #1](https://github.com/itshak/ChessCoachPal/pull/1) closed unmerged and replaced by accepted PR #4.
- **Milestone 2 foundation archived, tested on main:** [PR #5](https://github.com/itshak/ChessCoachPal/pull/5) merged as [77b307f](https://github.com/itshak/ChessCoachPal/commit/77b307fb6055fd55fd0d74519ff6e04ccea61ffe); [post-merge CI 42412035420](https://github.com/itshak/ChessCoachPal/actions/runs/42412035420) and [post-merge E2E 42412035415](https://github.com/itshak/ChessCoachPal/actions/runs/42412035415) passed (26 browser tests, 5 skipped). Synthetic OAuth/MCP, two-teacher isolation, ambiguity, expiry, refresh, revocation and website parity are verified. The broader original tool scope is not falsely marked complete: follow [2b](changes/expand-agent-coaching-tools/proposal.md). Actual ChatGPT/Claude tests remain a **final local publication gate only**.
- **Milestone 3 accepted on main:** [PR #7](https://github.com/itshak/ChessCoachPal/pull/7) merged as [822a33f](https://github.com/itshak/ChessCoachPal/commit/822a33f0881821c1de479629bf15d39264d2dcc1). [CI 42415536708](https://github.com/itshak/ChessCoachPal/actions/runs/42415536708) passed and [E2E 42415536816](https://github.com/itshak/ChessCoachPal/actions/runs/42415536816) passed 28 synthetic browser tests, 5 skipped. No live providers; final local ChatGPT/Claude sign-off is only at publication.
- **Unverified/not complete:** real ChatGPT/Claude interoperability (intentionally deferred to final local release sign-off), v0.1.0 tool expansion (2b), final historical Actions/PII/privacy publication approval, backup/restore and release checks. The repository is public; an audit must not be assumed completed.

## Historical record

The superseded omnibus plan is **closed as an incomplete planning artifact**, with only evidenced work retained at [archive/2026-11-07-adopt-cognote-chesscoachpal](changes/archive/2026-11-07-adopt-cognote-chesscoachpal/proposal.md). Its old unchecked requirements and obsolete compatibility assumptions are **not** active OpenSpec acceptance criteria.

**Release ownership:** The final release is v0.1.0 only when the [release checklist](../docs/RELEASING.md), all automated development changes (including 2b), and the last-minute *manual local* ChatGPT/Claude acceptance have been satisfied. Until then keep package version 0.0.0 and do not publish. Real-client manual acceptance is not a blocker for archiving earlier development changes.

