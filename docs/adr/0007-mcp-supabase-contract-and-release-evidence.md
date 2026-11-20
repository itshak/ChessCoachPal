# ADR-0007: MCP client discoverability and Supabase canonical-contract release gates

> **Deployment terminology (ADR-0018):** ChessCoachPal is operator-only SaaS; any "self-hosting" references here describe our infrastructure/CI, never customer-hosted product support. [Current policy](0018-operator-only-saas-and-tenant-scaling.md).

- **Status:** Accepted as pre-v1 development contract (proposed in [PR #81](https://github.com/itshak/ChessCoachPal/pull/81); code acceptance requires green PR and merged-main checks)
- **Date:** 2026-11-15
- **Scope:** New/changed MCP tools, browser APIs and shared services, Supabase RLS/RPC/schema/storage, CI and releases
- **Related:** [ADR-0001](0001-pre1-breaking-changes.md), [ADR-0003](0003-mcp-website-business-parity.md), [ADR-0006](0006-unversioned-mcp-tool-names.md), [technical playbook](../MCP_SUPABASE_RELIABILITY_PLAYBOOK.md)

## Context

The first live Claude Desktop integration revealed three independent classes of failure behind similar user-visible tool symptoms:

1. A stale hosted test database lacked the canonical student chess fields and audit tables. A previously advertised MCP profile-edit operation failed with `DATABASE_ERROR`. It passed after the user-approved canonical database reset, and live reads verified strength/name aliases.
2. Connector settings listed **88 read-only and 95 write tools**, yet Claude's conversation-level deferred ToolSearch could not load `ccp_learning_materials_create` by its exact name. Correcting the shared material input JSON Schema in PR #79, eliminating the temporary adapter, and creating a fresh Claude conversation made the tool discoverable. The full create/read/link/evidence/void sequence passed.
3. A later backdated skill-assessment E2E accepted `assessedOn` in the schema and service but persisted the wrong date, because the MCP dispatch case silently omitted that field. The failure was a real wiring bug not detectable by inspecting the JSON Schema alone.

A successful database query, visible tool count, `tools/list` response, green TypeScript build and a live vendor UI are **different levels of evidence**. No one level is a substitute for the others.

## Decisions

### 1. One typed business contract and an end-to-end field path

Every business input SHALL travel through one shared typed schema/domain service, with the website handler and named `ccp_<domain>_<action>` MCP tool invoking the same authorization and validation. The MCP dispatcher SHALL explicitly transmit **every** schema-supported field, including optional dates, null-clears, durations, nested kind-specific payloads, revisions and idempotency UUIDs.

Published `tools/list` inputs SHALL be representable as discoverable **root-object** JSON Schemas by supported clients. Rich nested validation SHALL stay in the same core schema. There SHALL be no second MCP-only conversion/compatibility contract introduced to satisfy one client; prefer changing the canonical core where possible under ADR-0001.

A full roundtrip SHALL check a **non-default field value** at both transports, SQL persistence and a third read, including rejection of changed-key retries. A list of tools or schema snapshots is insufficient.

### 2. External discovery acceptance is separate and mandatory to claim client interoperability

Unit/integration CI SHALL check the exact MCP tool name, root-object schema, `tools/list`, `tools/call`, scope and the actual dispatch service. **Live client certification** requires a real compatible Claude or ChatGPT client to select/discover and invoke the exact tool (fresh conversation if the session's deferred metadata is stale), then read back the stored record.

The acceptance report MUST distinguish: (a) application/server readiness, (b) actual Claude acceptance, (c) actual ChatGPT acceptance. One client's visible tool count or successful call SHALL NOT certify the other. Don't invent client-side discovery rules or silently claim "cache" as root cause.

### 3. Identity and evidence semantics must not produce plausible incorrect records

A student name and alias resolving to one UUID SHALL be reported as **one person**. If both occur in a requested lesson roster, the operation SHALL fail closed with a clear duplicate-reference diagnostic; the user SHALL NOT be told two student rows exist or permitted to double bill attendance. Ambiguity between distinct learners SHALL still require disambiguation.

Skill grades, strength and provider ratings SHALL be maintained as **distinct facts**. Current progress reports SHALL expose verified/teacher-entered snapshot provenance, local assessment dates and trends without inventing mastery; voided teaching evidence SHALL remain auditable while excluded from default active aggregates.

Optional fields SHALL have documented semantics: 30-minute private-lesson default; optional `lessonNote` on completion **replaces** a shared session note when supplied; participant notes are separate; history timezone is derived from persisted session timezone with workplace/studio fallback metadata. Defaults must not silently replace explicitly supplied valid fields.

### 4. Single current Supabase installation schema, with security invariants

Before v1.0.0, `supabase/migrations/20261107000000_chesscoachpal_baseline.sql` is the **only** installation SQL. Security, policy and index changes SHALL be folded into that snapshot and tested on a second clean database. An existing disposable test instance MAY be patched in place with the **same** effective SQL rather than reset. A destructive reset requires explicit approval; protect real data and respect Supabase-managed Auth/Storage schemas and protected Storage API.

All exposed tables SHALL have intentionally reviewed grants and RLS. Server-only tables SHOULD deny client roles, even where Supabase's advisory marks no policy as INFO. An empty RLS policy list is not a reason to create `USING (true)`. Privileged functions MUST have fixed `search_path`, least-privilege EXECUTE, verified `auth.uid()` and tenant predicates; trigger-only definer functions SHALL NOT be callable by `anon`/`authenticated` RPC users. Authorized owner-scoped `SECURITY DEFINER` RPCs may remain executable by authenticated clients only after a scoped security review and cross-tenant negative test.

Run both Supabase **security** and **performance** advisors before/after changes; classify remaining warnings rather than calling an intentional access restriction a failure or misreporting zero warnings. Optimize auth RLS lookup calls through scalar SELECT initplans without changing ownership logic; add useful FK indexes and do not delete indexes just because a tiny test DB reports them unused. Leaked-password-protection is a Supabase Auth setting (Pro+ capability), not fixed through SQL.

### 5. Safe external checkout races are not counted by successful callers

When website and MCP concurrently request one invoice checkout, a second caller MAY return the same already-persisted provider checkout link successfully. A test SHALL distinguish that safe replay from two DISTINCT upstream sessions. The durable invoice may hold only one payable session; if distinct sessions are created, the loser SHALL be expired, the loser call SHALL conflict, and retries SHALL return the durable winner. Test the persisted winner, both transport responses, upstream creation count, loser expiry and later replay, rather than imposing one arbitrary scheduler outcome.

### 5. All parity/CI/production gates remain blocking

Each PR that touches a teacher website/API surface SHALL include corresponding core/MCP changes, `scripts/mcp-website-parity.json` review and independently named authenticated website↔delegated MCP E2E. Required checks: static parity guard, TypeScript/lint/unit, fresh canonical DB, client-safe JSON Schema, E2E with non-default values/negative authorization/replay, security/history, self-host Compose, backup and second-install restore. Do not bypass red CI by weakening tests or bypassing the guard.

Only merge once all five PR workflows are green; validate merged SHA and production Vercel readiness/alias. A READY deployment is not proof that the exact MCP client discovers and invokes the new tool. Record actual-vendor acceptance separately.

## Consequences

- Pre-v1 schema/API changes remain deliberately breaking; no compatibility scaffolding or incremental migration chain is required.
- Each new tool has a larger, testable correctness surface: definition, schema, authorization, dispatch, domain service, database behavior, independent read-back and optional real-client discovery.
- Privilege decisions require written classification, not blind dismissal or broadening of policies to make dashboards green.
- Runbook and OpenSpec now preserve portable guidance for other agents and projects without assuming every Supabase project follows ChessCoachPal's **pre-v1 one-baseline policy**.

## Acceptance evidence and limitations

The user-supplied Claude Desktop test completed `ccp_learning_materials_create` → `get` → student/session links → `assigned`/`taught` evidence → void → history/aggregate/progress after PR #79; SQL independently read back the two links. PR #81 contains date, report, alias, timezone, docs, security and parity E2E fixes. **Its acceptance is not asserted by this ADR alone**: use exact current GitHub Actions and the production commit before claiming completion. No real ChatGPT client acceptance is claimed.

See [the full investigation and portable checklist](../MCP_SUPABASE_RELIABILITY_PLAYBOOK.md).
