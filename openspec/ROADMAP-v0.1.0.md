# ChessCoachPal — OpenSpec roadmap to v0.1.0

**Status:** Proposed implementation roadmap · **updated:** 2026-11-07 · **version today:** 0.0.0 (unreleased)

## One release, five actionable changes

| Order | OpenSpec change | Outcome | Prerequisites |
| --- | --- | --- | --- |
| 1 | [complete-coaching-workflows](changes/complete-coaching-workflows/proposal.md) | Teacher can manage students, workplaces, groups, private and group sessions, notes and attendance end-to-end, entirely in the website | None; builds on draft [PR #1](https://github.com/itshak/ChessCoachPal/pull/1) |
| 2 | [connect-chatgpt-and-claude](changes/connect-chatgpt-and-claude/proposal.md) | Real authenticated ChatGPT/Claude tool clients operate on the same records, with safe writes and reconciliation | Coaching domain/service contracts from #1; security review concurrent |
| 3 | [add-chess-learning-basics](changes/add-chess-learning-basics/proposal.md) | Chess skill observations and selected study/resource links replace music-specific teaching semantics | Core student/session records from #1 |
| 4 | [remove-cognote-legacy-and-secure-data](changes/remove-cognote-legacy-and-secure-data/proposal.md) | Clean chess-only baseline, tested teacher isolation, privacy/licensing audits and reliable branding | Coordinate schema changes with #1; security findings gate #2 and #5 |
| 5 | [verify-self-hosting-and-release-v0-1-0](changes/verify-self-hosting-and-release-v0-1-0/proposal.md) | Verified fresh self-host, backup/restore, complete release gates and actual GitHub v0.1.0 release with sources and changelog | #1–#4 accepted and all release readiness checks passed |

The change numbers indicate **release outcomes**, not mandatory serial execution. #2, #3 and #4 may develop in parallel after the core shared contract is stable; #5 cannot be accepted until the other four are verified.

## Scope and decision rules

- The product is **agent-first**: real conversational data entry through ChatGPT and Claude is a v0.1.0 requirement, not an optional later enhancement. The website remains complete and functional without any AI subscription.
- Core entities: teacher-owned students, configurable workplaces, groups, individual and group teaching sessions, membership snapshots, per-student attendance, notes, chess observations and selected chess learning resources.
- Pre-1.0 code and schemas are **not compatible with CogNote or any previous ChessCoachPal version**, per [ADR-0001](../docs/adr/0001-pre1-breaking-changes.md). Edit the current fresh-install schema and remove inherited code outright. Do not implement old-schema migrations, legacy API aliases, dual reads, or backfills. Never silently reset real data.
- Shared Postgres/Supabase/RLS data model. AI clients never receive a service-role key; authorization and per-teacher ownership are mandatory.
- **Deferred beyond 0.1.0 unless separately approved:** full pay-contract and billing reconciliation engine, Lichess/Chess.com ratings synchronization, chessboard/engine, full Google/Notion integration adapters, multi-teacher organization SaaS, and advanced reporting. These are not hidden acceptance requirements of this release.
- Each active proposal has its own design, specification and tasks. Check a task only after code is merged to main **and** verification evidence (commit, CI run/test, manual client transcript where appropriate) is recorded in docs/STATUS.md. A draft PR is progress, not accepted completion.
- Do not archive a change merely because files exist; archive it only after all its scoped acceptance criteria have passed or explicitly supersede it without claiming implementation.

## Acceptance gates for first functional v0.1.0

1. A new teacher can start from a **fresh** self-hosted database, authenticate and complete the core website teaching flow.
2. Real ChatGPT and Claude clients can each execute authorized tools and the teacher can inspect/edit the resulting shared records in the website; ambiguous and duplicate requests are safe.
3. Chess-specific teaching notes, observations and external resource links operate without requiring a chess engine or vendor accounts.
4. Legacy music-only paths/dependencies/data disappear; RLS and authorization tests isolate teachers; privacy/history and third-party license review has documented evidence.
5. Docker startup, PostgreSQL + uploaded-object backup/restore, tests, build, browser E2E and release artifacts pass. Finish every item in [docs/RELEASING.md](../docs/RELEASING.md) before preparing the version.

## Evidence as of 2026-11-07

- **Merged main:** CogNote-derived baseline, initial ChessCoachPal brand, ADR-0001, GitHub Actions CI/release workflow, 0.0.0 development version. CI typecheck/unit/Docker/Compose pass in main run [42394424081](https://github.com/itshak/ChessCoachPal/actions/runs/42394424081).
- **Not passing:** main Playwright run [42394424153](https://github.com/itshak/ChessCoachPal/actions/runs/42394424153) had 22 passed, 5 skipped, 1 failed (PWA manifest requires two icons).
- **Draft only:** coaching [PR #1](https://github.com/itshak/ChessCoachPal/pull/1) adds preliminary schema/service/UI; its E2E run [42392868328](https://github.com/itshak/ChessCoachPal/actions/runs/42392868328) had 23 passed, 5 skipped, 1 failed (Workplace selector).
- **Unverified/not implemented:** native MCP/OAuth, tested ChatGPT/Claude integration, full security/privacy audit, backup/restore, complete chess learning features. The repository is public; an audit must not be assumed completed.

## Historical record

The superseded omnibus plan is **closed as an incomplete planning artifact**, with only evidenced work retained at [archive/2026-11-07-adopt-cognote-chesscoachpal](changes/archive/2026-11-07-adopt-cognote-chesscoachpal/proposal.md). Its old unchecked requirements and obsolete compatibility assumptions are **not** active OpenSpec acceptance criteria.

**Release ownership:** The final release is v0.1.0 only when the [release checklist](../docs/RELEASING.md) and these five scoped changes are complete. Until then keep package version 0.0.0 and no published release.

