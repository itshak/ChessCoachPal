# ChessCoachPal — mandatory coding-agent instructions

ChessCoachPal is **MCP/Plugin-first**; the website is a secondary viewer/editor and trusted sensitive-credential/approval surface. The current student, teaching, financial and material domain model MUST be shared by both interfaces. Follow [ADR-0003](docs/adr/0003-mcp-website-business-parity.md) and [ADR-0007](docs/adr/0007-mcp-supabase-contract-and-release-evidence.md).

**Read before working on any MCP, Supabase, student, report or release change:**
- [MCP and Supabase failure-mode playbook](docs/MCP_SUPABASE_RELIABILITY_PLAYBOOK.md) — portable investigation, correct/incorrect patterns, security advisors, CI acceptance.
- [Pre-v1 schema policy](docs/adr/0001-pre1-breaking-changes.md) and [baseline-first live transition policy](docs/adr/0015-baseline-first-and-one-time-live-transitions.md) — **always update the current canonical baseline**; when a live database has real records, also provide an explicit reviewed, one-time forward-only transition that converges to the same target schema. No CogNote/pre-v1 API compatibility bridge and no destructive reset without operator authorization, verified backup/restore and reconciliation.
- [Live MCP contracts](docs/AI_CONNECTORS.md) and [parity registry](scripts/mcp-website-parity.json) — code/tool catalogue, not old proposal tables.
- [OpenSpec parity requirements](openspec/specs/teacher-mcp-parity/spec.md) and [security requirements](openspec/specs/chess-only-security/spec.md).

**Implementation rules:**
1. Use the SAME canonical root-object typed input schema and owner-scoped service for website and MCP; test exact tool name, `tools/list`, dispatcher forwarding of EVERY field, persistence, independent read-back and replay. A connector tool count is not client discoverability.
2. Preserve OAuth scopes, tenant RLS and safe `SECURITY DEFINER` grants. Do not expose raw SQL, service secrets, family credentials or private child data via a model.
3. Model the domain precisely: name+alias may identify one learner but must not double-count a roster; skill grades and strength differ from platform rating snapshots; dated history and voided evidence must remain auditable; date/timezone and note replacement must be explicit.
4. Add the same-PR [MCP parity registry](scripts/mcp-website-parity.json) delta and real authenticated browser↔delegated MCP E2E for all changed teacher UI/API business operations.
5. Prove new-install baseline **and (when needed) the one-time live transition on an isolated restored copy**, RLS permissions, CI/typecheck, strict parity, E2E, security, Compose and backup/restore. **Never merge or deploy with red required checks**; verify merged SHA and production Vercel READY.
6. Document any true client-side acceptance separately: tested Claude Desktop does not certify ChatGPT; actual-client ToolSearch differs from the MCP tool registry.

Keep upstream MIT attribution and obey current ChessCoachPal proprietary licensing; see [legal notices](THIRD_PARTY_NOTICES.md).
