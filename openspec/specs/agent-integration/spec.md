# Applied agent-integration specification — GitHub-verified foundation

**Source:** [archived connect-chatgpt-and-claude change](../../changes/archive/2026-11-07-connect-chatgpt-and-claude/specs/agent-integration/spec.md). This is the current *implemented safe subset*; the archive is not an assertion of live ChatGPT/Claude interoperability.

ChessCoachPal SHALL provide a discoverable versioned HTTP MCP tool gateway with delegated teacher OAuth PKCE, scoped short-lived credentials and revocation, no service-role credential exposure, teacher-scoped record queries, and guarded individual attendance/session-note writes using stable IDs, optimistic revisions, idempotency and minimal receipts. Unsupported bulk/destructive tools SHALL remain unavailable. The website SHALL work without either AI provider.

**Automated scenarios:** GitHub Actions fresh synthetic database and browser tests SHALL verify token exchange and replay denial, discoverability, correct attendance/note persistence through the website, cross-teacher isolation, ambiguity, stale revision rejection, retry safety, token refresh/expiry and revocation.

**Milestone 3 extension applied:** [chess-learning requirements](../chess-learning/spec.md) and [PR #7](https://github.com/itshak/ChessCoachPal/pull/7) add teacher-scoped categories/observations/resource reads, unverified observation proposals, and curated HTTPS/Lichess resource links through delegated MCP. No MCP approval or verified-observation edit is exposed; a teacher must review and approve in the website. GitHub synthetic [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42415536708) and [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42415536816) passed.

**Milestone 2b applied:** [expanded coaching actions](../agent-tool-coverage/spec.md) add teacher-owned workplace/student/group CRUD, enrollment, session details/create/reschedule/cancel, transactional idempotency receipts, optimistic revisions and permission-scoped discovery. [PR #13](https://github.com/itshak/ChessCoachPal/pull/13) merged as [e0d99bc](https://github.com/itshak/ChessCoachPal/commit/e0d99bc5429dbd639b6a8a3a613c34f8610ebc59). Live ChatGPT and Claude demonstrations SHALL happen only during the [final local v0.1.0 prepublication gate](../../changes/archive/2026-11-08-finalize-v0-1-0-publication/proposal.md), not as a precondition to archiving this automated milestone.

## Current MCP discoverability and dispatch extension (2026-11-15)

The historical Milestone 2 implementation above describes its **then-current** subset and `versioned` wording; it does not override the **current unversioned** `ccp_<domain>_<action>` contract ([ADR-0006](../../../docs/adr/0006-unversioned-mcp-tool-names.md)). Existing `/mcp` must expose one canonical client-discoverable root-object schema, not a separate compatibility schema. Website and MCP SHALL use the same core typed service and permissions, and the MCP dispatch SHALL pass every allowed field.

### Requirement: Actual tool discovery and success SHALL be independently demonstrated

- **WHEN** connector settings enumerate 88 read/95 write tools but an actual Claude conversation cannot load `ccp_learning_materials_create` using deferred ToolSearch **THEN** the engineer SHALL inspect the current deployed SHA, `tools/list`, root schema and exact-name search in a fresh conversation; source inventory alone SHALL NOT count as acceptance.
- **WHEN** a tool is loaded, invoked and returns a receipt **THEN** an independent read SHALL verify persisted fields, revision and tenant identity, including nested material details, voided history and reports.
- **WHEN** a new optional field is accepted in the schema **THEN** test it with a non-default value through `tools/call` → dispatcher → core service → database and website read-back, rather than accepting compilation as proof.
- **WHEN** Claude succeeds **THEN** ChatGPT acceptance remains separate until actually exercised.

See [ADR-0007](../../../docs/adr/0007-mcp-supabase-contract-and-release-evidence.md) and the [portable runbook](../../../docs/MCP_SUPABASE_RELIABILITY_PLAYBOOK.md).

