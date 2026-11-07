# Tasks — expand-agent-coaching-tools

**All implementation/verification here is automated on GitHub.** Record merged commit and passing Actions URLs in docs/STATUS.md before checking any box or archiving. Never require access to live ChatGPT/Claude as a development gate; their one-time manual test is in release milestone 5.

- [ ] 2b.1 Extend typed, shared domain/MCP contracts and generated discovery/OpenAPI for the planned v0.1.0 actions.
- [ ] 2b.2 Add teacher-scoped workplace create/update and student create/update/enrollment tools with validation, idempotency and website parity.
- [ ] 2b.3 Add group create/update and member enroll/remove tools with foreign-ID and cross-workplace protection.
- [ ] 2b.4 Add lesson search/details, create/reschedule/cancel and notes tools, preserving UTC/DST, frozen rosters and conflict checks.
- [ ] 2b.5 After chess-learning basics ship, expose teacher-scoped learning observation and resource read/propose/link tools with safe URL validation and provenance.
- [ ] 2b.6 Require stable-ID disambiguation and typed NEEDS_RESOLUTION/CONFLICT/UNAUTHENTICATED responses for every relevant action.
- [ ] 2b.7 Add atomic idempotency receipts, optimistic revisions and actor/client IDs to privacy-minimized audit metadata for each write; prove retries cannot duplicate changes.
- [ ] 2b.8 Implement payload-bound expiring confirmation for any intentionally exposed bulk/destructive action, or **explicitly omit** it from discovery; no unsafe default.
- [ ] 2b.9 Extend GitHub Actions fresh Supabase + Playwright tests for each tool, two-teacher isolation, scope denial, wrong workplace, concurrency, token lifecycle, missing data and provider outage website fallback.
- [ ] 2b.10 Document exact supported MCP tool names, limits and automated evidence; update canonical specs and archive only after all scoped GitHub gates pass.

**Outside this change:** Real ChatGPT/Claude tests are **manual only at local v0.1.0 prepublication sign-off**, never a blocker for this development change.
