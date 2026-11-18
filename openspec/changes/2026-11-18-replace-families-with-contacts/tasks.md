# Tasks: replace families with contacts

**Incremental implementation note (2026-11-18; draft PR #104, NOT an acceptance
decision):** The first contact/billing-account domain service and website/MCP
operations, independent student relationship editor, primary Contacts
navigation, non-portal contact-first new-student creation, JSON/CSV export and
atomic contact restore were added with unit, parity, and synthetic migration
checks. The main tasks below stay unchecked because legacy finance/portal
cutover, complete migration reconciliation and the exact-head release gates are
not finished. Never delete legacy guardian or issued-invoice history merely to
turn the checkboxes green. Actual live schema migration needs separate private
operator authorization and a verified restored copy.

- [ ] Inventory and document every guardians, guardian_id, family form, event/email/invoice/credit/portal, backup/import and MCP reference; capture existing tenant-owned record counts from an isolated restore.
- [ ] Define contacts, student_contacts, billing_accounts, composite tenant FKs/RLS, role/communication scopes, constraints and safe deletion/archival behavior in canonical baseline.
- [ ] Provide one-time reviewed live conversion with verified backup/restore, old/new record reconciliation, invoice/payment/RSVP preservation and rollback plan; no real-data SQL run during proposal phase.
- [ ] Move create/edit/search/link/unlink and contact preferences to shared server services and authenticated website/ccp_* MCP contracts; avoid duplicate/ambiguous student/person matches.
- [ ] Replace primary Family navigation with Contacts, move child contact actions into the student detail secondary section; remove misleading auto-created singleton households.
- [ ] Re-home invoice debtor and event RSVP/notification logic without duplicating group sessions or changing historic financial values; coordinate scoped portal transition before retiring original tokens.
- [ ] Update import/export and restore for the new current schema; no legacy export version adapters; preserve private-data redaction on MCP.
- [ ] Test multi-contact, no-contact/adult, school-plus-private, sibling, deleted/archived contact, foreign tenant, idempotent replay, duplicate contact, stale edits, email preference and insufficient permissions.
- [ ] Update strict parity registry and authenticated browser/MCP tests for every replaced website operation; en/he/ru and RTL acceptance.
- [ ] Run clean baseline, migrated restored copy, security/RLS, typecheck, strict parity, E2E, Compose, backup/restore; merge/verify/record evidence before archive.
