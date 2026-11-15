# ChessCoachPal — current architecture

**Hosting decision (accepted 2026-11-15, not yet deployed):** Retain the existing trimmed Supabase stack (GoTrue, PostgreSQL/RLS, PostgREST and Storage), with a controlled future Coolify hosting cutover for the Next.js website and `/mcp`. Vercel/managed Supabase remain in use while security, recovery and capacity gates are verified. See [hosting architecture](HOSTING_ARCHITECTURE.md) and [ADR-0008](adr/0008-self-hosted-supabase-on-coolify.md). Do not introduce a second PostgreSQL or SuperTokens without a new evidence-backed decision.

**As of 2026-11-15:** ChessCoachPal is a pre-v1.0.0 **MCP-first, self-hostable chess coaching workspace**. The released v0.1.x line is not a stable v1 data/API contract. The website is optional for business management; provider credentials, passwords, MFA and some high-risk approvals remain in secure browser-only workflows.

> For durable engineering decisions and lessons: [ADR-0001](adr/0001-pre1-breaking-changes.md), [ADR-0003](adr/0003-mcp-website-business-parity.md), [ADR-0006](adr/0006-unversioned-mcp-tool-names.md), [ADR-0007](adr/0007-mcp-supabase-contract-and-release-evidence.md) and [the reusable reliability playbook](MCP_SUPABASE_RELIABILITY_PLAYBOOK.md).

## Logical architecture

1. **Client:** teacher's Claude/ChatGPT/MCP-capable AI client connects to `https://<host>/mcp` with delegated OAuth PKCE, teacher consent and `coach:read`/`coach:write` scopes. Website uses authenticated Next.js routes. There is **one** /mcp gateway, not a separate reporting connector.
2. **Typed core:** `lib/server/agent-tools.ts` defines public exact names, input schemas, scopes, read/write flags and dispatch to validated domain services. Website routes call the same services. The root JSON Schema of complex tools must be discoverable in actual clients; all supported schema fields must reach dispatch.
3. **Business records:** Supabase Postgres canonical current tables for teachers/studio policy, workplaces, students/aliases/chess profiles, groups, `teaching_sessions` + `session_participants` + `session_attendance`, shared session/participant notes, materials catalog (game/puzzle/drill/chapter), links, teacher-attested material evidence, assignments, assessments/rating snapshots, and finance. A lesson's frozen roster and attendance are not the mutable group enrollment roster.
4. **Source of truth:** tenant-scoped Postgres data and owner-authorized RPCs. RLS, immutable revisions/receipts and transactional writes prevent cross-teacher or retry races. Material links/ratings/lesson scheduling **never imply skill mastery**. Provider API events must be distinguished from teacher attestations.
5. **Deployment:** Next.js on Vercel or supported Compose self-host, Supabase Auth/Postgres/Storage; external providers (Lichess, payment, optional AI/SMTP) are opt-in and may require secure browser input. Backup/restore tests create a **second new empty installation**.

## Invariants and known tricky edges

- **MCP discovery has multiple layers:** server registration and connector settings may show a tool while Claude's *conversation-level deferred ToolSearch* cannot load it. Compare exact `tools/list` schema, client search, call and independently persisted read-back. A new conversation may be necessary; only observed client results establish interoperability. PR #79 removed a short-lived MCP-only JSON Schema adapter and changed the **shared material input schema** instead.
- **Student aliases:** Hebrew/full name and short/English alias may resolve to the SAME UUID. A name+alias input list can correctly trigger duplicate-roster blocking while both individual resolutions succeed. Do not infer two student records.
- **Chess progress:** teacher strength (1–10), skill grade history (1–5), platform rating snapshots (time-control/provider/source/date) and manually edited profile rating fields are separate. Reports must expose provenance and historical trend without guessing mastery.
- **Lesson dates:** treat workplace/studio fallback timezone, session `local_timezone` and teacher-local assessment date as distinct. Surface actual defaults (30 minutes for ordinary private sessions) and note replacement semantics (session `lesson_note` vs participant notes).
- **Materials audit:** a material must exist in the owned catalog before linking or claiming evidence; student and session links are independent. Voided evidence remains in audit history but is excluded from default progress/aggregate.
- **Security:** a table with RLS enabled and intentionally zero client policies may be **server-only**, not misconfigured. Trigger-only definer routines must not be directly RPC-executable; other signed-in definer RPCs need explicit `auth.uid()` and tenant checks. Use advisor findings and tests, not blanket grants/revokes.
- **Schema:** one `supabase/migrations/20261107000000_chesscoachpal_baseline.sql`, no incremental pre-v1 migrations or compatibility with CogNote/older installs. Test the physical schema, grants, Storage policy collisions, Auth resets and a real authenticated read/write. Never auto-delete teacher data.

## Verification / release gate

A teacher business field is not implemented until website ↔ MCP share the same behavior, `scripts/mcp-website-parity.json` is updated, a named authenticated browser/delegated MCP E2E covers the actual persisted non-default field, and scope/foreign-tenant/replay tests pass. `npm run mcp:parity:strict` and CI/Compose/backup-restore/security are required; actual Claude and ChatGPT client sign-off is separate.

**Evidence:** PR [#79](https://github.com/itshak/ChessCoachPal/pull/79) fixed live Claude material-create discoverability. PR [#81](https://github.com/itshak/ChessCoachPal/pull/81) addresses follow-up alias/date/report/timezone, E2E and Supabase audit findings. See [AI connectors](AI_CONNECTORS.md), [OpenSpec](../openspec/specs/teacher-mcp-parity/spec.md), and the [playbook](MCP_SUPABASE_RELIABILITY_PLAYBOOK.md). Do not use the historical 28-tool/0.0.0 roadmap snapshots as current deployed architecture.
