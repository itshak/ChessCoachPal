# ChessCoachPal MCP tool and coaching-workflow audit

> Generated from the actual typed source catalog with `node scripts/mcp-tool-workflow-audit.mjs --write`. Classifications are **initial engineering dispositions** to review during this OpenSpec; not claims that each tool has undergone live-model testing. Do not replace the current full tool surface with this document.

## Baseline

- Tools: **198** (count at current source, not a version-pinned policy).
- Full browser↔MCP parity remains required; exact scope/entitlement and domain-service wiring must be verified in the implementation.
- Quality check: `npm run mcp:catalog:quality` (static names/description/dispatch). Tool counts and total schema bytes are diagnostic; not optimization targets.

## Teacher intents before endpoints

| Intent | Existing safe client sequence (examples) | Desired composition | Status |
| --- | --- | --- | --- |
| Completed group lesson with each pupil's note | `ccp_lessons_capture_preview` → `ccp_sessions_ad_hoc_create` → `ccp_sessions_details` → `ccp_sessions_complete` | Preview → atomic scheduled-create+completion with explicitly recorded frozen-roster attendance and distinct participant notes | Implementation target |
| Use a newly created drill or study material in one completed lesson | `ccp_learning_materials_list` → `ccp_learning_materials_create` → `ccp_material_links_create` → one `ccp_materials_history_record` per pupil | Safe preview → one transaction creating/reusing material, lesson association and per-pupil evidence, not mastery | Implementation target |
| Pre-lesson individual briefing | `ccp_coach_briefing_get` | Reuse the existing bounded multi-source briefing; no duplicate command | Existing |
| Record verified historical attendance dates | `ccp_historical_attendance_dates_preview` → `ccp_historical_attendance_dates_commit` | Preserve PR #95's review/commit; **never create calendar sessions** | Existing |
| Import aggregate/absent historical records | `ccp_historical_attendance_preview` → `ccp_historical_attendance_commit` | Preserve advanced mapped/staged workflows and safeguards | Existing |
| Export full teacher data | `ccp_settings_export_csv` per table with safe paging, or website ZIP | Preserve privacy-filtered pages and JSON restore as distinct | Existing |
| Correct one attendance/learning record | Existing exact revision-guarded update/void tools | Preserve granular editing and history/audit; compound correction only if justified | Existing |
| Track workplace teaching time | `ccp_reports_workplace_summary` | Reuse authoritative teacher-time aggregation (group counted once) | Existing |
| Invoices/communications | Existing preview → explicit confirmed send/record | Separate external effects; never fold automatic messages/payments into lesson capture | Existing |

## Full discovered tool catalogue

