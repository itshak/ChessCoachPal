> **2026-11-22:** Historical audit and crosswalk; original counts and findings are retained. See the [merged source decision](../openspec/changes/archive/2026-11-21-consolidate-final-preproduction-saas-schema/SOURCE_ACCEPTANCE.md).

> **2026-11-22 implementation-candidate audit:** Draft PR #115 now has **105 declared public tables**: the 87 pre-consolidation tables listed below plus 18 normalized commercial/domain relations. Source inventory reports **60 declared TypeScript table contracts** and **45 not directly declared**, with explicit RLS-enable statements for all 105. This is source coverage, **not** effective tenant-policy proof, generated type-signoff, a schema freeze, or a populated-data cutover. The candidate also adds SQL audit triggers for plan, grant and subscription transitions; quota-race, professional-capacity, extensible rating and scoped report audience tests are undergoing exact-head acceptance. All 12 downstream feature OpenSpecs remain active but no longer own independent planned DDL. The original 87-table rows below are historical source coverage, not a complete list of 105 current tables.

# Final-schema consolidated requirements crosswalk — source audit (2026-11-21)

**Status:** source-based, pre-implementation audit / proposed schema decisions, **not** an approved schema freeze, SQL differential, live DB verification or production cutover. Canonical GitHub main inspected at `5b6d178d91382928ebc7c799dd05204c3a76ba0b`. One open PR at inspection: [#113](https://github.com/itshak/ChessCoachPal/pull/113) (concurrency test; no DDL). Existing merged candidates: #104 contacts/finance, #107 import, #108 temporal/credits; #110/#111 RLS guard source/archive. The current release/deployment version and privately deployed schema are **not inferred** from source. Private commercial strategy is deliberately not replicated.

**Authoritative owner:** [2026-11-21-consolidate-final-preproduction-saas-schema](../openspec/changes/archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md) under [ADR-0019](adr/0019-single-final-schema-and-commercial-entitlements.md). The original 2026-11-19 P0 freeze proposal is superseded as an active DDL owner; its unchecked work is explicitly transferred.

## Physical baseline coverage

The consolidated source currently contains **87 distinct CREATE TABLE declarations** for application tables under `public`, with corresponding RLS-enable statements per the 2026-11-20 inventory. Previously reported type coverage is **40 declared Tables contracts / 47 without explicit TypeScript Tables entries**; this count must be recomputed on the final baseline. RLS-enable presence is **not** proof that effective policies, grants or SECURITY DEFINER functions are safe.

The rows below account for **all 87 current physical tables**. "Retain" means preserve its domain role in the target and verify precise constraints; it does **not** mean the table is accepted unchanged.


### Accounts, auth, operations (12)

| Existing table | Proposed disposition / remaining verification |
| --- | --- |
| `teachers` | **Replace** legacy hosted plan/Stripe authority with separate normalized entitlement + platform subscription; keep teacher identity/UI locale. |
| `teacher_settings` | **Review** obsolete Studio, tenant-global defaults and teacher BYO payment/provider keys; never mix SaaS payment account. |
| `waitlist` | **Review** account data minimization, deletion and retention. |
| `agent_oauth_clients` | **Retain** OAuth registry; tenant/scope isolation independent of Pro. |
| `agent_oauth_codes` | **Retain** hashed/expiring short-lived grants; verify privilege and cleanup. |
| `agent_oauth_grants` | **Retain** delegated OAuth scopes; no Pro authorization from scope alone. |
| `agent_tool_receipts` | **Retain** durable MCP idempotency; not SaaS webhook log. |
| `push_subscriptions` | **Retain** restricted delivery credentials with revocation/retention. |
| `notifications` | **Retain** owner-scoped notification records. |
| `ccp_delivery_outbox` | **Reuse** delivery outbox for approved messages, not second generic job queue. |
| `teacher_backup_import_receipts` | **Retain** import receipts; quota checks on every imported active student. |
| `teacher_spreadsheet_import_receipts` | **Retain** idempotent spreadsheet import and owner-scoped enrollments. |

### Student, workplace, lessons (16)

| Existing table | Proposed disposition / remaining verification |
| --- | --- |
| `students` | **Retain** canonical IDs, archive and profile; ensure active-count trigger and source-aware educational evidence. |
| `workplaces` | **Extend** kind personal/professional, lifecycle/status, updated/revision and typed validated policy; one Personal per teacher. |
| `workplace_enrollments` | **Retain** single effective-dated history with no overlap, unknown start and cancelled period provenance; no new membership table. |
| `class_groups` | **Retain** groups in Free; do not count as professional workplace. |
| `group_enrollments` | **Retain** frozen group membership audit and ownership. |
| `lesson_slots` | **Reuse** recurring intent; add durable exception relation only after gap proof. |
| `teaching_sessions` | **Retain** canonical occurrence, stable slot/date identity, reschedule/makeup, corrections; no duplicate hours. |
| `session_participants` | **Retain** frozen source roster and student-specific evidence. |
| `session_attendance` | **Retain** owner-reviewed individual attendance and correction trace. |
| `session_notes` | **Retain** shared/private note isolation; prevent accidental report disclosure. |
| `session_roster_corrections` | **Retain** immutable roster correction provenance. |
| `ccp_session_note_audit` | **Retain** note revision history; assess whether new occurrence audit needed. |
| `ccp_session_attendance_audit` | **Retain** attendance corrections and provenance. |
| `ccp_historical_attendance_evidence` | **Retain** historical source hints, never infer current enrollment. |
| `ccp_historical_import_stages` | **Retain** staged, confirmed import/reconciliation. |
| `ccp_student_create_receipts` | **Retain** student request replay; SQL quota final arbiter. |

### Contacts, portal, events (10)

| Existing table | Proposed disposition / remaining verification |
| --- | --- |
| `contacts` | **Retain** contact identity and explicit sharing bounds. |
| `student_contacts` | **Retain** many-to-many relationship; no implicit portal/payer authority. |
| `billing_accounts` | **Retain** teacher-coach debtor identities, not platform subscription customers. |
| `student_billing_assignments` | **Retain** explicit payer precedence/effective dates; reject unknown. |
| `portal_access_grants` | **Retain** digest-only scoped tokens, revocation and tenant/guest resource checks. |
| `portal_event_invitations` | **Retain** explicitly scoped invitations and decisions. |
| `events` | **Retain** teacher events and exact workplace provenance. |
| `event_students` | **Retain** tenant-scoped participant linkage. |
| `ccp_event_request_receipts` | **Retain** idempotent event requests. |
| `event_email_deliveries` | **Retain** delivery audit and recipient locale/consent. |

### Teacher finances (12)

| Existing table | Proposed disposition / remaining verification |
| --- | --- |
| `payments` | **Reconcile** inherited invoice payment history vs new received_payments; no silent destructive merge. |
| `invoice_items` | **Retain** frozen invoice lines, currency/amount and original teacher payer semantics. |
| `invoices` | **Retain** independent teacher-issued drafts/statements and historical receipts, separate from SaaS billing. |
| `credit_packages` | **Retain** per-student purchased lesson entitlement, never a Free/Pro grant. |
| `credit_redemptions` | **Retain** one canonical consumption and return semantics. |
| `ccp_credit_redemption_return_receipts` | **Retain** immutable return/replay. |
| `compensation_agreements` | **Retain** effective typed agreement revisions and amount/currency basis. |
| `financial_obligations` | **Retain** immutable coach earning/participant charge evidence; audit no double accrual. |
| `received_payments` | **Retain** recorded actual money, distinct from expected/invoiced. |
| `payment_allocations` | **Retain** reviewed allocation with sufficient-funds and same-currency invariants. |
| `financial_reversals` | **Retain** immutable reversal reason/provenance. |
| `credit_adjustment_events` | **Retain** funded/prepaid entitlement adjustments, distinct from commercial SaaS grants. |

### Learning, assignments, materials (29)

| Existing table | Proposed disposition / remaining verification |
| --- | --- |
| `learning_materials` | **Retain** canonical typed material catalog. |
| `material_links` | **Retain** explicit session/student/material links. |
| `material_teaching_evidence` | **Extend/validate** assigned/taught/completed vs teacher-proven practice/demonstration/needs-review; no inferred mastery. |
| `learning_material_relations` | **Retain** typed material relationships. |
| `learning_material_edit_receipts` | **Retain** replay/audit. |
| `learning_material_relation_receipts` | **Retain** replay/audit. |
| `learning_material_lifecycle_receipts` | **Retain** material archive/edit history. |
| `chess_games` | **Retain** chess-specific indexed material subtype. |
| `chess_puzzles` | **Retain** puzzle material subtype. |
| `chess_drills` | **Retain** drill material subtype. |
| `chess_study_chapters` | **Retain** study chapter linkage and provenance. |
| `chess_observations` | **Retain/validate** student-specific observed source and teacher verification, not mastery inferred from coverage. |
| `chess_skill_categories` | **Retain** teacher-defined categories; no generic custom field builder. |
| `skill_assessments` | **Retain** teacher-assessed skill evidence distinct from external ratings. |
| `skill_assessment_write_receipts` | **Retain** assessment replay. |
| `skill_dimensions` | **Retain** teacher-defined skill dimensions. |
| `skill_dimension_create_receipts` | **Retain** dimension replay. |
| `student_training_plans` | **Retain** typed plan state/revision. |
| `student_training_plan_revisions` | **Retain** immutable plan revision evidence. |
| `student_training_plan_receipts` | **Retain** plan write idempotency. |
| `training_assignments` | **Retain** core assignments; any Pro expansion should use same data model. |
| `assignment_attempts` | **Retain** student-specific attempted work and source. |
| `assignment_reviews` | **Retain** teacher review verdict/feedback. |
| `chess_material_defaults` | **Retain** approved default material. |
| `chess_material_default_history` | **Retain** material-default change history. |
| `teacher_study_chapter_index` | **Retain** external study index with source provenance. |
| `teacher_study_preferences` | **Retain** local study preferences; avoid provider lock-in. |
| `lichess_puzzle_publications` | **Retain** external publication receipts and rate limits. |
| `lichess_puzzle_series` | **Retain** puzzle series links; do not conflate schedule series. |

### Chess profile, ratings, integration (8)

| Existing table | Proposed disposition / remaining verification |
| --- | --- |
| `student_chess_profile_history` | **Retain** strength/handle changes with provenance. |
| `student_rating_snapshots` | **Extend** fixed provider/category CHECKs to extensible reviewed lookup and preserve immutable source evidence/official effective date. |
| `student_federation_memberships` | **Retain** verified federation identities, not implied ratings. |
| `student_rating_sync_consents` | **Retain** explicit provider/handle revisions and revocation. |
| `student_rating_refresh_jobs` | **Retain** durable consented worker leases/backoff; not raw subscription usage. |
| `student_rating_refresh_receipts` | **Retain** immutable worker outcomes and evidence digests. |
| `teacher_lichess_connections` | **Retain** protected external account connection metadata. |
| `teacher_lichess_connection_events` | **Retain** integration event audit. |

## Missing or amended **schema contracts** that MUST be resolved in this one change

| Domain | Existing coverage | Minimal remaining schema decision | Downstream behavior owner |
| --- | --- | --- | --- |
| Commercial product | `teachers.hosted_plan`, Stripe IDs, active count, `hosted_enforced` | **Replace inherited authority** with typed immutable plan versions, registered capabilities, additive permanent/timeboxed grants, one transactional account capacity state, audit and durable bounded usage. No price/limit guesses. | New optional Freemium service/checkout follow-up |
| SaaS payments | Hosted Stripe endpoints; no normalized platform customer/subscription/event tables | Provider-neutral customer/offer/subscription/event journal, unique provider+merchant+external IDs, paid-through/grace/cancel/version ordering, review/source provenance, no teacher-finance conflation | Future subscription adapter and paid rollout |
| Professional workplaces | `workplaces` is generic; `selected_workplace_id` exists | Explicit Personal/Professional kind, lifecycle, revision, exactly one Personal bootstrap, count only active Professional, policy precedence and over-limit grandfathering | Workplace context / teacher settings |
| Active student capacity | Teacher table counter + capacity trigger; app environment independent | One durable SQL entitlement guard for all student insert/reactivate/import/bulk/restore/lesson recovery, direct DB and concurrent plan changes, guard against Free origin opt-out | Temporal lifecycle, new entitlement service |
| Recurrence | `lesson_slots` schedule; sessions have `slot_id`, `slot_occurrence_date`, reschedule/makeup | Prove this/future/all exception representation; if absent add **one** owner-scoped exception keyed by original local date, not another recurring-session source | Professional workflows |
| Published reports | Derived reports and student evidence; no report publication/revision table in 87-table inventory | Minimal approved immutable publication snapshot/digest/revoke/supersede/audience link, reuse existing portal grants; never publish private notes | Professional workflows + scoped portal |
| Learning evidence | `material_teaching_evidence.stage` currently assigned/taught/completed; observation and skill systems exist | Explicit teacher-confirmed introduced/practiced/demonstrated/needs-review semantics if not represented; use existing evidence models, separate from external ratings | Daily/learning workflows |
| Ratings extensibility | `student_rating_snapshots` provider/category CHECK still hardcoded for known providers, and federation memberships are present | Normalize **versioned provider/category lookup** or equivalent reviewed registration to add approved future national categories without ALTER TABLE; retain immutable original provider/identity/time provenance | FIDE/national ratings |
| Rating jobs | consent + job + receipt tables already in baseline | Validate owned provider/handle revision, retry/lease, stale revocation, immutable snapshots/official effective date; no duplicate job table | Automated online ratings |
| Finance | `payments` and `received_payments` both exist, plus immutable obligations/credits | Field-by-field historical/issued vs actually received reconciliation, receipts/currency/FK/rules and source snapshots; reject phantom funding; no second ledger | Compensation and finance |
| Contacts/portal | Contacts, billing accounts and scoped grants present | Guest/privileged denial, token digest/scope/access audit, recipient locale and legacy token invalidation; portal permission not implied by contact | Contacts + portal |
| Teacher locale / preferences | `teachers.preferred_locale`, workplace locale, `teacher_settings` | Separate UI/recipient/workplace locale + timezone/policy hierarchy; no old Studio semantics | Localization and context |
| RLS, direct roles, types | 87 RLS-enable declarations, 40 typed contracts previously inventoried | Exhaustive grants/policies/SECURITY DEFINER tests, composite tenant FKs, indexes and typegen decisions on final objects | Consolidated schema P0 |
| Privacy and tenant export | Existing owner-scoped history and storage; no new Academy tenant | Preserve redactable portal/child notes, erasure/retention, export/import and off-host restored-copy mapping, not generic speculative privacy tables | Existing core security + operator cutover |

## Cross-proposal DDL consolidation and final functional ownership

| Previously open change | Schema handed to consolidated P0 | What stays downstream and is **not** schema acceptance |
| --- | --- | --- |
| 2026-11-19-freeze-unified-saas-schema-and-regressions | **Entire remaining old P0** inventory, type/RLS, DDL guards, report/lesson/finance candidate | Superseded as a separate active schema owner; historical results retained |
| 2026-11-19-temporal-enrollment-credit-safe-lifecycle | Dated membership constraints, archival quota, credit audit and archived lesson atomicity | Preview/commit UX, full browser/MCP scenarios, live data reconciliation |
| 2026-11-19-enforce-workplace-enrollment-on-student-import | Transactional workplace-id and dated period consistency | Import resolver, ambiguous-contact UX and historical repair |
| 2026-11-18-replace-families-with-contacts | Contacts/student links/billing account ownership and immutable historical mapping | Contact management UI/MCP and live identity transition |
| 2026-11-18-scope-student-contact-portal | Exact grant scope, token hashing, revocation and security indexes | Actual guest portal behavior, reissuance, web/MCP grant controls |
| 2026-11-18-implement-workplace-compensation-and-billing | Effective agreement snapshots, obligations/payments/allocations/reversals | Calculation/approval/reporting/period-end and existing finance safety |
| 2026-11-18-add-workplace-context-and-retire-studio | Personal/workplace kind, lifecycle, selected preference, typed defaults | All-workplaces selector, filters, policy editing and UI/MCP |
| 2026-11-18-introduce-fide-national-ratings | Extensible national/provider/category identity and rating snapshots | Provider ingestion/manual evidence and full client parity |
| 2026-11-18-automate-online-rating-sync | Consent + queue + receipt/lease/version schema, not a second snapshots table | Worker, retries, API integration, rate limit and consent UI/MCP |
| 2026-11-18-extend-professional-coach-workflows | Recurrence exception/approval audit only if genuinely missing, approved report snapshot | Recurrence editing, day-end financial review, report sharing |
| 2026-11-18-improve-daily-coach-workflows | Evidence/lesson state only if missing; do **not** persist a duplicate Today queue | Briefing, close/reconcile, archived learner UX and parity |
| 2026-11-17-introduce-multilingual-support | Teacher/workplace/recipient locale and required typed constraints | Translation/RTL/a11y/output behavior; stable MCP keys |
| 2026-11-18-explore-brand-and-redesign-coach-ui | **No planned DDL** | Approved design lab/UI implementation |

## Mandatory decision log before schema freeze

The implementation PR must record a row/field-level **decision and negative test** for (a) structured plan/grant precedence and SQL capacity, (b) provider/category registry rather than endless CHECK-list edits, (c) recurring exception storage necessity, (d) approved report publication and audience scope, (e) typed verified learning evidence without fabricated mastery, (f) Personal workspace historical data and existing beta professional workplace grandfathering, (g) older `payments` versus `received_payments` and provider SaaS subscription separation, and (h) TypeScript contracts for all required user-facing and internal-accessed tables.

Do not retroactively declare implementation complete because the database has a similarly named table. A SQL manifest, exact-head CI, tenant RLS/FK tests, browser/MCP parity and a separate independently restored/operator-approved cutover remain mandatory. The status of private accounts or live payment state is **not** established in this file.
