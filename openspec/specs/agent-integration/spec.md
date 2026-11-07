# Applied agent-integration specification — GitHub-verified foundation

**Source:** [archived connect-chatgpt-and-claude change](../../changes/archive/2026-11-07-connect-chatgpt-and-claude/specs/agent-integration/spec.md). This is the current *implemented safe subset*; the archive is not an assertion of live ChatGPT/Claude interoperability.

ChessCoachPal SHALL provide a discoverable versioned HTTP MCP tool gateway with delegated teacher OAuth PKCE, scoped short-lived credentials and revocation, no service-role credential exposure, teacher-scoped record queries, and guarded individual attendance/session-note writes using stable IDs, optimistic revisions, idempotency and minimal receipts. Unsupported bulk/destructive tools SHALL remain unavailable. The website SHALL work without either AI provider.

**Automated scenarios:** GitHub Actions fresh synthetic database and browser tests SHALL verify token exchange and replay denial, discoverability, correct attendance/note persistence through the website, cross-teacher isolation, ambiguity, stale revision rejection, retry safety, token refresh/expiry and revocation.

**Not applied yet:** [broader coaching action catalogue](../../changes/expand-agent-coaching-tools/specs/agent-tool-coverage/spec.md) remains an active change. Live ChatGPT and Claude demonstrations SHALL happen only during the [final local v0.1.0 prepublication gate](../../changes/verify-self-hosting-and-release-v0-1-0/specs/first-release/spec.md), not as a precondition to archiving this automated milestone.
