# ChessCoachPal OpenSpec: active work and acceptance tracker

**Updated 2026-11-23.** The [consolidated schema](archive/2026-11-21-consolidate-final-preproduction-saas-schema/SOURCE_ACCEPTANCE.md) is frozen on [merged main](https://github.com/itshak/ChessCoachPal/commit/0147c7aa34f680b6defa9f202f28c64e9fc6b5ba). [ADR-0019](../../docs/adr/0019-single-final-schema-and-commercial-entitlements.md) and the schema lock govern changes. The older 2026-11-19 freeze proposal was superseded, not separately completed. The current exact source lock is the [ADR-0023 successor](../../docs/adr/0023-workplace-spreadsheet-import-source-review.md), approved in [#130](https://github.com/itshak/ChessCoachPal/pull/130) and active on [merged #131](https://github.com/itshak/ChessCoachPal/commit/c1a575e489887a142d90782e7bd058990013de1f).

## Current evidence

- [PR #115](https://github.com/itshak/ChessCoachPal/pull/115) merged the source and active lock after all five exact-head workflows and an independent two-boot structural comparison. The frozen baseline has **105 public relations**, 60 directly typed and 45 classified as SQL-only. PR #113 remains historical; its regression was ported, not merged.
- This is a source freeze, not a private-beta migration, paid checkout, or deployment. ADR-0017 still requires separately approved private reconciliation and independent off-host restoration.

- [Workplace Context / Studio retirement](archive/2026-11-18-add-workplace-context-and-retire-studio/SOURCE_ACCEPTANCE.md) has passed source acceptance; live mapping and deployment remain separate.

## Eleven active feature changes, no planned DDL

| Active OpenSpec change | Schema authority | Remaining feature/acceptance work |
| --- | --- | --- |
| [Temporal enrollment, credit-safe lifecycle](2026-11-19-temporal-enrollment-credit-safe-lifecycle/proposal.md) | P0 and reviewed ADR-0022 | [Verified source milestones](2026-11-19-temporal-enrollment-credit-safe-lifecycle/SOURCE_ACCEPTANCE.md), including exact same-day completed recovery; archived-credit settlement decision and separately authorized live acceptance remain open |
| [Workplace import enrollment](2026-11-19-enforce-workplace-enrollment-on-student-import/proposal.md) | P0 and reviewed ADR-0023 | [Source criteria verified](2026-11-19-enforce-workplace-enrollment-on-student-import/SOURCE_ACCEPTANCE.md); Contacts CRM legacy coordination, authorized private reconciliation and live acceptance remain open |
| [Contacts and billing identity](2026-11-18-replace-families-with-contacts/proposal.md) | Handed to P0 | [Source criteria verified](2026-11-18-replace-families-with-contacts/SOURCE_ACCEPTANCE.md); coordinated legacy mapping, private reconciliation and authorized operator acceptance remain open |
| [Scoped student/contact portal](2026-11-18-scope-student-contact-portal/proposal.md) | Handed to P0 | [Source milestones verified](2026-11-18-scope-student-contact-portal/SOURCE_ACCEPTANCE.md); privacy-reviewed durable audit, ingress and authorized legacy reconciliation remain open |
| [Workplace compensation/billing](2026-11-18-implement-workplace-compensation-and-billing/proposal.md) | Source implemented; operator gates open | [Signed compensation and billing source acceptance](2026-11-18-implement-workplace-compensation-and-billing/SOURCE_ACCEPTANCE.md); real legacy mapping, reconciliation and cutover remain separate |
| [FIDE and national ratings](2026-11-18-introduce-fide-national-ratings/proposal.md) | Handed to P0 | Approved provider adapters, provenance, official evidence and parity |
| [Automatic online ratings](2026-11-18-automate-online-rating-sync/proposal.md) | Handed to P0 | Consent UI/MCP, provider worker/lease/backoff and read-back |
| [Daily coaching workflows](2026-11-18-improve-daily-coach-workflows/proposal.md) | Handed to P0 | Derived Today queue, lesson close, briefing and archived learner UX |
| [Professional coach workflows](2026-11-18-extend-professional-coach-workflows/proposal.md) | Handed to P0 | Recurrence editing, approved reports, reconciliation and audit |
| [Multilingual support](2026-11-17-introduce-multilingual-support/proposal.md) | Handed to P0 | Full translation/RTL/a11y, stable MCP presentation and reports |
| [Coach branding/redesign](2026-11-18-explore-brand-and-redesign-coach-ui/proposal.md) | No planned DDL | Approved design comparison, staged implementation and a11y |

**Sequence:** Workplace Context is source accepted. Continue one feature proposal at a time according to dependencies and verified acceptance evidence. Federation identity and official rating evidence precede automated online refresh. Update the same web/MCP service, verify authenticated parity, and archive individual proposals only after their source merges and tests. File a reviewed ADR for any unexpected physical schema need instead of editing the locked baseline.

**Scope:** centrally operated SaaS under [ADR-0018](../../docs/adr/0018-operator-only-saas-and-tenant-scaling.md), teacher UUID tenant with SQL and shared-domain controls, one operator-managed schema, MCP-first parity under ADR-0003, no pre-v1 compatibility layer, no automatic release.
