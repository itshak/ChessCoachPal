> **SUPERSEDED FOR DDL OWNERSHIP (2026-11-21; NOT IMPLEMENTED OR ARCHIVED AS ACCEPTED):** [ADR-0019](../../../../docs/adr/0019-single-final-schema-and-commercial-entitlements.md) and [the consolidated P0](../../2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md) replace this proposal as the **only active schema-changing OpenSpec**. Every unchecked requirement below was transferred to the new P0. Retained only as historical context; do **not** run a separate schema implementation from this document. The actual database and feature acceptance remain pending.

# Design: one schema-first foundation, then independent feature changes

## Delivery boundary
The source of truth is the single pre-v1 canonical baseline SQL, not incremental per-feature migrations. This change is first and owns **all** schema DDL, RLS, grants, tenant FKs/indexes, generated database types and schema-induced regression repair. Downstream proposals own feature services, UX, MCP tools, provider adapters and their acceptance; they SHALL NOT introduce planned new tables/columns. Unexpected schema gaps require a reviewed amendment to this foundation before feature work resumes, not silent ad hoc DDL.

## Domain ownership matrix
| Domain | Schema requirements | Downstream functional owner |
| --- | --- | --- |
| Teacher/workplace/locale | tenant settings, selected workplace FK, locale, effective-dated workplace links | workplace context, multilingual |
| Contacts and billing | contacts, student-contact roles, billing identities, payer assignments and history | contacts |
| Portal | scoped revocable grants, access audit, event RSVP, no inherited family-token privilege | scoped portal |
| Compensation | agreements, frozen lesson provenance, obligations, immutable payment/allocation/reversal ledger, uniqueness/idempotency | compensation |
| Ratings | FIDE identity, national memberships, extensible provider/category immutable snapshots and source evidence | FIDE/national ratings |
| Rating automation | provider/student consent revision, durable refresh jobs, lease/retry/status, dedupe and execution receipts; avoid separate snapshot model | online rating sync |
| Lessons/professional | occurrence state, exceptions/recurrence edits, audited corrections only where missing from existing model | professional workflows |
| Daily queues | prefer derived queries; persist only user decisions impossible to reconstruct | daily workflows |
| Brand/UI | no DB changes | redesign |

## Safety and operational contract
Teacher UUID is the current tenant key; workplaces are filters, not tenants. Validate FK pairs and RLS in SQL, not only app code; service-role is privileged and must be reviewed separately. A single write primary can serve stateless website/MCP replicas; shared durable queues/idempotency support later scale-out. Future tenant-based database sharding may use the same canonical schema and trusted tenant router, but is **not** part of this change. No production data touched without ADR-0017 one-time operator authorization and independent reconciliation.

## Sequencing
Inventory and reconcile schema decisions → update canonical baseline → regenerate types and contracts → fix schema-induced regressions in current consumers → negative isolation and financial/portal history tests → full GitHub exact-head checks → freeze manifest and downstream handoff. A green candidate branch does not imply that this separate schema phase has been completed.
