# Design — user-workflow-first MCP without sacrificing parity

**Status:** Proposed design for `optimize-mcp-coaching-workflows`; no implementation implied.  
**Date:** 2026-11-17

## 1. Baseline and problem decomposition

Current architecture is a single authenticated `/mcp` gateway over shared teacher-scoped domain services. The website has equivalent routes; strict parity and synthetic cross-interface E2E are already established. `lib/server/agent-tools.ts` holds an extensive catalogue, Zod/root-object schemas and dispatch wiring. For example, current tools include `ccp_lessons_history_unified`, `ccp_students_bulk_lifecycle_preview/commit`, `ccp_billing_generation_preview/commit`, `ccp_reports_workplace_summary`, material catalog/link/evidence operations, coach briefing, and specialized combined lesson/chapter operations. Some task-oriented work already exists and must be **reused**, not blindly duplicated.

Four independent things must be optimized:

- **Tool discoverability:** Will an agent find the correct operation from its user-goal-oriented name/description?
- **Tool selection ambiguity:** Are several names too similar or descriptions misleading about side effects?
- **Orchestration burden:** How many separate decisions/writes must the agent make, even after it finds the right tools?
- **Business safety:** Can one failed or retried step leave incomplete lesson, material, attendance, money or messaging state?

A small `tools/list` alone does not establish improvements in any of these. Client-native progressive discovery may avoid loading all definitions; we cannot force its behavior with server-only category metadata.

## 2. Architecture

```text
Teacher in ChatGPT / Claude / Codex / compatible agent
      |
      | one OAuth-authorized ChessCoachPal connector: /mcp
      v
Named workflow operations (preferred common intents)
Named granular operations (all authorized teacher controls)
      |
      v
Canonical typed schemas + teacher/scope/entitlement authorization
      |
      v
Shared owner-scoped domain application services
      |-- identity + aliases + timezone + schedule
      |-- lessons/participants/attendance + learning evidence
      |-- materials/assignments + corrections/revisions
      |-- reports/workplaces + guarded finance/communications
      |
      v
Transactional persistence + audit/replay + bounded receipts
      ^
      |
Website: viewer/editor + browser-only credentials/secure approvals
```

The **workflow operation is an application-service command**, not a magic meta-tool whose parameters specify arbitrary hidden API names. Every exposed operation has its own documented name, schema, authorization policy, semantics, behavior tests and audit.

## 3. Catalog review and governance

Before changing names, produce `docs/MCP_TOOL_WORKFLOW_AUDIT.md` (or another public technical inventory) from the real catalog and route/service registry. Suggested columns:

| Field | Required observation |
| --- | --- |
| Name + description | Exact currently advertised `ccp_*` name; intent keywords, reads/writes, limitations |
| Input/output | Root JSON Schema and bounded structured output; required fields/edge conditions |
| Permission | OAuth scopes, tenant/workplace ownership, applicable business entitlement, approval |
| Domain | students, lessons, materials, scheduling, reports, finance, communication, settings |
| Service / parity | Canonical service function, website route, strict parity case/test |
| Workflow | Common user intent(s), model-driven prerequisite sequence and conflict with similarly named tools |
| Disposition | **KEEP**, **REWORD**, **COMPOSE**, **GRANULAR-ONLY**, **RENAME**, **REMOVE-REDUNDANT** or **DEFER** with rationale |

- Inspect actual tool names/dispatch and all website route mappings; **never** use the old `ccp_v1_*` proposal table as a current catalog.
- Prefer plain, action-oriented `ccp_<domain>_<action>` names per ADR-0006. Renames before v1 may be breaking, but require exact-name contract updates and synthetic/parity/regression evidence.
- Avoid name collisions, vague “manage”, misleading claims, identical descriptions for materially different effects, unbounded input/result payloads and duplication of domain validation in the MCP adapter.
- Where similar tools legitimately differ (private lesson vs group, draft vs sent invoice, evidence vs assignment), state the selection rule explicitly.
- Generate a **manifest quality check** in CI: unique names, normalized descriptions, root-object input schema, read-only/destructive/open-world hints consistent with effects, correctly mapped dispatch service, permission mapping, size/format bounds and no accidental public credentials.

