# ADR-0006: Unversioned MCP tool identifiers before v1.0.0

- **Status:** Accepted
- **Date:** 2026-11-15
- **Scope:** Public tool names exposed through ChessCoachPal's authenticated remote `/mcp` connection
- **Related:** [ADR-0001](0001-pre1-breaking-changes.md), [ADR-0003](0003-mcp-website-business-parity.md)

## Context

The original MCP catalogue exposed names like `ccp_v1_students_create`. The `v1` fragment was a tool-contract generation marker, not the application release version, and implied parallel compatibility surfaces that are unwanted during ChessCoachPal's pre-1.0 development. The existing policy permits breaking changes before v1.0.0 while requiring exhaustive website/MCP functional parity.

## Decision

1. Public tool identifiers are `ccp_<domain>_<action>` (e.g., `ccp_students_create`). Do not include a version number in tool identifiers before a future explicit compatibility policy is approved.
2. Migrate **all** tool catalogue names, dispatch cases, registry references, tests, current specifications and client examples together. Retain **no** `ccp_v1_*` aliases or duplicate exposure in tool discovery. A call using an old name must receive `NOT_FOUND`.
3. Keep the existing HTTPS `/mcp` URL, OAuth authorization/scopes, tenant isolation, revisions and idempotency unchanged. HTTP `/api/agent/v1` is a separate developer gateway and is outside the MCP tool-identifier rename.
4. Record breaking tool-name changes in the release changelog. Require a fresh synthetic MCP/OAuth browser test, full strict parity audit, unit/build/Compose/recovery CI and a tagged Vercel production deployment. Real Claude and ChatGPT clients must refresh or reconnect after rollout.
5. A later stable compatibility/versioning policy would require a separate ADR. Do not use `ccp_v2_*` to preserve deprecated pre-1.0 variants by default.

## Consequences

Tool names shown in Claude and ChatGPT become shorter and accurately represent the one current contract. Existing AI conversations that cached old names may require reconnecting; already stored teacher and student data, OAuth consent grants and website workflows are not migrated or deleted.
