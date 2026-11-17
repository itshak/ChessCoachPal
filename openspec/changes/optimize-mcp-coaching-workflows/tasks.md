# Tasks — optimize-mcp-coaching-workflows

**Status: PROPOSED.** All boxes intentionally unchecked. This commit adds a design and a future implementation plan; **no workflow/code optimization is claimed delivered**.

Implementation follows `AGENTS.md`, ADR-0003, ADR-0006, ADR-0007, current strict parity, pre-v1 compatibility policy and actual deployed version. Record exact test runs and merged commit in `docs/STATUS.md` before archiving. Do not use real teacher data or run destructive database resets without explicit informed authorization.

## A. Audit the actual MCP surface and teacher tasks

- [ ] **A1 — Snapshot current main and live contracts.** Record exact source SHA, current `ccp_*` tool count, complete paginated `tools/list`, actual callable names, root input schemas, descriptions, read/write hints, scope requirements, outputs and dispatcher functions. Do **not** use old `ccp_v1_*` planned names or the historical 183 count as a live assertion.
- [ ] **A2 — Reconcile every tool with business parity.** Generate a machine-readable mapping from each tool to its shared service, website route, `scripts/mcp-website-parity.json` entry, relevant E2E and security class; identify tools with no mapped service, overlapping behavior, misleading descriptions and unreachable fields. Keep the full inventory and manual dispositions reviewable.
- [ ] **A3 — Inventory real teacher intents.** For completed private/group lessons, existing/new materials, per-student evidence, corrections, briefing, students/aliases, scheduling, groups, assignments, reports, archive/reactivation, communication, imports and finance, document exact current tool sequences and backend dependencies. Distinguish one ordinary request from deliberate multi-step consent and external provider transactions.
- [ ] **A4 — Classify every tool.** Mark KEEP/REWORD/COMPOSE/GRANULAR-ONLY/RENAME/REMOVE-REDUNDANT/DEFER with an explanation. Document actual high-level operations that already work, especially combined lesson/chapter commit and coach briefings. No tool is dropped merely to hit an arbitrary count. List every field or user capability that might otherwise become unreachable.
- [ ] **A5 — Prioritize only supported gaps.** Publish an incremental plan identifying the three highest-value orchestration problems, baseline call counts, safe target sequence, authorization, transaction boundary, current vs proposed service, and acceptance tests. Review it before implementing composites.

## B. Improve descriptions, names, schemas and discovery

- [ ] **B1 — Normalize exact tool definitions.** Use stable, specific `ccp_<domain>_<action>` names and descriptions framed as user goals; distinguish intent, preconditions, side effects, confirmation, limits and when *not* to call similar tools. Avoid promotional descriptions, duplicated confusing definitions and unexplained internal names.
- [ ] **B2 — Preserve a discoverable canonical contract.** Verify all root-object schemas, nondefault optional field forwarding, material kind distinctions, typed bounds, readOnly/destructive/open-world metadata, revisions, idempotency and bounded structured receipts. Avoid creating MCP-only parallel versions of website schemas.
- [ ] **B3 — Document native progressive discovery.** Keep all authorized tools registered under one `/mcp`; do not claim our server can force deferred loading. No mandatory additional skill, second MCP installation, generic `execute_anything` or dynamic per-turn tool hiding.
- [ ] **B4 — Check catalog authorization.** Validate read-only vs write grants, revoked/expired sessions, business entitlements including Free/Pro nuances, server-side enforcement even for guessed tool names, cached catalog changes and availability of account subscription management where applicable.
- [ ] **B5 — Add catalog lint/guard to CI.** Unique names, valid schemas, accurate annotations, dispatch mapping and preview/commit pairing; fail on newly overlapping descriptions or missing parity mapping. Freeze neither exact tool count nor plain token-size target.

## C. Consolidate the most common coaching workflows

