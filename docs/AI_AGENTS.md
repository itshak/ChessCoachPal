# AI/MCP integration — current architecture and acceptance

**Date:** 2026-11-15. ChessCoachPal is **MCP/Plugin first**, not a website-first app with an AI addon. The authenticated website is a secondary editor/visualization and trusted secure browser consent surface. All ordinary teacher business actions use one shared server-side domain service through website routes and the existing **single** `/mcp` gateway.

See [architecture](ARCHITECTURE.md), [connectors](AI_CONNECTORS.md), [ADR-0003](adr/0003-mcp-website-business-parity.md), [ADR-0007](adr/0007-mcp-supabase-contract-and-release-evidence.md), and the detailed [MCP/Supabase playbook](MCP_SUPABASE_RELIABILITY_PLAYBOOK.md).

## Known client evidence — do not generalize

- **Automated GitHub browser/delegated MCP** tests verify tool inventory, scopes, core writes/reads, cross-tenant denial, parity, retry, fresh installs and reports.
- **Actual Claude Desktop** was tested against `chesscoachpal.com` with a synthetic test student. Connector settings displayed 88 read-only + 95 write tools. Its initial deferred ToolSearch could not load `ccp_learning_materials_create` despite tool registration.
- After [PR #79](https://github.com/itshak/ChessCoachPal/pull/79) corrected the **shared** material root JSON Schema and deployed, Claude loaded both create/get and successfully created a drill, linked it separately to a student and session, recorded `assigned`/`taught` material evidence, and voided `assigned` while retaining its audit trail. The website/database shared source verified the resulting state; material links were independently checked in SQL afterward.
- This does **not** certify every one of the 183 tools, other cached conversations, voice, or **real ChatGPT** tool discovery/writes. Live vendor acceptance must always name the exact client, session and operation. See [manual acceptance](LOCAL_CLIENT_ACCEPTANCE.md).

## Exact tool usage pattern

1. Connect the teacher via authorized OAuth PKCE and the requested scope; **read** tools require `coach:read`, mutating tools require `coach:write` and operation confirmation as appropriate. Do not send raw credentials to the LLM.
2. Read current student/workplace/material/session candidates by ID/search (`ccp_students_roster`, `ccp_students_resolve`, `ccp_sessions_list`, `ccp_learning_materials_list`).
3. For multiple names or aliases, resolve to stable UUIDs. Two strings can refer to the **same** student; refuse duplicate *roster references* without inventing duplicate database rows. Ambiguous aliases need explicit disambiguation.
4. Preview or re-read revisions and relevant timezone. Propose precise changes with explicit `durationMinutes`, `assessedOn`, and intended lesson-note replacement; request teacher confirmation before sensitive writes.
5. Call the current exact `ccp_<domain>_<action>` tool with an idempotency UUID. On retry use the **same** UUID and immutable payload, never a new key for a network retry. Revision-checked updates use the freshest revision.
6. Read back through an **independent** tool or website route, including nested details, stored nulls, provenance and date. For reports compare website/MCP outputs. For material evidence inspect history both with and without voided claims; link IDs should be read through `ccp_material_links_list`.
7. Treat provider ratings, teacher-confirmed strength, skill assessments, notes, attendance and mastery as distinct facts. No automatic mastery inference from a Lichess link, puzzle, session, rating or homework attempt.

## Tool schema and dispatch requirements

The canonical `lib/server/agent-tools.ts` catalogue advertises the exact unversioned tool names, root-object JSON Schemas, security scope and dispatcher. Kind-specific material validation lives in the **same** typed input schema that website actions use, not an MCP-only compatibility adapter. Non-default optional inputs **must** survive `tools/call`, runtime dispatch, shared service, database transaction, receipt and read-back. PR #81's E2E caught `assessedOn` being accepted in schema but dropped by dispatch; that is why code review of catalogue alone is insufficient.

Each changed teacher-facing UI/API capability requires a reviewed parity-registry entry, current MCP schema/adapter, and independent named browser/delegated OAuth E2E in the same PR. This is enforced in PR CI by `scripts/mcp-parity-pr-guard.mjs`, `npm run mcp:parity:strict`, and the synthetic tests. The approved exceptions are **only** security-sensitive operations (password, MFA, raw credentials/hosted card entry, full confidential backup with guardian tokens, other principals); otherwise a website-only feature is a defect.

## Why the database sometimes looks like a tool bug

A deployed MCP tool can work while the connected hosted Supabase project has **outdated physical columns or RLS grants**. The earlier `ccp_students_profile_edit` failure was a missing `students.strength`/`name_aliases` baseline problem. After explicit authorization, the disposable DB was transactionally rebuilt from one current installation schema, and both fields were persisted and read. It did **not** require a compatibility migration or second MCP adapter.

For the exact reset hazards—protected Supabase Storage triggers, surviving `storage.objects` policies, Auth sessions, migration bookkeeping—and for advisor classification of server-only tables and privileged RPCs, follow [the playbook](MCP_SUPABASE_RELIABILITY_PLAYBOOK.md) and [ADR-0001](adr/0001-pre1-breaking-changes.md). Never reset a real-teacher database without explicit operator instruction and backup.

## Test / publication boundary

Development CI MUST run on fresh synthetic installs and prove strong cross-tenant, scope, read-only, stale-revision, idempotent-replay, report, material and security behavior. **Actual client tests** must separately discover and invoke each critical tool in a real current Claude or ChatGPT conversation; connector inventory and CI are not equivalent to actual client support. Merge only when CI, full E2E, security, self-host Compose and backup/restore all pass. Verify Vercel production alias and deployed SHA, then actual provider behavior.
