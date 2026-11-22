> **2026-11-21 schema-ownership handoff:** All anticipated physical persistence in this design is owned by the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** under ADR-0019. This design remains a downstream feature contract. Superseded old freeze references below are historical; no independently staged feature DDL or live database change is authorized.

# Design: person/organization relationships without households

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


## Existing dependencies
Current physical model: guardians(id, teacher_id, name, family_name, email/phone, secondary_*, email_recipients, preferred_locale, portal_token); students.guardian_id; invoices.guardian_id; event_rsvps.guardian_id; event_email_deliveries.guardian_id; direct create/import RPCs and public portal page. Enumerate actual references with a migration inventory before writing any DDL.

## Target identity model
- contacts(id, teacher_id, display_name, kind=person|organization, email, phone, preferred_locale, status, created_at, updated_at). A school representative and organization itself may be different contact records; do not claim verified identity from a typed email.
- student_contacts(teacher_id, student_id, contact_id, relationship_label, is_legal_guardian, may_receive_messages, emergency_priority nullable, active_from/to). Many-to-many; contact relationship does not grant portal access.
- billing_accounts(id, teacher_id, display_name, account_kind=person|organization, contact_id nullable, organization details optional, status). A billing account records an obligee/debtor, not an automatic portal audience.
- invoices and immutable financial history refer to billing_account_id instead of guardian_id after transition. No split allocations in this phase.

Guardrails: child-private teacher notes never included in contact lists; at least one explicit communication channel required before email. Contact may be linked to multiple students, including siblings; students need not have any. Prevent cross-tenant ID injection with composite FKs/RLS or transactional owner checks.

## Transition
For each guardian row, map the primary person to one contact and the secondary fields to a separate contact when substantive information exists. Preserve family_name as display metadata only if useful; do not synthesize legal status for the secondary person. Create student_contacts rows for existing students with historical link provenance; associate invoices to a deterministic billing account representing the original invoice debtor. Preserve issued invoices, payment receipts, credits, event RSVP decisions and notifications. Any ambiguous payer/portal grant is flagged for teacher review, not silently widened.

Old portal tokens remain secured in the rollout staging process; DO NOT grant new unrestricted student/workplace access just because the old token existed. Coordinate new scoped access with the separate portal change; no externally exposed window with broken or overbroad grants. Eliminate original guardian columns/tables/API names from the final clean baseline and shared business code once cutover and reconciliation pass.

## Shared API/MCP
Both interfaces use the same typed owner-scoped services: contacts list/detail/create/update, student_contacts manage, billing-account list/detail/manage. Read responses default to redacted contact data unless explicitly authorized. Multi-record operations use idempotency/revision and rollback-on-failure. Update scripts/mcp-website-parity.json, tool documentation, localization and real browser/delegated-MCP E2E.