| Tool | Domain | OAuth | Initial disposition | Description chars | Website routes |
| --- | --- | --- | --- | ---: | --- |
| `ccp_workplaces_list` | workplaces | coach:read | KEEP | 79 | 1 |
| `ccp_dashboard_summary` | dashboard | coach:read | KEEP/COMPOSE | 111 | 1 |
| `ccp_notifications_list` | notifications | coach:read | KEEP | 90 | 1 |
| `ccp_notifications_mark_read` | notifications | coach:write | KEEP | 130 | 1 |
| `ccp_lessons_history_unified` | lessons | coach:read | KEEP | 334 | 1 |
| `ccp_reports_workplace_summary` | reports | coach:read | KEEP/COMPOSE | 251 | 1 |
| `ccp_billing_generation_preview` | finance | coach:read | KEEP/COMPOSE | 172 | 1 |
| `ccp_billing_generation_commit` | finance | coach:write | KEEP | 233 | 1 |
| `ccp_billing_invoice_regenerate` | finance | coach:write | KEEP | 269 | 1 |
| `ccp_billing_invoice_pdf` | finance | coach:read | KEEP | 196 | 1 |
| `ccp_billing_invoice_checkout` | finance | coach:write | KEEP | 204 | 1 |
| `ccp_billing_invoices_bulk_preview` | finance | coach:read | KEEP/COMPOSE | 189 | 1 |
| `ccp_billing_invoices_bulk` | finance | coach:write | KEEP | 262 | 1 |
| `ccp_students_bulk_lifecycle_preview` | students | coach:read | KEEP/COMPOSE | 230 | 1 |
| `ccp_students_bulk_lifecycle_commit` | students | coach:write | KEEP/COMPOSE | 219 | 1 |
| `ccp_historical_import_upload_handoff` | historical | coach:read | KEEP | 253 | 1 |
| `ccp_historical_import_stage_info` | historical | coach:read | KEEP | 138 | 1 |
| `ccp_historical_import_stage_delete` | historical | coach:write | GRANULAR-ONLY | 139 | 1 |
| `ccp_historical_attendance_dates_preview` | historical | coach:read | KEEP/COMPOSE | 539 | 1 |
| `ccp_historical_attendance_dates_commit` | historical | coach:write | KEEP/COMPOSE | 330 | 1 |
| `ccp_historical_attendance_preview` | historical | coach:read | KEEP/COMPOSE | 652 | 1 |
| `ccp_historical_attendance_commit` | historical | coach:write | KEEP | 195 | 1 |
| `ccp_historical_attendance_report` | historical | coach:read | KEEP | 217 | 1 |
| `ccp_historical_attendance_summary` | historical | coach:read | KEEP/COMPOSE | 200 | 1 |
| `ccp_import_spreadsheet_parse` | import/export/settings | coach:read | KEEP | 145 | 1 |
| `ccp_import_spreadsheet_preview` | import/export/settings | coach:read | KEEP/COMPOSE | 108 | 1 |
| `ccp_import_spreadsheet_suggest` | import/export/settings | coach:read | KEEP | 201 | 1 |
| `ccp_import_spreadsheet_commit` | import/export/settings | coach:write | KEEP | 231 | 1 |
| `ccp_settings_export` | import/export/settings | coach:read | KEEP | 197 | 1 |
| `ccp_settings_export_csv` | import/export/settings | coach:read | KEEP/COMPOSE | 516 | 1 |
| `ccp_settings_import_preview` | import/export/settings | coach:read | KEEP/COMPOSE | 132 | 1 |
| `ccp_settings_import_apply` | import/export/settings | coach:write | KEEP | 225 | 1 |
| `ccp_billing_manual_payment_record` | finance | coach:write | GRANULAR-ONLY | 283 | 1 |
| `ccp_billing_manual_payment_delete` | finance | coach:write | GRANULAR-ONLY | 244 | 1 |
| `ccp_credits_packages_list` | finance | coach:read | KEEP | 134 | 1 |
| `ccp_credits_package_create` | finance | coach:write | GRANULAR-ONLY | 155 | 1 |
| `ccp_credits_package_expiry` | finance | coach:write | KEEP | 116 | 1 |
| `ccp_credits_redemption_return` | finance | coach:write | KEEP | 128 | 1 |
| `ccp_connections_list` | connections | coach:read | KEEP | 136 | 1 |
| `ccp_connections_revoke` | connections | coach:write | KEEP | 165 | 1 |
| `ccp_billing_invoice_draft_update` | finance | coach:write | GRANULAR-ONLY | 260 | 1 |
| `ccp_billing_invoice_void` | finance | coach:write | GRANULAR-ONLY | 242 | 1 |
| `ccp_billing_invoice_delete` | finance | coach:write | GRANULAR-ONLY | 171 | 1 |
| `ccp_billing_invoice_send_preview` | finance | coach:read | KEEP/COMPOSE | 242 | 1 |
| `ccp_billing_invoice_send` | finance | coach:write | KEEP | 285 | 1 |
| `ccp_billing_invoices_list` | finance | coach:read | KEEP | 127 | 0 |
| `ccp_billing_invoice_detail` | finance | coach:read | KEEP | 183 | 1 |
| `ccp_billing_payments_export` | finance | coach:read | KEEP | 199 | 1 |
| `ccp_studio_policy_get` | studio | coach:read | KEEP | 205 | 1 |
| `ccp_studio_credentials_handoff` | studio | coach:read | KEEP | 267 | 1 |
| `ccp_studio_policy_update` | studio | coach:write | GRANULAR-ONLY | 224 | 1 |
| `ccp_events_list` | events | coach:read | KEEP | 102 | 1 |
| `ccp_events_detail` | events | coach:read | KEEP | 115 | 1 |
| `ccp_events_create` | events | coach:write | GRANULAR-ONLY | 192 | 1 |
| `ccp_events_update` | events | coach:write | GRANULAR-ONLY | 143 | 1 |
| `ccp_events_delete_impact` | events | coach:read | KEEP | 70 | 1 |
| `ccp_events_delete` | events | coach:write | GRANULAR-ONLY | 97 | 1 |
| `ccp_reports_student_progress` | reports | coach:read | KEEP | 239 | 1 |
| `ccp_account_security_handoff` | account | coach:read | KEEP | 189 | 0 |
| `ccp_hosted_subscription_handoff` | hosted | coach:read | KEEP | 238 | 0 |
| `ccp_teacher_profile_get` | teacher | coach:read | KEEP | 111 | 1 |
| `ccp_teacher_profile_update` | teacher | coach:write | GRANULAR-ONLY | 168 | 1 |
| `ccp_calendar_feed_status` | calendar | coach:read | KEEP | 95 | 1 |
| `ccp_calendar_feed_rotate` | calendar | coach:write | KEEP | 203 | 1 |
| `ccp_events_email_preview` | events | coach:read | KEEP/COMPOSE | 212 | 1 |
| `ccp_events_email_invites` | events | coach:write | KEEP | 138 | 1 |
| `ccp_session_attendance_list` | session | coach:read | KEEP | 143 | 1 |
| `ccp_session_attendance_set` | session | coach:write | GRANULAR-ONLY | 209 | 1 |
| `ccp_session_attendance_bulk_set` | session | coach:write | KEEP/COMPOSE | 149 | 1 |
| `ccp_canonical_makeup_credits_list` | canonical | coach:read | KEEP | 233 | 1 |
| `ccp_session_notes_list` | session | coach:read | KEEP | 190 | 1 |
| `ccp_session_notes_save` | session | coach:write | KEEP | 206 | 1 |
| `ccp_private_sessions_create` | private | coach:write | GRANULAR-ONLY | 332 | 1 |
| `ccp_recurring_slots_list` | recurring | coach:read | KEEP | 139 | 1 |
| `ccp_recurring_slots_create` | recurring | coach:write | GRANULAR-ONLY | 250 | 1 |
| `ccp_recurring_slots_update` | recurring | coach:write | GRANULAR-ONLY | 206 | 1 |
| `ccp_recurring_slots_delete` | recurring | coach:write | GRANULAR-ONLY | 181 | 1 |
| `ccp_guardians_list` | guardians | coach:read | KEEP | 174 | 1 |
| `ccp_guardians_detail` | guardians | coach:read | KEEP | 126 | 1 |
| `ccp_guardians_create` | guardians | coach:write | GRANULAR-ONLY | 185 | 1 |
| `ccp_guardians_update` | guardians | coach:write | GRANULAR-ONLY | 142 | 1 |
| `ccp_guardians_delete_impact` | guardians | coach:read | KEEP | 67 | 1 |
| `ccp_guardians_delete` | guardians | coach:write | GRANULAR-ONLY | 111 | 1 |
| `ccp_guardians_rotate_portal_token` | guardians | coach:write | KEEP | 229 | 1 |
| `ccp_skill_dimensions_list` | skill | coach:read | KEEP | 98 | 1 |
| `ccp_skill_dimensions_create` | skill | coach:write | GRANULAR-ONLY | 80 | 1 |
| `ccp_skill_dimensions_update` | skill | coach:write | GRANULAR-ONLY | 88 | 1 |
| `ccp_skill_dimensions_delete_impact` | skill | coach:read | KEEP | 94 | 1 |
| `ccp_skill_dimensions_delete` | skill | coach:write | GRANULAR-ONLY | 114 | 1 |
| `ccp_teacher_context_get` | teacher | coach:read | KEEP | 151 | 1 |
| `ccp_student_ratings_list` | student | coach:read | KEEP | 171 | 1 |
| `ccp_student_ratings_record` | student | coach:write | GRANULAR-ONLY | 159 | 1 |
| `ccp_student_ratings_refresh_preview` | student | coach:read | KEEP/COMPOSE | 222 | 1 |
| `ccp_student_ratings_refresh_commit` | student | coach:write | KEEP | 204 | 1 |
| `ccp_materials_preferences_list` | materials | coach:read | KEEP | 199 | 1 |
| `ccp_materials_preferences_resolve` | materials | coach:read | KEEP | 254 | 1 |
| `ccp_materials_preferences_set` | materials | coach:write | GRANULAR-ONLY | 323 | 1 |
| `ccp_materials_chapters_search` | materials | coach:read | KEEP | 203 | 1 |
| `ccp_materials_chapters_get` | materials | coach:read | KEEP | 146 | 1 |
| `ccp_materials_chapters_sync` | materials | coach:write | KEEP | 209 | 1 |
| `ccp_materials_link_preview` | materials | coach:read | KEEP/COMPOSE | 168 | 1 |
| `ccp_materials_link_commit` | materials | coach:write | KEEP | 195 | 1 |
| `ccp_chess_fen_validate` | chess | coach:read | KEEP | 178 | 1 |
| `ccp_puzzles_study_series_list` | puzzles | coach:read | KEEP | 164 | 1 |
| `ccp_puzzles_study_capacity` | puzzles | coach:read | KEEP | 136 | 1 |
| `ccp_puzzles_study_create` | puzzles | coach:write | GRANULAR-ONLY | 192 | 1 |
| `ccp_puzzles_study_reconcile` | puzzles | coach:write | KEEP | 130 | 1 |
| `ccp_lichess_connection_status` | lichess | coach:read | KEEP | 114 | 1 |
| `ccp_lichess_image_fen_propose` | lichess | coach:read | KEEP | 398 | 1 |
| `ccp_lichess_puzzle_preview` | lichess | coach:read | KEEP/COMPOSE | 322 | 1 |
| `ccp_lichess_puzzle_publish` | lichess | coach:write | KEEP | 337 | 1 |
| `ccp_lichess_studies_search` | lichess | coach:read | KEEP | 289 | 1 |
| `ccp_lichess_connect_handoff` | lichess | coach:read | KEEP | 180 | 1 |
| `ccp_lichess_connection_disconnect` | lichess | coach:write | KEEP | 140 | 1 |
| `ccp_student_skill_assessments_list` | student | coach:read | KEEP | 102 | 1 |
| `ccp_student_skill_assessments_record` | student | coach:write | GRANULAR-ONLY | 229 | 1 |
| `ccp_students_roster` | students | coach:read | KEEP | 211 | 1 |
| `ccp_students_profile` | students | coach:read | KEEP | 198 | 1 |
| `ccp_students_chess_history` | students | coach:read | KEEP | 177 | 1 |
| `ccp_students_delete_impact` | students | coach:read | KEEP | 145 | 1 |
| `ccp_students_delete` | students | coach:write | GRANULAR-ONLY | 175 | 1 |
| `ccp_students_archive_preview` | students | coach:read | KEEP/COMPOSE | 195 | 1 |
| `ccp_students_profile_edit` | students | coach:write | GRANULAR-ONLY | 337 | 1 |
| `ccp_students_search` | students | coach:read | KEEP | 123 | 2 |
| `ccp_groups_list` | groups | coach:read | KEEP | 56 | 1 |
| `ccp_groups_members` | groups | coach:read | KEEP | 93 | 1 |
| `ccp_sessions_list` | sessions | coach:read | KEEP | 138 | 1 |
| `ccp_sessions_participants` | sessions | coach:read | KEEP | 96 | 1 |
| `ccp_attendance_preview` | attendance | coach:read | KEEP/COMPOSE | 222 | 1 |
| `ccp_attendance_record` | attendance | coach:write | GRANULAR-ONLY | 237 | 1 |
| `ccp_attendance_bulk_record` | attendance | coach:write | KEEP/COMPOSE | 319 | 1 |
| `ccp_sessions_note_update` | sessions | coach:write | GRANULAR-ONLY | 187 | 0 |
| `ccp_chess_categories_create` | chess | coach:write | GRANULAR-ONLY | 97 | 1 |
| `ccp_chess_categories_update` | chess | coach:write | GRANULAR-ONLY | 124 | 1 |
| `ccp_material_links_unlink_impact` | material | coach:read | KEEP | 109 | 1 |
| `ccp_material_links_unlink` | material | coach:write | GRANULAR-ONLY | 135 | 1 |
| `ccp_chess_categories_delete_impact` | chess | coach:read | KEEP | 115 | 1 |
| `ccp_chess_categories_delete` | chess | coach:write | GRANULAR-ONLY | 126 | 1 |
| `ccp_chess_observations_update` | chess | coach:write | GRANULAR-ONLY | 155 | 1 |
| `ccp_material_links_update` | material | coach:write | GRANULAR-ONLY | 176 | 1 |
| `ccp_chess_categories_list` | chess | coach:read | KEEP | 105 | 1 |
| `ccp_chess_observations_list` | chess | coach:read | KEEP | 116 | 1 |
| `ccp_chess_observations_propose` | chess | coach:write | KEEP | 127 | 1 |
| `ccp_materials_history_list` | materials | coach:read | KEEP | 271 | 1 |
| `ccp_materials_aggregate` | materials | coach:read | KEEP/COMPOSE | 261 | 1 |
| `ccp_material_defaults_list` | material | coach:read | KEEP | 159 | 0 |
| `ccp_material_default_create` | material | coach:write | GRANULAR-ONLY | 178 | 0 |
| `ccp_material_default_update` | material | coach:write | GRANULAR-ONLY | 135 | 0 |
| `ccp_material_default_archive` | material | coach:write | KEEP | 106 | 0 |
| `ccp_materials_history_record` | materials | coach:write | GRANULAR-ONLY | 274 | 1 |
| `ccp_materials_history_void` | materials | coach:write | GRANULAR-ONLY | 190 | 1 |
| `ccp_materials_lesson_use_preview` | materials | coach:read | KEEP/COMPOSE | 408 | 1 |
| `ccp_materials_lesson_use_commit` | materials | coach:write | KEEP | 380 | 1 |
| `ccp_material_links_list` | material | coach:read | KEEP | 123 | 1 |
| `ccp_material_links_create` | material | coach:write | GRANULAR-ONLY | 155 | 1 |
| `ccp_workplaces_create` | workplaces | coach:write | GRANULAR-ONLY | 80 | 1 |
| `ccp_workplaces_update` | workplaces | coach:write | GRANULAR-ONLY | 97 | 1 |
| `ccp_students_create` | students | coach:write | GRANULAR-ONLY | 173 | 2 |
| `ccp_students_create_full` | students | coach:write | KEEP | 321 | 1 |
| `ccp_students_update` | students | coach:write | GRANULAR-ONLY | 92 | 2 |
| `ccp_workplaces_enroll` | workplaces | coach:write | KEEP | 76 | 1 |
| `ccp_workplaces_unenroll` | workplaces | coach:write | KEEP | 160 | 1 |
| `ccp_workplaces_enrollments` | workplaces | coach:read | KEEP | 54 | 1 |
| `ccp_groups_create` | groups | coach:write | GRANULAR-ONLY | 64 | 1 |
| `ccp_groups_update` | groups | coach:write | GRANULAR-ONLY | 77 | 1 |
| `ccp_groups_enroll` | groups | coach:write | KEEP | 100 | 1 |
| `ccp_groups_unenroll` | groups | coach:write | KEEP | 108 | 1 |
| `ccp_schedule_day_preview` | schedule | coach:read | KEEP/COMPOSE | 262 | 1 |
| `ccp_students_resolve` | students | coach:read | KEEP | 238 | 1 |
| `ccp_lessons_capture_commit_with_chapter` | lessons | coach:write | KEEP/COMPOSE | 415 | 1 |
| `ccp_lessons_capture_preview` | lessons | coach:read | KEEP/COMPOSE | 371 | 1 |
| `ccp_lessons_capture_completed` | lessons | coach:write | KEEP | 524 | 1 |
| `ccp_sessions_ad_hoc_create` | sessions | coach:write | GRANULAR-ONLY | 184 | 1 |
| `ccp_sessions_details` | sessions | coach:read | KEEP | 77 | 0 |
| `ccp_sessions_create` | sessions | coach:write | GRANULAR-ONLY | 145 | 1 |
| `ccp_sessions_edit` | sessions | coach:write | GRANULAR-ONLY | 267 | 2 |
| `ccp_sessions_complete` | sessions | coach:write | KEEP | 285 | 1 |
| `ccp_sessions_reschedule` | sessions | coach:write | KEEP | 106 | 0 |
| `ccp_sessions_roster_preview` | sessions | coach:read | KEEP/COMPOSE | 97 | 1 |
| `ccp_sessions_roster_correct` | sessions | coach:write | GRANULAR-ONLY | 243 | 1 |
| `ccp_sessions_roster_revisions_list` | sessions | coach:read | KEEP | 129 | 1 |
| `ccp_sessions_cancel` | sessions | coach:write | KEEP | 83 | 0 |
| `ccp_learning_materials_list` | materials | coach:read | KEEP | 154 | 1 |
| `ccp_learning_materials_get` | materials | coach:read | KEEP | 118 | 1 |
| `ccp_learning_materials_create` | materials | coach:write | GRANULAR-ONLY | 273 | 1 |
| `ccp_learning_materials_update` | materials | coach:write | GRANULAR-ONLY | 254 | 1 |
| `ccp_learning_material_relations_list` | learning | coach:read | KEEP | 127 | 1 |
| `ccp_learning_material_relation_change` | learning | coach:write | KEEP | 181 | 1 |
| `ccp_learning_material_archive_preview` | learning | coach:read | KEEP/COMPOSE | 116 | 1 |
| `ccp_learning_material_lifecycle_change` | learning | coach:write | GRANULAR-ONLY | 200 | 1 |
| `ccp_training_assignments_list` | training | coach:read | KEEP | 153 | 1 |
| `ccp_training_assignments_create` | training | coach:write | GRANULAR-ONLY | 171 | 1 |
| `ccp_training_attempt_record` | training | coach:write | GRANULAR-ONLY | 125 | 1 |
| `ccp_training_review_record` | training | coach:write | GRANULAR-ONLY | 126 | 1 |
| `ccp_training_plans_list` | training | coach:read | KEEP | 136 | 1 |
| `ccp_training_plans_get` | training | coach:read | KEEP | 94 | 1 |
| `ccp_training_plans_commit` | training | coach:write | KEEP | 214 | 1 |
| `ccp_coach_briefing_get` | coach | coach:read | KEEP/COMPOSE | 250 | 1 |

## Distinctions requiring human review

- A tool namespace is **not** an MCP subgroup and does not automatically defer model-context loading; client-native progressive discovery controls model exposure.
- Do not add a generic executor. Typed high-level operations are additional named tools backed by the same owner-scoped domain services; all granular field-level tools remain callable.
- PR #95 separates source-neutral presence-date evidence, advanced historical import and student/family spreadsheet import. Do not conflate any of these with a scheduled lesson.
- CSV pages are for an explicitly requested data export; never load the complete archive to answer a normal coaching question. CSV is not the restore format.
- Read-only preview must not claim persistence; confirmation and idempotent commit must preserve tenant, timezone, evidence and retry rules.
- Name/description-only metadata checks are not model-completion benchmarks. Run exact real-client acceptance separately when required.
