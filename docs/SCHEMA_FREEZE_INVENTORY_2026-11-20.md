# Unified schema freeze — source inventory (2026-11-20)

**Snapshot:** merged `main` source at `895cb193ba8a9efcf171bef8f668505a66a8bce6`, with four low-risk TypeScript table-contract additions in the accompanying audit commit. This is a **static source inventory**, not an actual production database or populated-data review. No external connection, user record, payment or portal token was read.

## Physical model and type coverage

- One canonical fresh-install baseline: `supabase/migrations/20261107000000_chesscoachpal_baseline.sql` (checksum controlled by `scripts/schema-transition-manifest.json`).
- **87 declared `public` application tables** found by parsing quoted and unquoted `CREATE TABLE` statements; **87 corresponding RLS-enable statements** found. Effective policies/role grants still require SQL-backed A/B tests.
- **40 explicitly declared `Database.public.Tables` contracts** in `lib/supabase/types.ts`, including the newly added workplaces, groups, enrollment and canonical learning-material definitions. **47 physical tables remain absent from that hand-maintained type interface**; this does not by itself prove they are broken or must all be client-accessible.
- The `baselineRequiredObjects` manifest is a **selected essential-object guard**, not an exhaustive list of all tables/functions. Its size must not be mistaken for the physical table count.

**Remaining tables without an explicit TypeScript `Tables` entry (47):** `agent_oauth_clients`, `agent_oauth_codes`, `agent_oauth_grants`, `agent_tool_receipts`, `assignment_attempts`, `assignment_reviews`, `ccp_credit_redemption_return_receipts`, `ccp_delivery_outbox`, `ccp_event_request_receipts`, `ccp_historical_attendance_evidence`, `ccp_historical_import_stages`, `ccp_session_attendance_audit`, `ccp_session_note_audit`, `ccp_student_create_receipts`, `chess_drills`, `chess_games`, `chess_material_default_history`, `chess_material_defaults`, `chess_observations`, `chess_puzzles`, `chess_skill_categories`, `chess_study_chapters`, `event_email_deliveries`, `learning_material_edit_receipts`, `learning_material_lifecycle_receipts`, `learning_material_relation_receipts`, `learning_material_relations`, `lichess_puzzle_publications`, `lichess_puzzle_series`, `material_links`, `material_teaching_evidence`, `session_roster_corrections`, `skill_assessment_write_receipts`, `skill_assessments`, `skill_dimension_create_receipts`, `skill_dimensions`, `student_chess_profile_history`, `student_training_plan_receipts`, `student_training_plan_revisions`, `student_training_plans`, `teacher_backup_import_receipts`, `teacher_lichess_connection_events`, `teacher_lichess_connections`, `teacher_spreadsheet_import_receipts`, `teacher_study_chapter_index`, `teacher_study_preferences`, `training_assignments`.

## Active OpenSpec crosswalk and integration gaps

| Area / change | Source evidence on merged main | Remaining work / acceptance |
| --- | --- | --- |
| Unified schema freeze | Single baseline, manifest, tenant checks, rating-consent/queue schema and source guard; 87 SQL table declarations | Final ownership matrix, complete typegen decision, populated-data transition and formal schema freeze |
| Contacts and billing identities | `#104` Contacts, student links, payer accounts, current services and website/MCP candidates | Reconcile historical households, invoice recipients, payments, Auth/Storage and tenant isolation on restored actual data |
| Student import and workplace enrollment | `#107` fail-closed ambiguity, transactional enrollment and test candidates | Source-import reconciliation; existing teacher data must not acquire invented current enrollment |
| Temporal enrollment, student archive/reactivation and credits | `#108` non-overlapping periods, reviewed lifecycle, audited entitlement adjustments | Review every legacy route and expiry bypass, funded/reversal invariants and populated-data periods |
| Workplace context/Studio retirement | Current teacher settings and removed Studio runtime model | Persistent selected-workplace semantics and consistent filters across teaching workflows |
| Compensation/professional finance | Current compensation agreements and native immutable posting/allocation/reversal candidates | Agreement/obligation/invoice payer precedence, reconciled external receipts, period-end workflows |
| Scoped portal | Scoped grants, issue/revoke, event permission candidates | Legacy token invalidation, actual historical sharing review and denial/consent tests on restored data |
| FIDE/national ratings | Identity, membership and manual-source records | Official FIDE and permitted federation ingestion/provider contracts **not approved** |
| Online ratings sync | Durable consent, refresh-job and receipt **schema** | Permissioned worker, provider errors/backoff, stale state, UI/MCP controls and verified runtime tests |
| Multilingual | Several en/he/ru website, report and MCP slices | Full-surface language, RTL, communication/output and accessibility acceptance |
| Daily coaching | Existing lesson capture/briefing primitives | Unified teacher-local action queue, complete/reconcile flows and behavioral parity |
| Professional workflows | Partial cancellation, credits and finance primitives | Series exceptions, shareable reviews, daily reconciliation and safety acceptance |
| Brand/UI design lab | Proposal and earlier visual direction | Explicit approved design comparison and rollout; do not mark as finished from coding branches |

**No duplicate financial source-of-truth conclusion is made here.** `financial_obligations`, `invoices`, `received_payments`, `payments`, `credit_packages` and `credit_adjustment_events` exist for different purposes; the exact ledger-to-invoice-to-provider reconciliation still needs field-by-field review before schema freeze. Do not merge funding and entitlement ledgers just to reduce table count.

## Next source-only tasks

1. Confirm each of the 47 remaining table contracts is either intentionally internal-only or should be regenerated/typed (especially historic material/skill/audit sources); use actual database introspection rather than invented SQL guesses.
2. Review all cross-tenant composite foreign keys, direct table grants and SECURITY DEFINER execution boundaries with SQL-backed negative tests.
3. Reconcile finance provenance and read/write parity field by field; prove no enrollment, student archive or credit expiry bypass survives.
4. Verify lifecycle/report/portal and rating-worker service implementations against the canonical model and real API/MCP behavior.
5. Prepare one independently reviewed operator-controlled populated-data transition or verified rebuild/reimport, off-host restore and per-domain record reconciliation. **Neither source merge nor synthetic CI authorizes cutover.**

This inventory covers the first schema-freeze OpenSpec investigation item. Other freeze, feature and release-acceptance tasks remain open until proven independently. See [active OpenSpec tracker](../openspec/changes/README.md) and [operator transition runbook](SCHEMA_TRANSITION_RUNBOOK.md).
