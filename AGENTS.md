# ChessCoachPal — mandatory coding-agent instructions

ChessCoachPal is **MCP/Plugin-first**; the website is a secondary viewer/editor and trusted sensitive-credential/approval surface. The current student, teaching, financial and material domain model MUST be shared by both interfaces. Follow [ADR-0003](docs/adr/0003-mcp-website-business-parity.md) and [ADR-0007](docs/adr/0007-mcp-supabase-contract-and-release-evidence.md).

**Current single schema owner (ADR-0019, 2026-11-21):** [consolidated final schema and Freemium OpenSpec](openspec/changes/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md) owns **all remaining planned pre-production DDL**, TypeScript types, RLS/grants and schema-related regression fixes. The older 2026-11-19 schema freeze was superseded *without being completed*. Downstream active proposals own functionality only; do not independently add DDL. See [all 87 tables crosswalk](docs/FINAL_SCHEMA_REQUIREMENTS_CROSSWALK_2026-11-21.md) and [planned acceptance matrix](docs/FINAL_SCHEMA_ACCEPTANCE_MATRIX_2026-11-21.md). No separate production cutover is authorized.

**Read before working on any MCP, Supabase, student, report or release change:**
- [Accepted architecture and active OpenSpec proposals](openspec/changes/README.md) — product decisions are accepted, implementation is pending; follow dependencies and deferrals.
- [MCP and Supabase failure-mode playbook](docs/MCP_SUPABASE_RELIABILITY_PLAYBOOK.md) — portable investigation, correct/incorrect patterns, security advisors, CI acceptance.
- [Pre-v1 schema policy](docs/adr/0001-pre1-breaking-changes.md) and [single-final-cutover and no-compatibility policy](docs/adr/0017-pre-v1-single-final-cutover-no-compatibility.md) — **always update the one canonical baseline**. Do not incrementally upgrade the real pre-v1 deployment per feature or ship backward-compatibility adapters. At final acceptance use either one approved source-to-target data transformation or a clean baseline plus verified export/reimport. A real reset requires separate target-specific operator approval and tested backup/recovery.
- [Final-cutover operator runbook](docs/SCHEMA_TRANSITION_RUNBOOK.md) — distinguish historical synthetic migration fixtures from the one future approved live cutover; never infer production authorization from passing CI.
- [Live MCP contracts](docs/AI_CONNECTORS.md) and [parity registry](scripts/mcp-website-parity.json) — code/tool catalogue, not old proposal tables.
- [OpenSpec parity requirements](openspec/specs/teacher-mcp-parity/spec.md) and [security requirements](openspec/specs/chess-only-security/spec.md).

**Implementation rules:**
1. Use the SAME canonical root-object typed input schema and owner-scoped service for website and MCP; test exact tool name, `tools/list`, dispatcher forwarding of EVERY field, persistence, independent read-back and replay. A connector tool count is not client discoverability.
2. Preserve OAuth scopes, tenant RLS and safe `SECURITY DEFINER` grants. Do not expose raw SQL, service secrets, family credentials or private child data via a model.
3. Model the domain precisely: name+alias may identify one learner but must not double-count a roster; skill grades and strength differ from platform rating snapshots; dated history and voided evidence must remain auditable; date/timezone and note replacement must be explicit.
4. Add the same-PR [MCP parity registry](scripts/mcp-website-parity.json) delta and real authenticated browser↔delegated MCP E2E for all changed teacher UI/API business operations.
5. Prove the final fresh-install baseline and candidate **single final cutover or clean reimport** on an isolated restored copy, RLS permissions, CI/typecheck, strict parity, E2E, security, Compose and backup/restore. **Never merge or deploy with red required checks**; verify merged SHA and deployment readiness. No intermediate real-database migrations or legacy compatibility layers.
6. Document any true client-side acceptance separately: tested Claude Desktop does not certify ChatGPT; actual-client ToolSearch differs from the MCP tool registry.

Final pre-v1 acceptance MUST run `npm run pre1:final-cutover:audit` with zero violations, **in addition** to ordinary schema/parity checks. CI runs this source audit and the strict final schema inventory on the checkout. Passing these checks does not replace independent database comparison, behavioral acceptance, or operator cutover evidence. Do not weaken or skip the gate to archive an OpenSpec.

Keep upstream MIT attribution and obey current ChessCoachPal proprietary licensing; see [legal notices](THIRD_PARTY_NOTICES.md).
