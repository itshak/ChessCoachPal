> **2026-11-21 schema-ownership handoff:** All remaining planned tables, columns, constraints, RLS and persisted state from this proposal belong to the **single [consolidated schema P0](../2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** (ADR-0019). This proposal remains responsible for feature services, UX, MCP parity and independent acceptance. Its earlier DDL instructions are requirements to P0, not authority for an independent migration. No live cutover is authorized.

# Change: enforce workplace enrollment on student import and reconcile CRM records

**Status:** Proposed; not implemented or deployed.
**Priority:** P0 data integrity.
**Dependencies:** Workplace-context change and contacts/billing-identity CRM change; coordinate with one-time production cutover ADR.

## Problem
A teacher imported students from a spreadsheet, archived students without current-year attendance, then imported dated historical attendance. Student/family spreadsheet commit creates students but no workplace_enrollments. Historical attendance commit stores workplace_id on evidence but intentionally does not enroll pupils. Thus both imports can succeed while the workplace roster remains empty. MCP roster lacks workplace filter and reverse membership lookup.

## Outcome
Every newly imported student has an explicit, validated workplace enrollment when the teacher operates in a workplace-based CRM. Multiple workplaces require explicit assignment or confirmed active context; missing/ambiguous membership must block commit with actionable diagnostics, never silently pass. Existing students can gain approved memberships without duplication. Preserve distinct historical workplace attribution and archived state.

## Scope
- Spreadsheet preview, normalized mapping, MCP and website commit, SQL atomic transaction and receipts.
- Workplace selection: per-row workplace ID/name, batch default, or explicit active context; resolve against owner-scoped workplaces, reject ambiguity, unknown IDs, cross-tenant IDs, and contradictory inputs.
- For exactly one workplace, preview its proposed default. For multiple workplaces, no guessing; require selection. For zero workplaces, require creation/selection before workplace-bound import, with a documented contact-only/student-draft exception only if separately designed and explicitly surfaced.
- Existing students: idempotent identity resolution and enrollment upsert, no duplicate student, no implicit archival/reactivation changes.
- Historical importer: keep evidence associated with source workplace; do not infer current membership from old dates. Report historic-without-current-enrollment as informational, not corrupt data.
- MCP: workplace-filtered roster, enriched enrollment list, reverse student-to-workplaces lookup, import preview errors and receipts including enrollment counts.
- Production read-only audit, teacher-approved repair plan, snapshot/backup and reconciliation before any write.
- Coordinate new importer with pending contacts CRM migration; no new guardian/family coupling.

## Acceptance
Website and MCP behave identically; atomic failures leave no partial students or enrollments; archived pupils preserve historical evidence; no cross-tenant data leaks; no silent missing memberships. End-to-end scenario reproduces spreadsheet students plus up to ten dated lessons per student and verifies student/workplace/current/history relationships separately.
