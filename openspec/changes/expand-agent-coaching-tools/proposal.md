# Change: expand-agent-coaching-tools (milestone 2 follow-on)

- **Status:** Proposed — **GitHub-automated development gate** for v0.1.0
- **Depends on:** [archived MCP/OAuth foundation](../archive/2026-11-07-connect-chatgpt-and-claude/proposal.md), [core workflows](../archive/2026-11-07-complete-coaching-workflows/proposal.md); chess resources from [add-chess-learning-basics](../add-chess-learning-basics/proposal.md).
- **Live-client testing:** Explicitly **not** required to complete or archive this change. Moved to final local prepublication release checklist.

## Why

The initial MCP/OAuth gateway passed synthetic CI/E2E but deliberately exposed only search/list operations plus single-student attendance and session-note updates. The original milestone also promised common student/workplace/group CRUD, class enrollment, scheduling/rescheduling and selected learning resources. Those capabilities have **not** been shipped and must not be lost when archiving the verified foundation.

## Scope

Expand the same typed teacher-bound domain operations into safe versioned MCP tools for authorized student/workplace/group create/edit/enrollment; session create/reschedule/cancel and notes; read/propose/link chess resources after milestone 3 adds their domain model. Preserve shared website parity, idempotency, optimistic revision checks, stable-ID disambiguation, audit receipts, permission scopes and confirmation for higher-impact operations. Exclude bulk/destructive actions unless the secure confirmation contract is fully implemented and tested; no unrestricted SQL, finance mutations or family messaging.

## Acceptance in GitHub

On a fresh synthetic Supabase database, GitHub Actions SHALL exercise every newly exposed tool via delegated OAuth and MCP: create/edit/read-back in the website, cross-teacher denial, ambiguity, retry and stale-revision behavior, safe errors, partial outage fallback and privacy-minimized receipt/log checks. Typecheck, unit, contract, security and Playwright workflows SHALL be passing on the merged main commit. The implementation is accepted/archived only with those automated results recorded in docs/STATUS.md.

**No live ChatGPT/Claude account required at this milestone.** The only manual actual-client test belongs to the final local sign-off immediately preceding the v0.1.0 release PR/version bump. Do not mark live compatibility verified until that happens.
