# New MCP ↔ website behavioral scenarios beyond the 93-case baseline

The original [93 historical cases](MCP_WEBSITE_PARITY_CHECKLIST.md) retain their
stable index and individual acceptance markers. This separate matrix tracks
new domain workflows introduced during the ChessCoachPal prelaunch consolidation.
Never mark a case checked until the exact-commit authenticated browser/MCP test
is green. New routes/fields require additional cases, not renaming old ones.

| Verified | New independently required behavior | Test and acceptance evidence |
| --- | --- | --- |
| - [ ] | Atomically complete one canonical coaching lesson with every frozen learner's explicit attendance | **Candidate awaiting exact-head authenticated browser/MCP E2E:** `e2e/parity-session-completion.spec.ts#PARITY-sessions-complete-atomic`; stale expected revisions must roll back the entire lesson. |
