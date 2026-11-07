# Design — authenticated external AI tools (archived initial gateway)

**Archival disposition (2026-11-07):** The *verified initial MCP/OAuth gateway* is accepted as a GitHub-CI-tested development foundation, **not** a claim that every item in the original proposal has shipped. Main merge [PR #5](https://github.com/itshak/ChessCoachPal/pull/5), commit [77b307f](https://github.com/itshak/ChessCoachPal/commit/77b307fb6055fd55fd0d74519ff6e04ccea61ffe), post-merge [CI 42412035420](https://github.com/itshak/ChessCoachPal/actions/runs/42412035420) and [E2E 42412035415](https://github.com/itshak/ChessCoachPal/actions/runs/42412035415) (26 passed, 5 skipped) provide automated evidence. **Unimplemented CRUD/scheduling/learning-resource tools and additional automated hardening are transferred to [expand-agent-coaching-tools](../../expand-agent-coaching-tools/proposal.md); all actual ChatGPT and Claude client checks are moved to the *final local prepublication sign-off* in [Milestone 5](../../verify-self-hosting-and-release-v0-1-0/proposal.md).** Real client interoperability remains unverified. No local/manual tests are required to close development milestones; only the final v0.1.0 publication has that manual gate.

## Architecture

ChatGPT/Claude → HTTPS MCP endpoint → delegated authorization → schema-validated tool calls → same teacher-scoped domain services used by the website → Supabase/Postgres RLS. The MCP gateway is transport/adaptation, **not** a second implementation of business logic.

Keep the experimental /api/agent/v1 route only if useful as an internal implementation layer; it is **not** a production MCP/OAuth interface. Avoid storing provider-specific schemas as independent sources of truth.

## Protocol and delegated auth

- Discover supported versions and tool schemas from a single typed contract (Zod/JSON Schema) validated against both MCP and any OpenAPI endpoint.
- Implement client-compatible authorization flow (OAuth-style with scoped bearer access and refresh/revocation as supported by selected clients), server-side teacher binding, CSRF/redirect-state validation and approved redirect URIs. Avoid blanket credentials or service-role keys in AI prompts and browser URLs.
- Keep access tokens revocable and short-lived; support independent client sessions, scoped permissions, and safe errors for expired authorization.
- Publish self-hosted HTTPS, callback and connection instructions for the **actual verified client versions**, including a developer/test instance accessible externally when client platforms cannot reach localhost. Do not claim all plans/platforms work.

## Safe operations

- Search uses teacher-scoped IDs, response limits and stable disambiguation candidates. If name/date/group context is ambiguous, return NEEDS_RESOLUTION; never select a similarly named child automatically.
- Writes carry idempotency key and, for updates, expected revision/ETag. Concurrent changes cause CONFLICT, never silent overwrite.
- Bulk attendance, destructive changes and external communication use preview → exact expiring confirmation (or are unavailable). No confirmation bypass by text generation.
- Results include minimal safe receipt (operation, affected IDs, revision, timestamp) and typed error codes. Audit actor, action, auth client, IDs and safe metadata, **not** student text/LLM prompts, tokens or private links.
- Keep teacher-facing website correction as a full fallback during any client or provider outage.

## Implemented and verified initial foundation (broader scope transferred)

PR #5 uses a Zod contract for MCP tools and a generated OpenAPI view. Its safe subset reads the existing teacher-scoped coaching data via the shared service and performs revision-checked individual attendance and lesson topic writes with transaction-scoped Postgres RPCs. OAuth tokens are hashed at rest; encrypted delegated teacher sessions are server-only; refresh and revocation are scoped to individual client grants.

Remaining student/workplace/group/scheduling/resource mutations, per-client write auditing and public-endpoint abuse-controls review are in the active tool-completion/security changes; synthetic two-teacher isolation is now automated and passing. Real-provider evidence is reserved for the local prepublication release gate. Unconfirmed bulk and destructive operations remain unavailable rather than being silently invoked.

## Verification

In development, test web and MCP requests against fresh synthetic CI stacks exclusively in GitHub Actions. Test **actual** ChatGPT and Claude client sessions only at the manual local prepublication gate. Include token expiry/revocation, two teachers, duplicate/reordered calls, ambiguity, stale update, partial provider outage and website edit parity. Log sanitized command/results and tested platform/version in docs/STATUS.md.

## Binding policy

Pre-1.0 tool names are versioned for clear client discovery but **are not backward-compatible commitments**; ADR-0001 allows replacing the contract as needed. Never retain CogNote API aliases just for migration.

