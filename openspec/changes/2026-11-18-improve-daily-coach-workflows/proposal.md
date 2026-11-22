> **2026-11-21 schema-ownership handoff:** All remaining planned tables, columns, constraints, RLS and persisted state from this proposal belong to the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** (ADR-0019). This proposal remains responsible for feature services, UX, MCP parity and independent acceptance. Its earlier DDL instructions are requirements to P0, not authority for an independent migration. No live cutover is authorized.

> **Execution reconciliation (2026-11-19):** Follow [the reconciled execution sequence](../../../docs/OPENSPEC_RECONCILED_EXECUTION_SEQUENCE_2026-11-19.md). The new [temporal enrollment and credit-safe lifecycle change](../2026-11-19-temporal-enrollment-credit-safe-lifecycle/proposal.md) must be included in the canonical schema **before final freeze acceptance**. Earlier "schema freeze first" wording means governance and inventory first, not final approval before this amendment. No per-feature production migration; this proposal's feature implementation follows its stage dependencies.

# Change: action-oriented daily coach dashboard and lesson preparation/completion

> **Schema-first execution gate (2026-11-19):** [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md) is the **mandatory first implementation change**. All schema DDL, tenant/RLS/FK/index work, generated DB types and schema-induced regressions belong to that change; the reviewed schema freeze has passed; this proposal implements remaining business functionality against the locked baseline and its own dependencies. Its existing schema statements describe requirements for the foundation, **not** permission to add per-feature DDL later. Operator-only SaaS and future shard-compatible UUID/RLS design follow [ADR-0018](../../docs/adr/0018-operator-only-saas-and-tenant-scaling.md); no customer self-hosting or live cutover is authorized.


> **ADR-0017 final-cutover override (2026-11-18):** No backward compatibility or legacy dual-writes before v1. The final deliverable uses the clean canonical baseline and current website/MCP contracts. All planned features deploy with **one final** live migration **or** verified clean rebuild/reimport at the operator's choice; no per-feature production migration. Existing data handling is a deliberate one-time import/mapping decision, not an obligation to retain obsolete Family/Studio/guardian APIs or old portal tokens. Security, tenant isolation and explicit new grants remain required.


**Status:** Proposed implementation; product-direction approved, no UI/app code changed.
**Priority:** P1 after workplace context, can proceed separately from full finance/portal.
**Depends on:** 2026-11-18-add-workplace-context-and-retire-studio.

## Why
The dashboard currently lists global totals and a few upcoming/recent sessions, but does not function as a reliable day-to-day coaching action queue. Coach-specific briefings already exist in lib/server/coach-briefing.ts, yet require navigating into an individual profile. Spreadsheet import can populate real historical records and archived learners, but the coach needs quick review and reconciliation, not more unsorted admin fields. MCP is the primary interaction and must expose focused workflows without losing parity.

## Outcome
A teacher entering ChatGPT/Claude or opening the website can quickly answer: Who am I teaching next? What did we previously cover? What homework is unfinished? Which lessons need attendance/notes? What evidence is verified vs unknown? Provide compact, actionable next-lesson cards and a fast deterministic lesson-close flow for individuals and groups.

## Scope
- Workplace-aware Today / Upcoming action queue, teacher-local timezone, group sessions counted once, student roster and helpful warnings: unmarked attendance, incomplete lesson capture, due homework, stale provider rating/failed provider checks.
- Per-lesson Preparation Briefing reuses existing deterministic coach-briefing and material/assignment history for each authorized learner; group view aggregates shared curriculum without disclosing private student notes to other students.
- Fast lesson completion: confirmed per-participant attendance, shared and private notes, exact materials assigned/taught where verified, next action and optional homework; preserves distinction taught vs mastered, archived history, session vs participant notes.
- Student overview with recent lessons, assignments, ratings/provenance and material evidence, filtered by workplace without duplicate student records.
- Optional import reconciliation panel for spreadsheet imports: identify ambiguous aliases/duplicate students, unmatched historic rows, mixed workplace identity and archive handling. Require teacher preview and explicit approval for irreversible corrections.
- Compact task-oriented MCP workflow tools (today list, lesson prepare, lesson close review/commit, import review), using same typed domain APIs as web, not an alternate AI writer.

## Explicit deferrals
No mandatory LLM-generated coaching claims, autonomous student messages, AI mastery scoring, large calendar redesign, automatic payment, compulsory public ratings, scheduled autonomous actions requiring external approval or student portal training features.

## Acceptance
A completed group session appears once as teacher work and as participant-specific evidence, with no invented attendance or mastery. Website and MCP agree on exactly which actions remain. An empty/missing provider/assignment is labeled unknown, not silently inferred.

> **Cross-change schema coordination (2026-11-19):** No committed new table yet; may require persisted queue state after inventory. Prefer derived queues from canonical sessions and students where practical. See [`../SCHEMA_ROADMAP.md`](../SCHEMA_ROADMAP.md) for shared dependencies and ADR-0017 single-final-cutover rules. Passing the Contacts/Finance PR does not automatically accept this proposal.

## Amendment (2026-11-21): recover archived learners during conversational lesson capture
A teacher recording a new individual or group lesson for a previously archived learner needs a clear recovery choice in ChatGPT/Claude **and** the website, not an ambiguous “student not found”. Extend the shared daily lesson capture/preview UX to surface the exact archived match and ask for reviewed reactivation and workplace selection. An explicit no leaves the student and proposed lesson untouched. An affirmative confirmation commits new teaching and the necessary lifecycle changes together through the temporal-enrollment domain transaction, not separate agent-side calls. This depends on `2026-11-19-temporal-enrollment-credit-safe-lifecycle`; the daily workflow must not implement its own quota, archive or membership logic. Historical correction and approved historical attendance capture remain available without reactivation. No change is claimed implemented by this proposal amendment.