- [ ] **C1 — Lesson capture improvement.** Reuse existing lesson preview/commit services wherever sufficient; fill only demonstrated gaps. A single user-intent workflow SHALL resolve canonical students/aliases, local date/time and appropriate schedule, one actual teaching session, participant attendance and teacher minutes once. Ambiguity asks rather than guessing; preview/confirmation rules retained.
- [ ] **C2 — Material-in-lesson improvement.** For an already-known or newly introduced material, provide a coherent typed preview + safe commit that creates/reuses the material, relates it to the exact lesson and appropriate students, and records typed teacher evidence without fabricated mastery. Check existing atomic lesson+chapter implementation first. The unit-of-work must roll back completely for local writes; remote Lichess operations need explicit consent and reconciliation rather than a false atomicity claim.
- [ ] **C3 — Correct lesson/learning state.** Scope and preview corrections to attendance, per-student note, material link or evidence; use latest revision/digest, owner checks, durable audit/voiding and replay safety. No modification of unrelated students.
- [ ] **C4 — Review existing briefing/history/report tools.** Prefer existing factual combined readers; improve only where avoidable model-side aggregation or redundant reads are proved. Next-lesson suggestions remain marked as suggestions with evidence sources/unknowns.
- [ ] **C5 — Preserve granular commands.** Explicitly test exact record-level creation/edits/clears for students, materials, assignments, session notes, attendance, aliases, workplace settings, reports, finance and data transfer. If consolidation retires a redundant *tool name*, map its authorized functionality to remaining discoverable tool(s) with full spec/test updates; no capability is allowed to disappear.
- [ ] **C6 — Do not combine inappropriate side effects.** Invoices, emails, credits, deletion, external Lichess writes, OAuth and secure browser actions retain separate reviewed approvals as applicable. Composite command semantics must not silently bill, email, overwrite or publish.

## D. Deterministic evidence and acceptance

- [ ] **D1 — Define golden synthetic workflows.** Cases: name/alias resolves one UUID; two-student 90-minute Lucena group session; one student needs review, the other not; create new material and mark taught for correct learners; existing-material reuse; ambiguous material or student; private lesson; revision-safe attendance correction; briefing with unknown mastery; report dedupes teacher time.
- [ ] **D2 — Validate real MCP calls and persistence.** Authenticated `tools/list` and `tools/call` on owner/foreign/read-only users, fresh seeded backend and independent database/website read-back. Assertions cover non-default fields, typed material IDs, relevant source and timestamps, one session, correct roster/attendance/evidence, and expected errors.
- [ ] **D3 — Exercise failure and retry paths.** Duplicate roster aliases, ambiguous schedule, changed idempotency replay, network retry, stale revision, mid-transaction material failure, partial external provider write and reconciliation, cross-tenant/entitlement denial. Never accept “the assistant said success” as evidence of persistence.
- [ ] **D4 — Measure orchestration burden deterministically.** Document smallest safe client-visible call sequence before/after for each selected teacher intent and whether redundant calls moved to backend; retain clarifications and separate high-risk approvals. Label this a **design proxy**, not actual model token/latency or smaller-model reliability benchmark.
- [ ] **D5 — Maintain full browser↔MCP parity.** Update `scripts/mcp-website-parity.json`, source guard, existing 93+26 cases and additional named tests for every changed capability/field. `npm run mcp:parity:strict` and same-PR guard MUST stay green with no downgrading exceptions.
- [ ] **D6 — Required exact-head checks.** Typecheck, lint/unit, schema/contracts, authenticated browser↔MCP E2E, security/history, fresh-install/update-safe database verification, self-host Compose and backup/restore as applicable. Do not modify production based on a red required check or reset real accounts.
- [ ] **D7 — Document actual implementation and decisions.** Update catalog docs, `docs/AI_AGENTS.md`, workflow instructions, `docs/STATUS.md`, OpenSpec applied specs and a final accepted ADR that captures real code decisions. Preserve release-client boundaries: automated CI does not certify ChatGPT/Claude Free and no paid token API test is required for development acceptance.

## E. Final verification / archive

- [ ] **E1:** Verify the final implementation commit is merged on `main`; record exact SHA and passing required GitHub Actions URLs. The approved public technical documentation must not expose the private business strategy or student data.
- [ ] **E2:** Compare complete authorized business functionality against the baseline and ensure no capability vanished from `/mcp` even when fine-grained tools were consolidated.
- [ ] **E3:** Archive this OpenSpec change only after all relevant tasks and evidence are complete; do not mark it accepted because a proposal was committed. Keep real vendor-client acceptance distinct from server/spec acceptance and from release/public plugin submission.

## Hard design constraints

- Full teacher business website↔MCP parity and no mandatory web UI (except narrowly defined secure approvals/credentials).
- Single installed connector; no generic arbitrary operation or SQL executor.
- Reuse established correct domain services, owner checks, idempotency, revisions, transaction/audit.
- No artificial “minimum number of tools” metric; optimize complete user workflows, not tool-count optics.
- No large paid-model A/B test framework; real-client checks are deliberately deferred/handled by separate release acceptance.
