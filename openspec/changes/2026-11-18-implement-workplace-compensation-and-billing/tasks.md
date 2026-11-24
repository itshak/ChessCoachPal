> **2026-11-21 schema-ownership handoff:** All outstanding physical DDL, source schema/type/RLS changes and schema-generated regression tasks in this checklist are now tracked under the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/tasks.md)** (ADR-0019). Keep this proposal's functionality, UI, MCP and acceptance tasks open until independently verified. Historical SQL implementation instructions here are not independent migrations. Do not mark work complete solely because merged code exists.

# Tasks: compensation and billing contracts

> For current signed source evidence and the separate open legacy mapping, private beta, real restore/reconciliation and operator gates, see [source acceptance](SOURCE_ACCEPTANCE.md). Keep composite tasks open where those gates remain.

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


- [x] Inventory current studio rates, slots, student rates, group canonical billing, invoices, credits, payment records and employer/source-of-funds assumptions.
- [x] Define typed agreements, applicability/precedence, effective dates, cancellation/makeup rules, currencies and one-payer-per-charge policy; document unmatched/ambiguous fallback.
- [x] Define financial_obligations/earnings and payment allocations avoiding double-counted teacher hours, double-invoices, incorrect partial payments and retroactive rate rewriting.
- [ ] Update canonical baseline, owner RLS/FKs, grants, audit receipts, typed APIs, indexes and test data; produce reviewed one-time migration for known guardian invoices/rates with an explicit unresolved-state report.
- [x] Implement shared deterministic calculation for hourly, per-session, per-student and fixed-period models; keep one canonical teaching_sessions record and frozen participants.
- [ ] Add website and ccp_* MCP policy setup, preview, approve obligations, list expected earnings, record/reconcile received payments and scoped reports; preserve existing Stripe workflow safety.
- [ ] Migrate read/write invoice policy to billing_accounts; update events/credits/export/portal financial views only when access permissions are safely migrated.
- [ ] Test eight-student 90-minute hourly class = one instructor 180 ILS earning; one student privately sponsored; change payer between two lessons; fixed monthly period; canceled/makeup lessons; rate changes and late corrections.
- [ ] Test missing/ambiguous payer, reversed payment, partial payments, replay, concurrent regeneration, paid invoice immutability, wrong tenant and no false receipt from a lesson.
- [ ] Update website/MCP parity registry, E2E, localized currencies/timezones, finance audit/security and backup/restore; verify CI/Compose and main before archive.
