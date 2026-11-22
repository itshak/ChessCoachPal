> **2026-11-21 schema-ownership handoff:** All remaining planned tables, columns, constraints, RLS and persisted state from this proposal belong to the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** (ADR-0019). This proposal remains responsible for feature services, UX, MCP parity and independent acceptance. Its earlier DDL instructions are requirements to P0, not authority for an independent migration. No live cutover is authorized.

> **Execution reconciliation (2026-11-19):** Follow [the reconciled execution sequence](../../../docs/OPENSPEC_RECONCILED_EXECUTION_SEQUENCE_2026-11-19.md). The new [temporal enrollment and credit-safe lifecycle change](../2026-11-19-temporal-enrollment-credit-safe-lifecycle/proposal.md) must be included in the canonical schema **before final freeze acceptance**. Earlier "schema freeze first" wording means governance and inventory first, not final approval before this amendment. No per-feature production migration; this proposal's feature implementation follows its stage dependencies.

# Change: replace inherited families with contacts and billing identities

> **Schema-first execution gate (2026-11-19):** [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md) is the **mandatory first implementation change**. All schema DDL, tenant/RLS/FK/index work, generated DB types and schema-induced regressions belong to that change; the reviewed schema freeze has passed; this proposal implements remaining business functionality against the locked baseline and its own dependencies. Its existing schema statements describe requirements for the foundation, **not** permission to add per-feature DDL later. Operator-only SaaS and future shard-compatible UUID/RLS design follow [ADR-0018](../../docs/adr/0018-operator-only-saas-and-tenant-scaling.md); no customer self-hosting or live cutover is authorized.


> **ADR-0017 final-cutover override (2026-11-18):** No backward compatibility or legacy dual-writes before v1. The final deliverable uses the clean canonical baseline and current website/MCP contracts. All planned features deploy with **one final** live migration **or** verified clean rebuild/reimport at the operator's choice; no per-feature production migration. Existing data handling is a deliberate one-time import/mapping decision, not an obligation to retain obsolete Family/Studio/guardian APIs or old portal tokens. Security, tenant isolation and explicit new grants remain required.


**Status:** Proposed implementation — accepted direction in ADR-0016; no code/database change yet.
**Priority:** P0 core domain.
**Depends on:** 2026-11-18-enforce-baseline-live-transition-contract.
**Coordinated cutover:** 2026-11-18-scope-student-contact-portal and 2026-11-18-implement-workplace-compensation-and-billing.

## Why
Current students.guardian_id enforces one guardian/household while real students may have mother, father, grandmother, school, sponsor and authorized other contacts, across school and private lessons. Existing guardians hold two people and one portal token; invoices, event RSVPs, emails and student creation depend on that representation. Family is an incorrect top-level ChessCoachPal product entity, but those working functions and real records must survive.

## Outcome
Use canonical contacts, zero-to-many student-contact relationships, and optional billing accounts for persons or organizations. Make students creatable without any contact, explicitly scope communication roles, preserve existing invoicing/history and remove Family-as-primary UI, vocabulary and legacy endpoints after safe coordinated migration.

## Scope
- New owner-bound contacts and student_contacts join model with role and per-student contact/authorization flags; avoid embedding arbitrary second-contact columns.
- Person/organization billing_accounts with explicit invoice debtor; each existing guardian invoice maps deterministically to a migrated account. A student may share a contact/account with siblings but not inherit payment for every workplace lesson.
- Student profile secondary Contacts section, Contacts directory, contact linking/unlinking, payer selection and optional communication locale en/he/ru; no prominent Add to family beside name.
- Update create/import/export/recovery, events and RSVP, email routing, invoices, credits, notifications, contact deletion/retention, GDPR-like export/removal paths, website routes and matching ccp_* MCP tools.
- Transition existing guardians and both primary/secondary contact details without losing communication preferences, existing payments, invoices, relationships or audit provenance.

## Non-goals
No dedicated minor/student login, portal access by mere contact membership, multi-party split invoices, full accounting/tax, household CRM, or individual-person authentication requirement. Avoid exposing contact emails or secrets through default MCP list results.

## Acceptance
A student with zero contacts and two contacts can be created and edited by both website and MCP. Mother and school contact coexist without changing lesson identity; school does not inherit private billing. Historical invoices are preserved. New schema is in the baseline; one-time live migration and coordinated portal cutover are independently approved and tested.

> **Cross-change schema coordination (2026-11-19):** Existing candidate: contacts, student links, billing accounts; final cutover/reconciliation pending. Legacy mapping and financial preservation remain explicit release gates. See [`../SCHEMA_ROADMAP.md`](../SCHEMA_ROADMAP.md) for shared dependencies and ADR-0017 single-final-cutover rules. Passing the Contacts/Finance PR does not automatically accept this proposal.
