# Real Claude and ChatGPT MCP acceptance — independent client checks

> **Deployment terminology (ADR-0018):** ChessCoachPal is operator-only SaaS; any "self-hosting" references here describe our infrastructure/CI, never customer-hosted product support. [Current policy](adr/0018-operator-only-saas-and-tenant-scaling.md).

**Updated 2026-11-15.** This is a **living acceptance procedure**, not a claim of complete external-client certification. The earlier statement “neither client has ever been tested” is superseded: **Claude Desktop has successfully performed a synthetic end-to-end material workflow on the deployed website**. **ChatGPT has not been confirmed through an equivalent real-client test.** A passing synthetic browser/delegated OAuth test also does not establish real-client behavior.

The original v0.1.0 GitHub release was already published before this exercise. Do not describe these tests as a prerequisite that is still blocking an already-published tag; treat missing external-client evidence as a separately tracked post-release acceptance gap.

## Completed Claude Desktop observations (2026-11-15)

The operator's Claude connector settings displayed **88 readonly + 95 write tools**. An earlier chat's deferred ToolSearch could **not** find `ccp_learning_materials_create` although it was listed in settings. [PR #79](https://github.com/itshak/ChessCoachPal/pull/79) changed the canonical material root input JSON Schema; after the corrected deployment, the user reported that Claude successfully loaded `ccp_learning_materials_create` and `ccp_learning_materials_get` and completed these **synthetic** operations:

- Create and read back drill `MCP Test – Knight Forks`.
- Link drill to existing test student and independently to completed tactics session. The two material link rows were later read back by direct owner-context database checks.
- Record approved `assigned` and `taught` synthetic evidence; history/aggregate/progress initially showed both stages.
- Void `assigned` with its prior `updated_at` and reason. Auditable history retained 2 rows with voided included; default active aggregates/report showed 0 assigned and 1 taught. No mastery was claimed.

Earlier Claude runs also verified student strength, aliases, lesson completion, attendance and ratings. These observations prove those **specific** workflows, not every tool, token-rotation flow, foreign-tenant denial, or live ChatGPT behavior. Retain only synthetic identifiers in documentation; never paste children’s contact details or OAuth tokens.

## Before each new real-client check

1. Identify the intended **current merged commit**, Vercel deployment/hostname and dedicated synthetic Supabase project, or verified isolated HTTPS self-host instance. Don't test in an old cached client session or against an unknown deployment.
2. Never reset a database with real student records; use only teacher-approved synthetic accounts and safe test data. If a reset is required, get explicit operator authorization and back up first.
3. Verify `/mcp` and OAuth discovery/authorization endpoints, the scopes to be approved, new client version/plan, and **write-capable** custom connector support. Browser login/consent handles credentials; do not reveal tokens in chat.
4. Run independent non-default field roundtrips (especially assessedOn, time control, note replacement, duration, aliases, revision) and website read-back.
5. Revoke the actual provider's grant in the website and verify the now-invalid tool call fails. This is separate from synthetic OAuth unit tests.
6. Record a sanitized status per client: endpoint host, commit, date, exact tool names, read/write scopes, input schema, persisted read-back, denial/revocation and issues. Do not mark unexecuted rows passed.

## Required remaining manual acceptance matrix

| Check | Claude Desktop | ChatGPT |
| --- | --- | --- |
| Actual client HTTPS /mcp + OAuth consent and selected scoped tool list | Connected to test teacher; exact scope/refresh/revocation not exhaustively certified | Not yet verified |
| Exact `ccp_learning_materials_create` discovery with root input schema in new conversation | **Passed after PR #79** | Not yet verified |
| Create, independent read-back, student/session links, evidence and audited void | **Passed** (synthetic data) | Not yet verified |
| `ccp_student_skill_assessments_record` **explicit historical `assessedOn`** roundtrip | Needs retest after PR #81 deployment | Not yet verified |
| Snapshot-driven progress report, trends and timezone provenance | Needs retest after PR #81 deployment | Not yet verified |
| Conflict/replay rejection, scope downgrade and expired/revoked token denial | Not comprehensively verified in actual client | Not yet verified |
| Real-app website correction reflected in a subsequent provider read | Partially verified through independent reads; complete checklist outstanding | Not yet verified |
| No raw keys, private names or unrelated tenant data in evidence | Use synthetic-only and redact | Use synthetic-only and redact |

## Failure diagnosis and sign-off

If a tool is visible in settings but not loadable in conversation-level ToolSearch, compare deployed SHA, exact `tools/list`/JSON Schema and a **new** actual client conversation. Don't speculate that it is definitely cache or silently substitute another tool. If a call succeeds but read-back differs, trace the optional field through MCP schema → dispatch → domain service → database function → returned data, not just the tool schema. For the complete list of observed failures and solutions, see [MCP/Supabase playbook](MCP_SUPABASE_RELIABILITY_PLAYBOOK.md).

A passed manual row is valid only for the tested client, tool, timestamp and deployment. Merged-main CI, self-host, backup/restore and security audits are still required separately. Live ChatGPT interoperability cannot be inferred from Claude or Codex.
