# Change: expand-agent-coaching-tools (milestone 2 follow-on)

- **Status:** ACCEPTED / ARCHIVED (2026-11-08) — automated GitHub-only development acceptance on merged main; **not** a publication approval
- **Depends on:** [archived MCP/OAuth foundation](../2026-11-07-connect-chatgpt-and-claude/proposal.md), [core workflows](../2026-11-07-complete-coaching-workflows/proposal.md); chess resources from [add-chess-learning-basics](../2026-11-07-add-chess-learning-basics/proposal.md).
- **Live-client testing:** Explicitly **not** required to complete or archive this change. Moved to final local prepublication release checklist.

## Why

The initial MCP/OAuth gateway passed synthetic CI/E2E but deliberately exposed only search/list operations plus single-student attendance and session-note updates. The original milestone also promised common student/workplace/group CRUD, class enrollment, scheduling/rescheduling and selected learning resources. Those capabilities had **not** shipped in Milestone 2; this follow-on now delivers them in merged [PR #13](https://github.com/itshak/ChessCoachPal/pull/13), alongside Milestone 3's previously accepted learning tools.

## Scope

Expand the same typed teacher-bound domain operations into safe versioned MCP tools for authorized student/workplace/group create/edit/enrollment; session create/reschedule/cancel and notes; read/propose/link chess resources after milestone 3 adds their domain model. Preserve shared website parity, idempotency, optimistic revision checks, stable-ID disambiguation, audit receipts, permission scopes and confirmation for higher-impact operations. Exclude bulk/destructive actions unless the secure confirmation contract is fully implemented and tested; no unrestricted SQL, finance mutations or family messaging.

## Acceptance in GitHub

On a fresh synthetic Supabase database, GitHub Actions SHALL exercise every newly exposed tool via delegated OAuth and MCP: create/edit/read-back in the website, cross-teacher denial, ambiguity, retry and stale-revision behavior, safe errors, partial outage fallback and privacy-minimized receipt/log checks. Typecheck, unit, contract, security and Playwright workflows SHALL be passing on the merged main commit. The implementation is accepted/archived only with those automated results recorded in docs/STATUS.md.

**No live ChatGPT/Claude account required at this milestone.** The only manual actual-client test belongs to the final local sign-off immediately preceding the v0.1.0 release PR/version bump. Do not mark live compatibility verified until that happens.

## Accepted evidence (2026-11-08)

Main commit [e0d99bc](https://github.com/itshak/ChessCoachPal/commit/e0d99bc5429dbd639b6a8a3a613c34f8610ebc59): [CI 42430913653](https://github.com/itshak/ChessCoachPal/actions/runs/42430913653), [E2E 42430913743](https://github.com/itshak/ChessCoachPal/actions/runs/42430913743) (26 passed, 5 skipped), [security 42430913682](https://github.com/itshak/ChessCoachPal/actions/runs/42430913682), [Compose 42430913730](https://github.com/itshak/ChessCoachPal/actions/runs/42430913730), [backup/restore 42430913678](https://github.com/itshak/ChessCoachPal/actions/runs/42430913678) all passed. See [docs/STATUS.md](../../../../docs/STATUS.md) and the [applied canonical agent-tool spec](../../../specs/agent-tool-coverage/spec.md). Live ChatGPT/Claude clients have **not** been verified and remain a mandatory local final prepublication gate.
