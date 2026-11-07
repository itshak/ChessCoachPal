# Agent integration — archived verified initial foundation

**Archival disposition (2026-11-07):** The *verified initial MCP/OAuth gateway* is accepted as a GitHub-CI-tested development foundation, **not** a claim that every item in the original proposal has shipped. Main merge [PR #5](https://github.com/itshak/ChessCoachPal/pull/5), commit [77b307f](https://github.com/itshak/ChessCoachPal/commit/77b307fb6055fd55fd0d74519ff6e04ccea61ffe), post-merge [CI 42412035420](https://github.com/itshak/ChessCoachPal/actions/runs/42412035420) and [E2E 42412035415](https://github.com/itshak/ChessCoachPal/actions/runs/42412035415) (26 passed, 5 skipped) provide automated evidence. **Unimplemented CRUD/scheduling/learning-resource tools and additional automated hardening are transferred to [expand-agent-coaching-tools](../../../../expand-agent-coaching-tools/proposal.md); all actual ChatGPT and Claude client checks are moved to the *final local prepublication sign-off* in [Milestone 5](../../../../verify-self-hosting-and-release-v0-1-0/proposal.md).** Real client interoperability remains unverified. No local/manual tests are required to close development milestones; only the final v0.1.0 publication has that manual gate.

## Applied and automated-verified requirements

### Requirement: Teacher-delegated discoverable MCP gateway
The app SHALL expose a versioned MCP JSON-RPC HTTP endpoint, with tool schemas and OpenAPI derived from a typed catalogue. Authorization SHALL be bound to an authenticated teacher, support PKCE, scoped, short-lived and revocable credentials, and SHALL never expose service-role credentials.

#### Scenario: Synthetic client connects
- **WHEN** a synthetic client registers, receives teacher approval and exchanges a valid PKCE authorization code in a GitHub Actions fresh-stack test
- **THEN** discovery and allowed tool calls SHALL work for that teacher only
- **AND** invalid/replayed authorization codes, expired tokens and revoked grants SHALL fail.

### Requirement: Safe first coaching tool subset
The service SHALL list authorized workplaces, students, groups, lessons and frozen lesson participants, and SHALL support **single-participant** attendance writes and lesson-note updates with a required stable ID, idempotency key, revision check and minimal privacy-safe receipt. Bulk and destructive actions SHALL not be available without a separately tested confirmation protocol.

#### Scenario: Duplicate or stale write
- **WHEN** an identical write is retried or a stale revision is supplied
- **THEN** the same write SHALL not be duplicated and stale updates SHALL be rejected as CONFLICT.

### Requirement: Automated teacher isolation and website fallback
All exposed tools SHALL enforce ownership and SHALL NOT return another teacher's protected data. The website SHALL remain useful without an AI provider.

#### Scenario: Another teacher's session
- **WHEN** a delegated synthetic client requests a foreign session ID
- **THEN** no foreign record SHALL be returned or changed.

## Deferred, still binding elsewhere

- **Remaining v0.1.0 tool actions and advanced security tests:** [expand-agent-coaching-tools](../../../../expand-agent-coaching-tools/specs/agent-tool-coverage/spec.md).
- **Real ChatGPT and Claude compatibility and final authorization/website correction:** [release-only manual acceptance](../../../../verify-self-hosting-and-release-v0-1-0/specs/first-release/spec.md). Run on the maintainer's machine directly before publication, never as a requirement for GitHub development CI or the completion of this archived foundation.
