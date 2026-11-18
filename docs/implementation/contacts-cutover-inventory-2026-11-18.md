# Contacts cutover dependency inventory — 2026-11-18

Status: IN PROGRESS. This inventory does not authorize production migration or deletion.

Targeted searches for guardian_id, guardians, portal_token, event_rsvps and family show references in 17 app files, 39 server modules, 14 UI components, three migration files, nine scripts and 44 E2E files. Some are incidental references; each semantic dependency must be reviewed.

| Domain | Representative consumers | Safe replacement |
| --- | --- | --- |
| Student identity | student-profile-service, teacher-guardian-service, AddStudentForm | Zero-contact students, multiple contact roles, no auto-household, preserve student history |
| Legacy family UI | families pages, FamilyForm, FamiliesManager | Contacts navigation and secondary student contact section |
| Billing and credits | teacher-billing-operations, canonical-billing-source, invoice-pdf-data, Stripe webhook | Explicit payer per invoice, preserve amounts, payment linkage and idempotency |
| Portal/events | canonical-portal-service, teacher-events-service, event-email, event-reminders, portal RSVP | Explicit principals, preserve portal tokens and RSVP until coordinated replacement |
| Import/export/restore | data-transfer.ts, teacher-transfer-service, ccp_teacher_backup_restore SQL | Full contact/link/payer backup, FK-ordered atomic restore, tenant rebinding and replay receipt |
| MCP | agent-tools.ts and app/mcp/route.ts | Typed equivalent for each website operation, PII redaction and independent readback |
| Deletion/retention | guardian deletion, tenant FKs, notification receipts | No cross-tenant links, no cascade loss of invoices, RSVP or audit history |

## Before destructive cutover

On an isolated restored copy, reconcile counts and hashes per teacher for guardians (including secondary person), student relationships, new contacts and links, invoices/items/payments, credits, event RSVPs, delivery receipts and portal credentials. Preserve stable identifiers, currencies, timestamps, audience settings and ownership. Fail closed on ambiguous person matching and orphan records. Re-run exact backup digest to verify idempotency.

## Blocking proposals

- scope-student-contact-portal: portal principals, RSVP and communication permissions.
- implement-workplace-compensation-and-billing: payer and credit attribution.
- replace-families-with-contacts: student flows, UI cutover, archive/delete and import/export.

Release rule: Do not archive OpenSpec or merge the draft until dependent consumers have safe replacements and authenticated E2E, restored-copy reconciliation and operator approval are recorded.
