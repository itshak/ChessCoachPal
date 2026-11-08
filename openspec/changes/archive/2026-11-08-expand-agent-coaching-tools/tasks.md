# Tasks — expand-agent-coaching-tools

**All implementation/verification here is automated on GitHub.** Record merged commit and passing Actions URLs in docs/STATUS.md before checking any box or archiving. Never require access to live ChatGPT/Claude as a development gate; their one-time manual test is in release milestone 5.

- [x] 2b.1 Extend typed, shared domain/MCP contracts and generated discovery/OpenAPI for the planned v0.1.0 actions.
- [x] 2b.2 Add teacher-scoped workplace create/update and student create/update/enrollment tools with validation, idempotency and website parity.
- [x] 2b.3 Add group create/update and member enroll/remove tools with foreign-ID and cross-workplace protection.
- [x] 2b.4 Add lesson search/details, create/reschedule/cancel and notes tools, preserving UTC/DST, frozen rosters and conflict checks.
- [x] 2b.5 After chess-learning basics ship, expose teacher-scoped learning observation and resource read/propose/link tools with safe URL validation and provenance. **Delivered by merged Milestone 3 [PR #7](https://github.com/itshak/ChessCoachPal/pull/7); [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42415536708), [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42415536816).** Remaining 2b writes, audit/idempotency and broader contracts are still open.
- [x] 2b.6 Require stable-ID disambiguation and typed NEEDS_RESOLUTION/CONFLICT/UNAUTHENTICATED responses for every relevant action.
- [x] 2b.7 Add atomic idempotency receipts, optimistic revisions and actor/client IDs to privacy-minimized audit metadata for each write; prove retries cannot duplicate changes.
- [x] 2b.8 Implement payload-bound expiring confirmation for any intentionally exposed bulk/destructive action, or **explicitly omit** it from discovery; no unsafe default.
- [x] 2b.9 Extend GitHub Actions fresh Supabase + Playwright tests for each tool, two-teacher isolation, scope denial, wrong workplace, concurrency, token lifecycle, missing data and provider outage website fallback.
- [x] 2b.10 Document exact supported MCP tool names, limits and automated evidence; update canonical specs and archive only after all scoped GitHub gates pass.

**Outside this change:** Real ChatGPT/Claude tests are **manual only at local v0.1.0 prepublication sign-off**, never a blocker for this development change.
\n**Acceptance:** All scoped tasks have merged-main evidence on [e0d99bc](https://github.com/itshak/ChessCoachPal/commit/e0d99bc5429dbd639b6a8a3a613c34f8610ebc59): [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42430913653), [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42430913743), [security](https://github.com/itshak/ChessCoachPal/actions/runs/42430913682), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/42430913730), [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/42430913678); statuses and coverage recorded in [docs/STATUS.md](../../../../docs/STATUS.md). **All test identities and HTTP clients were synthetic.** The final local real ChatGPT/Claude trial is neither completed nor waived and is an explicit release-only blocker.\n