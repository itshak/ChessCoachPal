# ChessCoachPal OpenSpec — active work and acceptance tracker

**Current status: 2026-11-20.** The code from [PR #104](https://github.com/itshak/ChessCoachPal/pull/104), [PR #107](https://github.com/itshak/ChessCoachPal/pull/107) and [PR #108](https://github.com/itshak/ChessCoachPal/pull/108) is **merged into `main`** (merge commits `ce162082`, `6681ea52`, `895cb193`; source baseline `895cb193ba8a9efcf171bef8f668505a66a8bce6`). The previous "draft/unmerged" labels in dated development logs are historical, **not current PR status**. At this checkpoint, GitHub has **zero open pull requests**.

**Three different states must not be conflated:** source code merged; feature OpenSpec accepted/archived; production database migrated/deployed. The last two are **not** established by a Git merge. In particular, the canonical SQL baseline is for a fresh install, **not** a safe migration to an existing teacher database. ADR-0017 requires an independently verified off-host restored copy, complete historical reconciliation, and target-specific operator authorization before any live cutover.

## One priority order and 13 active changes

**P0 — finish schema integrity and real-data transition planning.** [Unified schema freeze](2026-11-19-freeze-unified-saas-schema-and-regressions/tasks.md) and [temporal enrollment/credit-safe lifecycle](2026-11-19-temporal-enrollment-credit-safe-lifecycle/tasks.md) have substantial code candidates on merged `main`, but final inventory/ownership, full type coverage, release acceptance and operational restoration remain open. See [2026-11-20 schema inventory](../../docs/SCHEMA_FREEZE_INVENTORY_2026-11-20.md).

| Active change | Merged-source status | Remaining gate |
| --- | --- | --- |
| [Replace families with contacts](2026-11-18-replace-families-with-contacts/tasks.md) | Source candidate from #104 | Historical identities, finance/portal reconciliation, exact acceptance |
| [Enforce workplace enrollment on import](2026-11-19-enforce-workplace-enrollment-on-student-import/tasks.md) | Source candidate from #107 | Original-data reconciliation, review, archive checklist |
| [Scoped student/contact portal](2026-11-18-scope-student-contact-portal/tasks.md) | Source candidate from #104 | Grant privacy, historical token transition and acceptance |
| [Compensation and billing](2026-11-18-implement-workplace-compensation-and-billing/tasks.md) | Source candidate from #104/#108 | Agreement/ledger reconciliation, full financial scenarios |
| [FIDE and national ratings](2026-11-18-introduce-fide-national-ratings/tasks.md) | Manual identity/evidence candidate | Official provider ingestion, provenance and tests |
| [Workplace context and Studio retirement](2026-11-18-add-workplace-context-and-retire-studio/tasks.md) | Teacher settings/Studio cleanup candidate | Global current-workplace selector and cross-domain filtering |
| [Multilingual support](2026-11-17-introduce-multilingual-support/tasks.md) | Partially implemented | Complete translations/RTL/accessibility/output checks |
| [Automatic online ratings](2026-11-18-automate-online-rating-sync/tasks.md) | Durable schema only | Permissioned worker/provider integrations and UI/MCP parity |
| [Daily coach workflows](2026-11-18-improve-daily-coach-workflows/tasks.md) | Building blocks exist | Today queue, close, briefing, exceptions |
| [Extended professional workflows](2026-11-18-extend-professional-coach-workflows/tasks.md) | Partial finance and lesson primitives | Recurrence, reporting/sharing, reconciliation |
| [Brand and coach UI redesign](2026-11-18-explore-brand-and-redesign-coach-ui/tasks.md) | Proposal | Design lab, user approval, staged implementation |

These 11 rows plus the two P0 proposals above are the **13 active OpenSpec changes**. A merged PR can serve several changes, and a change may remain active after its source code lands. Existing archive entries are historical, accepted work; do not reopen or duplicate them.

## Working sequence

1. **Source integrity:** complete schema inventory, explicit types/owner rules, tenant/RLS/finance/credit safety tests and browser↔MCP parity on merged `main`.
2. **Finish remaining feature slices:** selected workplace context, ratings, daily/professional workflows and multilingual completeness; keep provider and visual-approval gates explicit.
3. **Operational gate:** privately inspect deployed version/data; select a one-time reviewed source-to-final transform or verified fresh rebuild/reimport; independently restore database/Auth/Storage off-host; reconcile invoices, credits, portals and teaching history; obtain operator approval before deployment.
4. **Archive precisely:** mark verified tasks, synchronize canonical `openspec/specs/`, record exact merged-main CI, then move only genuinely completed changes into `openspec/changes/archive/`. Do not archive proposals with open requirements simply because their branch was merged.

**Release discipline:** v0.1.9 remains the last published release at this checkpoint. A source merge is not a new version or production deployment. The release workflow's existing-tag check must not be bypassed to publish unapproved schema changes. Live ChatGPT/Claude vendor-client acceptance remains a separate prepublication check.

**Architecture requirements:** one operator-managed SaaS, one canonical fresh-install SQL baseline, no pre-v1 compatibility chain, tenant-specific permission checks, no household-token inheritance, and full ordinary website↔MCP business-operation parity. See [ADR-0017](../../docs/adr/0017-pre-v1-single-final-cutover-no-compatibility.md), [ADR-0018](../../docs/adr/0018-operator-only-saas-and-tenant-scaling.md), [schema runbook](../../docs/SCHEMA_TRANSITION_RUNBOOK.md) and [MCP parity checklist](../../docs/MCP_WEBSITE_PARITY_CHECKLIST.md).

No private strategy, unapproved pricing hypotheses, personal student records, credentials or production database exports belong in this public repository.
