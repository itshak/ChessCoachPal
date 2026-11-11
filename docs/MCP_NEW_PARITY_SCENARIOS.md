# New MCP ↔ website behavioral scenarios beyond the 93-case baseline

The original [93 historical cases](MCP_WEBSITE_PARITY_CHECKLIST.md) retain their
stable index and individual acceptance markers. This separate matrix tracks
new domain workflows introduced during the ChessCoachPal prelaunch consolidation.
Never mark a case checked until the exact-commit authenticated browser/MCP test
is green. New routes/fields require additional cases, not renaming old ones.

| Verified | New independently required behavior | Test and acceptance evidence |
| --- | --- | --- |
| - [x] | Atomically complete one canonical coaching lesson with every frozen learner's explicit attendance | **Accepted with 184 passed, five skipped, no failures:** `e2e/parity-session-completion.spec.ts#PARITY-sessions-complete-atomic`; stale revisions roll back the entire lesson; [exact-head E2E evidence](https://github.com/itshak/ChessCoachPal/actions/runs/43108081440) at `2309bd3`. |
| - [x] | Reject status-only coaching completion at website, delegated MCP and direct authenticated database boundary | **Accepted: 184 passed, five intentionally skipped, no failures** on [code commit `64ae2c9`](https://github.com/itshak/ChessCoachPal/commit/64ae2c9fd1bb048bb791b2d280293a6ed5f67fe5); [authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43119420118). `e2e/parity-session-completion.spec.ts#PARITY-completion-cannot-bypass` verifies website rejection, MCP rejection and authenticated raw SQL rejection; only the roster-atomic transaction marks completed. |
