> **Execution reconciliation (2026-11-19):** Follow [the reconciled execution sequence](../../../docs/OPENSPEC_RECONCILED_EXECUTION_SEQUENCE_2026-11-19.md). The new [temporal enrollment and credit-safe lifecycle change](../2026-11-19-temporal-enrollment-credit-safe-lifecycle/proposal.md) must be included in the canonical schema **before final freeze acceptance**. Earlier "schema freeze first" wording means governance and inventory first, not final approval before this amendment. No per-feature production migration; this proposal's feature implementation follows its stage dependencies.

# Change: persistent workplace context and removal of inherited Studio abstraction

> **Schema-first execution gate (2026-11-19):** [`2026-11-19-freeze-unified-saas-schema-and-regressions`](../2026-11-19-freeze-unified-saas-schema-and-regressions/proposal.md) is the **mandatory first implementation change**. All schema DDL, tenant/RLS/FK/index work, generated DB types and schema-induced regressions belong to that change; this proposal must wait for its reviewed schema freeze and passing exact-head gates before implementing its remaining business functionality. Its existing schema statements describe requirements for the foundation, **not** permission to add per-feature DDL later. Operator-only SaaS and future shard-compatible UUID/RLS design follow [ADR-0018](../../docs/adr/0018-operator-only-saas-and-tenant-scaling.md); no customer self-hosting or live cutover is authorized.


> **ADR-0017 final-cutover override (2026-11-18):** No backward compatibility or legacy dual-writes before v1. The final deliverable uses the clean canonical baseline and current website/MCP contracts. All planned features deploy with **one final** live migration **or** verified clean rebuild/reimport at the operator's choice; no per-feature production migration. Existing data handling is a deliberate one-time import/mapping decision, not an obligation to retain obsolete Family/Studio/guardian APIs or old portal tokens. Security, tenant isolation and explicit new grants remain required.


**Status:** Proposed implementation; accepted architectural direction in ADR-0016.
**Priority:** P0 functional teacher workflow.
**Depends on:** 2026-11-18-enforce-baseline-live-transition-contract.
**Coordinates with:** 2026-11-18-implement-workplace-compensation-and-billing; 2026-11-18-improve-daily-coach-workflows.

## Why
Today, the teacher dashboard links workplace count to management, while ChessCoachWorkspace, reports and lesson history have independent local workplace selects. Students, lessons, schedule and learning views lack one persistent teaching context. Studio settings are still stored as a single global studio_policies record; workplace.policy is a loose JSON object with no automatically applied compensation behavior. Group membership and workplace membership are related but not equivalent.

## Outcome
Introduce a durable global All Workplaces / named-workplace selector that scopes all relevant teacher views without changing actual data ownership. Clarify groups as teaching rosters and workplaces as business contexts. Replace Studio-specific navigation/settings with teacher/business defaults and workplace-local operational settings. Every teacher has an implicit Personal Teaching workplace usable by Free teachers, including groups and private sessions.

## Scope
- Persist selected workplace in teacher UI session/profile preference with safe default and stale-workplace fallback. Use server-verifiable workplace IDs, not a security grant; teacher can always select All Workplaces.
- Filter dashboard, students (by current enrollment, plus separately labeled historic involvement where relevant), lesson history, schedule, materials context, reports and action queue consistently; keep filter when navigating pages.
- Allow workplace-specific defaults when creating students/enrollments/groups/lessons, but do not silently move a student or rewrite historical workplace on a filter change. Multiple workplace membership remains valid.
- Make workplace count on dashboard navigate to selected workplace view; provide explicit Manage Workplaces action. Group pages filter within workplace without becoming a competing global context.
- Move teacher-level settings and name, integration credentials, interface locale, security and notifications away from Studio concept; move eligible policy/timezone/currency/branding defaults to workplace-level settings with explicit fallback rules.
- Implement selected workplace state and setting operations via shared teacher service and website/MCP, including GET/SET, tenant checks and profile history where appropriate.

## Product gates
Hosted Free supports one implicit personal workplace and freely usable groups; additional named professional workplaces are a future Pro entitlement only once approved/communicated. Existing beta teachers/workplaces and their data MUST NOT become inaccessible due to an unannounced gate. Exact student quota, workplace quota, pricing and period of beta preview remain separate product decisions.

## Non-goals
Not a second database/tenant per workplace, not group-as-workplace, not blanket workplace RLS replacing teacher ownership, and not implementation of accounting/compensation calculations (separate change). No dark-mode redesign required here.

## Acceptance
Switching to School shows its student enrollments, group sessions, schedule and reports; switching to Personal shows private lessons. All shows complete teacher history. One student appearing in both contexts remains one canonical record. No historic lesson is relabeled; website and MCP filters agree.

> **Cross-change schema coordination (2026-11-19):** Existing candidate: teacher workplace selection and scoped ownership; verify current baseline and acceptance. The workplace selector E2E was failing on eaef867 parent; recheck exact-head E2E. See [`../SCHEMA_ROADMAP.md`](../SCHEMA_ROADMAP.md) for shared dependencies and ADR-0017 single-final-cutover rules. Passing the Contacts/Finance PR does not automatically accept this proposal.
