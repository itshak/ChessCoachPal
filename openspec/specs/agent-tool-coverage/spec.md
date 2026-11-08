# Applied specification — delegated agent coaching-tool coverage

**Status:** Implemented by merged [PR #13](https://github.com/itshak/ChessCoachPal/pull/13) on main commit [e0d99bc](https://github.com/itshak/ChessCoachPal/commit/e0d99bc5429dbd639b6a8a3a613c34f8610ebc59), with synthetic GitHub Actions verification. This is **not** live ChatGPT/Claude interoperability acceptance.

## Requirement: Teacher-owned coaching read and write contracts

ChessCoachPal SHALL expose the exact versioned MCP tool catalogue recorded in [AI_CONNECTORS.md](../../../docs/AI_CONNECTORS.md). The catalogue SHALL support workplace and student create/update, workplace enrollment, group create/update and membership changes, one-to-one and group lesson creation/rescheduling/cancellation, and session details, alongside the foundation's attendance/note commands and learning observations/resources from Milestone 3. All writes SHALL use stable teacher-scoped identifiers and typed Zod validation; unrecognized, guessed, or unauthorized IDs SHALL NOT access another teacher's records.

### Scenario: Teacher schedules and edits a group lesson through MCP
A synthetic OAuth-authorized teacher SHALL be able to create a workplace, student, group and enrollment, schedule a nonoverlapping group lesson with an explicit-offset timestamp, view a frozen participant roster, reschedule it, make a website correction, and cancel it. Removing live group membership SHALL NOT rewrite historical session rosters.

## Requirement: Safe transactional coaching changes

Coaching mutations SHALL use a delegated teacher JWT, explicit owner checks, idempotency keys and atomically persisted minimal receipts (IDs, revision, actor, client and timestamp, not student text or credentials). Revising existing records SHALL require an exact expected revision. A replay with matching payload SHALL return its original receipt; the same key with changed arguments SHALL return CONFLICT. Stale revisions and conflicting lesson intervals SHALL be rejected without partial writes. A duplicate name search SHALL return NEEDS_RESOLUTION rather than guessing.

### Scenario: Conflict and access failure
A stale website/MCP revision, cross-teacher ID, cross-workplace group or a colliding session time SHALL be rejected and SHALL NOT overwrite another record or duplicate a transaction.

## Requirement: Delegated scopes and bounded mutations

The server SHALL filter tool discovery and invocation by delegated `coach:read` and `coach:write` scopes. One-record membership removal, session rescheduling and cancellation SHALL require explicit confirmation. The catalogue SHALL NOT expose unconfirmed bulk/destructive writes, unrestricted SQL, financial changes, parent notifications or automatic chess-observation approval. Learning links SHALL remain validated HTTPS references, not fetched remote payloads.

### Scenario: Read-only client and revoked client
A read-only synthetic OAuth client SHALL list reads but not discover or invoke writes. Expired, rotated or revoked credentials SHALL not authorize the MCP endpoint. Ordinary website coaching SHALL continue independently of any AI provider availability.

## Requirement: Automated acceptance with local live release gate

GitHub Actions SHALL use synthetic teachers and fresh Supabase to run production build, typecheck, unit tests, OAuth PKCE exchange/refresh/revocation, MCP tool contracts, two-teacher isolation, wrong workplace IDs, retry safety, revisions, concurrent schedule conflicts, website readback, safe learning URLs and no-provider fallback. Actual authenticated ChatGPT and Claude writes SHALL remain a **sole final local prepublication test** by the maintainer immediately before v0.1.0; no source claim shall assert that test has passed.

**Compatibility:** No compatibility with CogNote or any earlier ChessCoachPal 0.x install per [ADR-0001](../../../docs/adr/0001-pre1-breaking-changes.md); never auto-reset user data.
