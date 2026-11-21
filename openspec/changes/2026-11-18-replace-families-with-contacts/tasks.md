> **2026-11-21 schema-ownership handoff:** All outstanding physical DDL, source schema/type/RLS changes and schema-generated regression tasks in this checklist are now tracked under the **single [consolidated schema P0](../2026-11-21-consolidate-final-preproduction-saas-schema/tasks.md)** (ADR-0019). Keep this proposal's functionality, UI, MCP and acceptance tasks open until independently verified. Historical SQL implementation instructions here are not independent migrations. Do not mark work complete solely because merged code exists.

# Tasks: replace families with contacts

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


**Incremental implementation note (2026-11-18; draft PR #104, NOT an acceptance
decision):** The first contact/billing-account domain service and website/MCP
operations, independent student relationship editor, primary Contacts
navigation, non-portal contact-first new-student creation, JSON/CSV export and
atomic contact restore were added with unit, parity, and synthetic migration
checks. The main tasks below stay unchecked because legacy finance/portal
cutover, complete migration reconciliation and the exact-head release gates are
not finished. Do not implement compatibility shims. At one final cutover, the operator
selects either a direct data mapping or a clean rebuild with deliberate reimport.
Old portal tokens are retired, not converted into automatic sharing grants;
backup, restore proof and authorization are required before any live operation.

- [ ] Inventory and document every guardians, guardian_id, family form, event/email/invoice/credit/portal, backup/import and MCP reference; capture existing tenant-owned record counts from an isolated restore.
- [ ] Define contacts, student_contacts, billing_accounts, composite tenant FKs/RLS, role/communication scopes, constraints and safe deletion/archival behavior in canonical baseline.
- [ ] At the **single final cutover**, provide a direct source-to-final mapping **or** a clean baseline and explicit import/reconciliation plan; verify backup/restore and selected invoice/payment/RSVP data. No interim live migrations or compatibility grants.
- [ ] Move create/edit/search/link/unlink and contact preferences to shared server services and authenticated website/ccp_* MCP contracts; avoid duplicate/ambiguous student/person matches.
- [ ] Delete Family navigation, obsolete family/guardian contracts and singleton-household side effects; expose Contacts and the student-detail contact editor, with full website/MCP parity.
- [ ] Rebuild debtor/event RSVP/notification consumers against Contacts, Billing Accounts and explicit scoped portal grants, and remove all original broad-token endpoints at final cutover. Verify any deliberately reimported financial values; no old API adapters.
- [ ] Update import/export and restore for the new current schema; no legacy export version adapters; preserve private-data redaction on MCP.
- [ ] Test multi-contact, no-contact/adult, school-plus-private, sibling, deleted/archived contact, foreign tenant, idempotent replay, duplicate contact, stale edits, email preference and insufficient permissions.
- [ ] Update strict parity registry and authenticated browser/MCP tests for every replaced website operation; en/he/ru and RTL acceptance.
- [ ] Run clean baseline, migrated restored copy, security/RLS, typecheck, strict parity, E2E, Compose, backup/restore; merge/verify/record evidence before archive.
