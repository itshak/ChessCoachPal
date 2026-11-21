> **SUPERSEDED FOR DDL OWNERSHIP (2026-11-21; NOT IMPLEMENTED OR ARCHIVED AS ACCEPTED):** [ADR-0019](../../../../docs/adr/0019-single-final-schema-and-commercial-entitlements.md) and [the consolidated P0](../../2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md) replace this proposal as the **only active schema-changing OpenSpec**. Every unchecked requirement below was transferred to the new P0. Retained only as historical context; do **not** run a separate schema implementation from this document. The actual database and feature acceptance remain pending.

# Implementation and verification checklist — check only evidenced work

> Incremental source-only evidence (2026-11-21): the [canonical public-table RLS coverage guard](../2026-11-21-guard-canonical-public-table-rls/ARCHIVE_DECISION.md) from PR #110 is accepted and archived separately. This is a static regression guard, not full RLS/tenant proof, domain ownership approval, final schema freeze or data cutover. All existing unchecked tasks below remain open.


- [x] Inventory all active proposals and exact current SQL/table/RLS/type coverage; document missing, existing, deferred, duplicate candidates. Evidence: `docs/SCHEMA_FREEZE_INVENTORY_2026-11-20.md` (static source inventory; not schema-freeze or production acceptance).
- [ ] Approve one domain ownership matrix and schema freeze boundaries with all downstream changes.
- [ ] Finalize canonical Contacts, students, workplace, locale, scoped portal and financial/ledger structures without duplicate obligations.
- [ ] Finalize FIDE/national identities and generalized immutable snapshots, consent, durable rating refresh jobs, dedupe/retry receipts and provenance.
- [ ] Inventory recurrence, lesson states and daily queues; implement only necessary persistent schema, audit and indexes.
- [ ] Enforce teacher UUID ownership, tenant-safe FKs, RLS/grants, indexes, privileged service boundaries and cross-workplace semantics.
- [ ] Regenerate DB/TypeScript types and update existing UI/MCP consumers and fixtures to match; no new feature implementation.
- [ ] Run schema guard and canonical no-legacy audit, fresh-install, RLS negative A/B, Auth/Storage, financial invariants and idempotency tests.
- [ ] Run full exact-head GitHub CI, authenticated E2E website/MCP, security, Compose, backup and second-empty-instance restore; resolve all regressions without suppressions.
- [ ] Publish schema freeze manifest, downstream no-DDL handoff and reviewed remaining feature scope.
- [ ] Keep production cutover and historical reconciliation separately gated; do not reset or deploy live data automatically.
