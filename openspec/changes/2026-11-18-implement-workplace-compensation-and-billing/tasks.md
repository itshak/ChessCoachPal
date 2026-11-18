# Tasks: compensation and billing contracts

- [ ] Inventory current studio rates, slots, student rates, group canonical billing, invoices, credits, payment records and employer/source-of-funds assumptions.
- [ ] Define typed agreements, applicability/precedence, effective dates, cancellation/makeup rules, currencies and one-payer-per-charge policy; document unmatched/ambiguous fallback.
- [ ] Define financial_obligations/earnings and payment allocations avoiding double-counted teacher hours, double-invoices, incorrect partial payments and retroactive rate rewriting.
- [ ] Update canonical baseline, owner RLS/FKs, grants, audit receipts, typed APIs, indexes and test data; produce reviewed one-time migration for known guardian invoices/rates with an explicit unresolved-state report.
- [ ] Implement shared deterministic calculation for hourly, per-session, per-student and fixed-period models; keep one canonical teaching_sessions record and frozen participants.
- [ ] Add website and ccp_* MCP policy setup, preview, approve obligations, list expected earnings, record/reconcile received payments and scoped reports; preserve existing Stripe workflow safety.
- [ ] Migrate read/write invoice policy to billing_accounts; update events/credits/export/portal financial views only when access permissions are safely migrated.
- [ ] Test eight-student 90-minute hourly class = one instructor 180 ILS earning; one student privately sponsored; change payer between two lessons; fixed monthly period; canceled/makeup lessons; rate changes and late corrections.
- [ ] Test missing/ambiguous payer, reversed payment, partial payments, replay, concurrent regeneration, paid invoice immutability, wrong tenant and no false receipt from a lesson.
- [ ] Update website/MCP parity registry, E2E, localized currencies/timezones, finance audit/security and backup/restore; verify CI/Compose and main before archive.
