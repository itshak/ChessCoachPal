> **2026-11-22 candidate update:** Draft [PR #115](https://github.com/itshak/ChessCoachPal/pull/115) now contains the consolidated SQL/types/services candidate (**105 public tables, 60 directly typed**), audited entitlement transitions, archived-student capacity-race test ported from draft #113, and focused professional-capacity, ratings and report-sharing checks. **Not frozen or merged:** exact-head CI, source/type ownership, crosswalk and Phase 2 signoff remain required. PR #113 retains historical test evidence; do not merge its old hosted-plan test directly over the normalized schema.

# ChessCoachPal OpenSpec — active work and acceptance tracker

**Current planning checkpoint: 2026-11-21.** [ADR-0019](../../docs/adr/0019-single-final-schema-and-commercial-entitlements.md) establishes exactly **one active schema-changing P0 proposal**: [final production-ready schema + Freemium foundation](2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md). Its [87-table source crosswalk](../../docs/FINAL_SCHEMA_REQUIREMENTS_CROSSWALK_2026-11-21.md) and [acceptance matrix](../../docs/FINAL_SCHEMA_ACCEPTANCE_MATRIX_2026-11-21.md) are **proposed review artifacts**, not SQL implementation, production proof or freeze acceptance.

The earlier [2026-11-19 schema-freeze proposal](archive/2026-11-19-freeze-unified-saas-schema-and-regressions-superseded/proposal.md) is **SUPERSEDED for DDL ownership, not implemented or silently accepted**. All its unchecked requirements have been transferred into the consolidated P0. Its historical files remain for traceability; never execute them as an independent schema workstream.

## Current GitHub/production evidence

- Inspected GitHub main: `5b6d178d91382928ebc7c799dd05204c3a76ba0b` (2026-11-21 before this documentation branch). The current source includes merged #104 (Contacts/finance), #107 (import), #108 (temporal membership/credits), #110/#111 (RLS guard) candidates and acceptance notes. A merge does **not** imply OpenSpec acceptance or production cutover.
- At review, one open draft PR: [#113](https://github.com/itshak/ChessCoachPal/pull/113), concurrency regression for archived-lesson capacity; **no competing DDL**. Recheck PR inventory on implementation day.
- The fresh-install baseline declares 87 public application tables and RLS-enables; the earlier static inventory identified 40 explicitly typed table contracts and 47 without matching hand-maintained entries. Effective policy/grant and typegen acceptance remain pending.
- **No live database change or deployment is authorized** by a documentation PR, schema freeze or previously passing synthetic CI. ADR-0017 requires independently restored off-host data, exact operator approval and reconciled Auth/Storage/student/finance/portal records before any cutover. Do not copy sensitive data, private commercial strategy, unapproved prices/limits, secrets or operational exports into public GitHub.

## One P0 schema owner; remaining changes are functional only

| Active OpenSpec change | Schema authority | Remaining feature/acceptance work |
| --- | --- | --- |
| **[Final schema incl. Freemium (P0)](2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** | **Only active owner of all pre-production DDL, type/RLS/FK/index and schema-induced regressions** | 87-table/field crosswalk, entitlement and subscription foundation, recurrence/report persistence, tested freeze manifest, separate operator cutover |
| [Temporal enrollment, credit-safe lifecycle](2026-11-19-temporal-enrollment-credit-safe-lifecycle/proposal.md) | Handed to P0 | Preview/commit, audited credits, archived lesson lifecycle, exact-head/real-data acceptance |
| [Workplace import enrollment](2026-11-19-enforce-workplace-enrollment-on-student-import/proposal.md) | Handed to P0 | Fail-closed import, idempotent reconciliation, website/MCP |
| [Contacts and billing identity](2026-11-18-replace-families-with-contacts/proposal.md) | Handed to P0 | Source mapping, consent, UI/MCP, historical reconciliation |
| [Scoped student/contact portal](2026-11-18-scope-student-contact-portal/proposal.md) | Handed to P0 | Grant validation, old-token transition, guest privacy and parity |
| [Workplace compensation/billing](2026-11-18-implement-workplace-compensation-and-billing/proposal.md) | Handed to P0 | Agreement and finance services, approved ledger actions and reports |
| [Workplace context / Studio retirement](2026-11-18-add-workplace-context-and-retire-studio/proposal.md) | Handed to P0 | All-workplaces selector, Personal/Professional access, filters and account UX |
| [FIDE and national ratings](2026-11-18-introduce-fide-national-ratings/proposal.md) | Handed to P0 | Approved provider adapters, provenance, official evidence and parity |
| [Automatic online ratings](2026-11-18-automate-online-rating-sync/proposal.md) | Handed to P0 | Consent UI/MCP, provider worker/lease/backoff and read-back |
| [Daily coaching workflows](2026-11-18-improve-daily-coach-workflows/proposal.md) | Handed to P0 | Derived Today queue, lesson close, briefing and archived learner UX |
| [Professional coach workflows](2026-11-18-extend-professional-coach-workflows/proposal.md) | Handed to P0 | Recurrence editing, approved reports, reconciliation and audit |
| [Multilingual support](2026-11-17-introduce-multilingual-support/proposal.md) | Handed to P0 | Full translation/RTL/a11y, stable MCP presentation and reports |
| [Coach branding/redesign](2026-11-18-explore-brand-and-redesign-coach-ui/proposal.md) | No planned DDL | Approved design comparison, staged implementation and a11y |

**13 active changes** are listed: one consolidated P0 schema proposal and 12 downstream functional proposals. The old unfinished schema-freeze proposal is no longer independently actionable; it was superseded **without being marked completed**. All previous archived changes remain historical records; do not reopen them or infer passing deployment from archive status.

## Required sequence

1. Review [ADR-0019](../../docs/adr/0019-single-final-schema-and-commercial-entitlements.md), [crosswalk](../../docs/FINAL_SCHEMA_REQUIREMENTS_CROSSWALK_2026-11-21.md), [acceptance matrix](../../docs/FINAL_SCHEMA_ACCEPTANCE_MATRIX_2026-11-21.md) and [P0 tasks](2026-11-21-consolidate-final-preproduction-saas-schema/tasks.md). Decide minimal persistent recurrence/report/evidence contracts; approve no duplicated financial/rating/tenant models.
2. Implement all remaining **planned schema** in the one fresh-install SQL and synchronized manifest, typed schema, privileges/RLS, seeds and existing API/MCP adapters. No per-proposal ALTER/DDL branches.
3. Verify tenant isolation, SQL concurrency, same authoritative entitlement guard, independent individual grants, provider-event ordering, entire finance/history, PR #113 and complete website/MCP functional parity, full exact-head GitHub CI/E2E/security/Compose/restore. Only then accept/archive P0 as *source implemented* and hand off a frozen contract to downstream feature work.
4. Implement and individually accept the 12 remaining functional OpenSpecs **without planned DDL**. Unexpected schema demands require explicit review rather than silent mutation of the frozen baseline.
5. Independently verify a private off-host restored copy and authorize one real database transition/rebuild under [ADR-0017](../../docs/adr/0017-pre-v1-single-final-cutover-no-compatibility.md); reconcile actual students/finance/portal/Auth/Storage. Paid subscriptions and live-client compatibility have additional launch gates.

**Scope:** centrally operated SaaS under [ADR-0018](../../docs/adr/0018-operator-only-saas-and-tenant-scaling.md), teacher UUID tenant with SQL and shared-domain controls, one operator-managed schema, MCP-first parity under ADR-0003, no pre-v1 compatibility layer, no automatic release.