## 4. Higher-level workflow patterns

### 4.1 Normal completed lesson

Teacher: “Yesterday I taught Daniel and Michael for 90 minutes; Lucena, Daniel struggled.”

**Preferred interaction:** one typed request for preview (which may resolve names/time/material under the hood), clarification *only when genuinely ambiguous*, one explicit commit when warranted, and a final bounded receipt. Avoid requiring the model to separately create a group, two sessions, two attendance rows and evidence records.

**Backend:** resolve stable identities/aliases, detect duplicate roster references, use teacher-local timezone or explicit supplied times, distinguish scheduled vs completed, correct teacher minutes once, attach a *student-specific* Lucena observation, and preserve explicit unknown mastery. The commit must be transactional and idempotent. Never infer the second student struggled. Read-back should be possible via both interfaces; receipt must provide durable IDs, participant summaries, linked material/evidence status and warnings.

**Existing work:** audit `ccp_lessons_capture_preview`, relevant completion and the combined `ccp_lessons_capture_commit_with_chapter` before adding anything. A redundant high-level tool is a negative outcome.

### 4.2 Lesson with material that does not yet exist

Teacher: “In today's lesson with Daniel, we introduced rook-pawn endgames. Save the new material and mark it as taught.”

**Preferred:** one preview resolves an existing material by canonical match or proposes a new typed material and the associations; an atomic commit creates any new material *and* the actual lesson/evidence relations. Do not mark an unrelated learner as taught or treat a mere link as mastery.

**Backend:** distinguish new vs existing materials, typed game/puzzle/study chapter/link/drill constraints, authorization, unique match/ambiguity, exact study/chapter identity, lesson participation, per-student evidence kind/source, revisions and idempotency. Where an external Lichess write is involved, use explicit consent, outbox/reconciliation, partial-failure visibility and safe retry; do not falsely claim a distributed transaction is atomic.

**Fallback:** granular create/get/update/link/void operations remain discoverable for precise corrections, one-off tasks and advanced use.

### 4.3 Correction and archival

Teacher: “Michael was absent, and I assigned the exercise to Daniel only.”

Preview affected session, participant attendance and learning evidence; confirm a revision-checked compound correction. Preserve prior evidence, void rather than silently delete where required. For archive/reactivate, reuse existing impact/commit flows, active-only quota, unchanged canonical student ID, future commitments and historical visibility. Do not make an irreversible change without teacher approval.

### 4.4 Read-oriented coaching briefings and reports

Teacher: “What should I review with Daniel today?” Retrieve bounded, cited/traceable teaching records: sessions attended, verified evidence, teacher observations, remaining review needs and unknowns. Recommendations must be labelled as model/teacher suggestions, not measured proficiency. Reuse existing coach briefing service when sufficient.

Teacher: “How many hours did I teach at the club last month?” Use deterministic existing report service rather than asking the model to assemble and sum raw attendance rows. Accurate workplace-local dates and group-time deduplication are mandatory.

### 4.5 Finance, messaging and large imports

Never optimize external actions by bypassing preview, consent, owner checks or transaction/replay semantics. A composite workflow MAY coordinate bounded backend steps but should not combine draft generation with sending email or initiating payment unless each distinct side effect has explicitly reviewed confirmation and retry-safe reconciliation. Safeguarded browser handoffs remain for card entry, credentials and protected large file uploads.

## 5. What to do with “meta MCP commands”

**Default: do not add generic meta-execution.** A `ccp_execute(operationName, payload)` or SQL/route dispatcher merely hides the catalog and makes reviewability, authorization, discovery and client compatibility worse.

**Permitted composition:** domain-named commands such as `ccp_lessons_capture_*` or `ccp_materials_assign_to_lesson_*` that expose one typed teacher outcome and coordinate multiple *known* services server-side. A small read-only `ccp_capabilities_summary` can be considered only if normal client tool discovery demonstrably needs it; it cannot be required to discover hidden operations or replace normal `tools/list`.

**Preview/commit safety:** A prepared preview may return an expiring owner-bound identifier/digest; commit MUST recheck permissions, source revisions, constraints and user confirmation. Use an immutable idempotency key and return a replayable receipt. Avoid broad write tools with opaque JSON or arbitrary patch execution.

