# Historical student import and lifecycle (implementation in progress)

## Why
Teachers migrating two years of attendance must create active and archived learners without exceeding active quota, preserve evidence and avoid per-student MCP calls. The current spreadsheet importer supports atomic student/family batches but not archived state, source attendance or secure large-sheet references.

## Scope
1. Create students directly archived, with default active, in website and MCP shared transaction.
2. Extend spreadsheet preview/commit with explicit per-row archived state and strict invalid-status rejection.
3. Add a confirmed batch archive/reactivate preview and commit with stable IDs, revision guards, current enrollment and future-session blockers, transaction rollback and replay receipt.
4. Support historical attendance as a separate reviewed stage: source row provenance, exact dates vs aggregate-only evidence, timezone/workplace resolution, duplicate/ambiguous student review and no invented sessions.
5. Secure short-lived staged upload references for large CSV/XLSX inputs, rather than base64 over MCP gateway.
6. Keep parity between website and MCP and verify synthetic hosted quota, cross-tenant, replay, rollback and historical reporting.

## Decisions
- Global archive status is distinct from workplace enrollment and does not imply ending enrollment at every workplace.
- Never auto-archive a student who is active at another workplace.
- Import existing names conservatively; ambiguous names/aliases require review, never silent merges.
- Deletion is not part of bulk lifecycle.
- Existing live teacher databases must never be reset as a side effect of this change.

## Acceptance
Fresh canonical Supabase install, TypeScript, lint, unit tests, strict website↔MCP parity, authenticated E2E, security-history, self-host Compose and backup/restore must all pass on PR and merged-main commit. Live Claude and ChatGPT acceptance remains separately required.