## 6. Context use and client discovery

- The MCP server SHALL continue to advertise all **authorized** standard tools to clients through `tools/list`; hosts with native ToolSearch may index rather than load every full schema into context. The server cannot guarantee the host's context strategy.
- Tool namespaces/categories are documentation and retrieval aids, **not** a portable “load this section” instruction. No dynamic per-turn hide/show based on previous operations; privilege-dependent catalogs must be stable per authorization context and must not leak cross-tenant/tool data.
- Retain typed `coach:read` and `coach:write`; check scope and business entitlement at every call even if absent from tool list. A Free/Pro subscription must not be inferred from OAuth scope. Paid product billing-management handoff and coach-to-student finance are distinct.
- Reduce unnecessary descriptions, high-entropy optional fields and huge read payloads; still include all parameters relevant to the workflow and preserve non-default field forwarding.
- Skills are optional supplements, **not mandatory installation** for core tasks. A native bundled workflow guide may be evaluated only if tool descriptions plus composite operations are insufficient.

## 7. Acceptance methodology (model-API-free)

We are **not** designing a paid-token agent benchmark in this change. Use a synthetic, deterministic test matrix:

1. **Static catalog audit:** names, descriptions, JSON schemas, exact dispatch mappings, no hidden website-only teacher actions, and scope/entitlement matrix.
2. **Golden workflow scenarios:** exercise each composite with authenticated delegated MCP and equivalent website/domain service. Assert the **persisted state**, receipts, read-back and side effects—not just a successful HTTP response.
3. **Controlled errors:** ambiguous names, duplicate alias/reference, missing time, conflict with scheduled slot, material name collision, stale revision, changed-key retry, validation refusal and empty/missing external provider metadata.
4. **Failure safety:** mid-transaction error produces no ghost session or orphaned evidence; distinct external upstream operations use outbox/reconciliation instead of unsupported “atomic” claims.
5. **Security:** read-only/expired/revoked token, foreign owner, underprivileged entitlements, protected student/guardian info and secret redaction.
6. **Parity:** exact current strict `npm run mcp:parity:strict` + same-PR guard, new named website↔MCP E2E for each touched domain, plus existing 93 historical and 26 chess/canonical acceptance cases.
7. **Operational gates:** latest applicable unit/typecheck/lint, canonical DB installation and safe update path, Security, E2E, Compose and backup/restore workflows on exact commit/merged main.
8. **Agent burden proxy:** for each common user scenario record the *minimum safe client-visible sequence* before/after (e.g. resolve → list → create → attach → evidence → read versus preview → commit → receipt). It is a design metric, **not actual model token/accuracy measurement**. Explicit confirmations or disambiguation are never counted as inefficiencies to be eliminated.

**Success criteria:** No loss of authorized website/MCP operations or existing passing acceptance; materially simpler common lesson/material journeys with backend-owned validation and meaningful receipts; no increase in unsafe implicit writes. Do not gate the implementation on a subscription-based Codex/Claude experiment. Actual vendor client certification remains honest and separate.

## 8. Increment plan and decisions

- **Increment A:** current inventory + intent matrix + naming/description/schema review. No behavioral changes.
- **Increment B:** highest-value *existing* lesson capture and material evidence orchestration gaps; first composite improvements where needed; keep granular tools.
- **Increment C:** corrections, briefings, reporting and administrative journeys only where inventory establishes a call-sequence problem.
- **Increment D:** CI quality guard, full synthetic regression, docs, new accepted ADR, merged-main evidence and archive.

**Open implementation questions:** Which of the current `ccp_*` operations already supply each end-to-end outcome? Where do website and MCP presently call the same atomic service? Which composites can safely combine separate writes without hidden financial, communication or external-provider side effects? Which optional fields can be simplified without losing field parity? Does any host need a special compatibility approach rather than native discovery?

Do not decide these questions by guessing from user-visible tool counts. Source and synthetic traces first; real-client live checks only where required by existing release policy.

## 9. External design references

- https://developers.openai.com/plugins/plan/tools
- https://developers.openai.com/plugins/plugin-guidelines
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/concepts/skills

These are guidance references, not proof that ChessCoachPal's real ChatGPT or Claude client has passed acceptance.
