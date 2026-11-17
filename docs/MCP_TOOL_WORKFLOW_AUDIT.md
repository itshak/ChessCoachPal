# ChessCoachPal MCP tool and coaching-workflow audit

> Generated from the actual typed source catalog with `node scripts/mcp-tool-workflow-audit.mjs --write`. Classifications are **initial engineering dispositions** to review during this OpenSpec; not claims that each tool has undergone live-model testing. Do not replace the current full tool surface with this document.

## Baseline

- Tools: **198** (count at current source, not a version-pinned policy).
- Full browser↔MCP parity remains required. Each row identifies the actual named dispatch case, direct imported service calls and known website-route inventory references. A zero-route-reference row means no *one-to-one route claim* in the registry, **not** an inaccessible tool or proven parity gap. Both runtime and schema validation require authenticated E2E.
- Call-count comparisons are **minimum client orchestration proxies** for a reviewed operation, not empirical model-token or latency results; independent read-back may add an optional call.
- Quality check: `npm run mcp:catalog:quality` (static names/description/dispatch). Tool counts and total schema bytes are diagnostic; not optimization targets.

## Teacher intents before endpoints

| Intent | Existing safe client sequence (examples) | Desired composition | Status |
| --- | --- | --- | --- |
| Completed group lesson with each pupil's note | 4 calls: `ccp_lessons_capture_preview` → `ccp_sessions_ad_hoc_create` → `ccp_sessions_details` → `ccp_sessions_complete` | 2 calls: `ccp_lessons_capture_preview` → `ccp_lessons_capture_completed`; one SQL transaction, explicit attendance and no inferred mastery | Implemented; authenticated E2E on PR #97 |
| Use a newly created drill or study material in one completed lesson | 5+ calls for 2 pupils: `ccp_learning_materials_list`, `ccp_learning_materials_create`, `ccp_material_links_create`, twice `ccp_materials_history_record` | 2 calls: `ccp_materials_lesson_use_preview` → `ccp_materials_lesson_use_commit`; one transaction, stored source and per-pupil evidence | Implemented; authenticated E2E on PR #97 |
| Pre-lesson individual briefing | `ccp_coach_briefing_get` | Reuse the existing bounded multi-source briefing; no duplicate command | Existing |
| Record verified historical attendance dates | `ccp_historical_attendance_dates_preview` → `ccp_historical_attendance_dates_commit` | Preserve PR #95's review/commit; **never create calendar sessions** | Existing |
| Import aggregate/absent historical records | `ccp_historical_attendance_preview` → `ccp_historical_attendance_commit` | Preserve advanced mapped/staged workflows and safeguards | Existing |
| Export full teacher data | `ccp_settings_export_csv` per table with safe paging, or website ZIP | Preserve privacy-filtered pages and JSON restore as distinct | Existing |
| Correct one attendance/learning record | Existing exact revision-guarded update/void tools | Preserve granular editing and history/audit; compound correction only if justified | Existing |
| Track workplace teaching time | `ccp_reports_workplace_summary` | Reuse authoritative teacher-time aggregation (group counted once) | Existing |
| Invoices/communications | Existing preview → explicit confirmed send/record | Separate external effects; never fold automatic messages/payments into lesson capture | Existing |

## Full discovered tool catalogue

| Tool | Domain | OAuth | Initial disposition | Shared service / dispatch | Website route references | Description chars |
| --- | --- | --- | --- | --- | --- | ---: |
| `ccp_workplaces_list` | workplaces | coach:read | KEEP | workplacesList | `app/api/agent/v1/route.ts` | 79 |
| `ccp_dashboard_summary` | dashboard | coach:read | KEEP/COMPOSE | teacherDashboardSummary | `app/api/dashboard/summary/route.ts` | 111 |
| `ccp_notifications_list` | notifications | coach:read | KEEP | teacherNotificationsList | `app/api/notifications/route.ts` | 90 |
| `ccp_notifications_mark_read` | notifications | coach:write | KEEP | teacherNotificationsMarkRead | `app/api/notifications/route.ts` | 130 |
| `ccp_lessons_history_unified` | lessons | coach:read | KEEP | teacherUnifiedLessonHistory | `app/api/coaching/unified-lessons/route.ts` | 334 |
| `ccp_reports_workplace_summary` | reports | coach:read | KEEP/COMPOSE | workplaceTeachingReport | `app/api/coaching/report/route.ts` | 251 |
| `ccp_billing_generation_preview` | finance | coach:read | KEEP/COMPOSE | teacherBillingGenerate | `app/api/billing/generate/route.ts` | 172 |
| `ccp_billing_generation_commit` | finance | coach:write | KEEP | teacherBillingGenerate | `app/api/billing/generate/route.ts` | 233 |
| `ccp_billing_invoice_regenerate` | finance | coach:write | KEEP | teacherBillingRegenerate | `app/api/billing/invoices/[id]/regenerate/route.ts` | 269 |
| `ccp_billing_invoice_pdf` | finance | coach:read | KEEP | loadInvoicePdf, invoicePdfMcpPayload | `app/api/billing/invoices/[id]/pdf/route.ts` | 196 |
| `ccp_billing_invoice_checkout` | finance | coach:write | KEEP | teacherBillingCheckout, oauthOrigin | `app/api/billing/invoices/[id]/checkout/route.ts` | 204 |
| `ccp_billing_invoices_bulk_preview` | finance | coach:read | KEEP/COMPOSE | teacherBillingBulkPreview | `app/api/billing/invoices/bulk/route.ts` | 189 |
| `ccp_billing_invoices_bulk` | finance | coach:write | KEEP | teacherBillingBulk, oauthOrigin | `app/api/billing/invoices/bulk/route.ts` | 262 |
| `ccp_students_bulk_lifecycle_preview` | students | coach:read | KEEP/COMPOSE | teacherBulkLifecyclePreview | `app/api/students/bulk-lifecycle/route.ts` | 230 |
| `ccp_students_bulk_lifecycle_commit` | students | coach:write | KEEP/COMPOSE | teacherBulkLifecycleCommit | `app/api/students/bulk-lifecycle/route.ts` | 219 |
| `ccp_historical_import_upload_handoff` | historical | coach:read | KEEP | oauthOrigin | `app/api/import/historical/stage/route.ts` | 253 |
| `ccp_historical_import_stage_info` | historical | coach:read | KEEP | teacherHistoricalStageInfo | `app/api/import/historical/stage/route.ts` | 138 |
| `ccp_historical_import_stage_delete` | historical | coach:write | GRANULAR-ONLY | teacherHistoricalStageDelete | `app/api/import/historical/stage/route.ts` | 139 |
| `ccp_historical_attendance_dates_preview` | historical | coach:read | KEEP/COMPOSE | teacherHistoricalDatesPreview | `app/api/import/historical/dates/route.ts` | 539 |
| `ccp_historical_attendance_dates_commit` | historical | coach:write | KEEP/COMPOSE | teacherHistoricalDatesCommit | `app/api/import/historical/dates/route.ts` | 330 |
| `ccp_historical_attendance_preview` | historical | coach:read | KEEP/COMPOSE | teacherHistoricalAttendancePreview | `app/api/import/historical/preview/route.ts` | 652 |
| `ccp_historical_attendance_commit` | historical | coach:write | KEEP | teacherHistoricalAttendanceCommit | `app/api/import/historical/commit/route.ts` | 195 |
| `ccp_historical_attendance_report` | historical | coach:read | KEEP | teacherHistoricalAttendanceReport | `app/api/import/historical/report/route.ts` | 217 |
| `ccp_historical_attendance_summary` | historical | coach:read | KEEP/COMPOSE | teacherHistoricalAttendanceSummary | `app/api/import/historical/report/route.ts` | 200 |
| `ccp_import_spreadsheet_parse` | import/export/settings | coach:read | KEEP | teacherSpreadsheetParse | `app/api/import/spreadsheet/parse/route.ts` | 145 |
| `ccp_import_spreadsheet_preview` | import/export/settings | coach:read | KEEP/COMPOSE | teacherSpreadsheetPreview | `app/api/import/spreadsheet/parse/route.ts` | 108 |
| `ccp_import_spreadsheet_suggest` | import/export/settings | coach:read | KEEP | teacherSpreadsheetSuggest | `app/api/import/spreadsheet/suggest/route.ts` | 201 |
| `ccp_import_spreadsheet_commit` | import/export/settings | coach:write | KEEP | teacherSpreadsheetCommit | `app/api/import/spreadsheet/commit/route.ts` | 231 |
| `ccp_settings_export` | import/export/settings | coach:read | KEEP | teacherSafeExport | `app/api/settings/export/route.ts` | 197 |
| `ccp_settings_export_csv` | import/export/settings | coach:read | KEEP/COMPOSE | teacherCsvExport | `app/api/settings/export/route.ts` | 516 |
| `ccp_settings_import_preview` | import/export/settings | coach:read | KEEP/COMPOSE | teacherImportPreview | `app/api/settings/import/route.ts` | 132 |
| `ccp_settings_import_apply` | import/export/settings | coach:write | KEEP | teacherImportApply | `app/api/settings/import/route.ts` | 225 |
| `ccp_billing_manual_payment_record` | finance | coach:write | GRANULAR-ONLY | teacherManualPaymentRecord | `app/api/billing/invoices/[id]/mark-paid/route.ts` | 283 |
| `ccp_billing_manual_payment_delete` | finance | coach:write | GRANULAR-ONLY | teacherManualPaymentDelete | `app/api/billing/invoices/[id]/payments/[paymentId]/route.ts` | 244 |
| `ccp_credits_packages_list` | finance | coach:read | KEEP | teacherCreditPackagesList | `app/api/billing/credit-packages/route.ts` | 134 |
| `ccp_credits_package_create` | finance | coach:write | GRANULAR-ONLY | teacherCreditPackageCreate | `app/api/billing/credit-packages/route.ts` | 155 |
| `ccp_credits_package_expiry` | finance | coach:write | KEEP | teacherCreditPackageExpiry | `app/api/billing/credit-packages/[id]/route.ts` | 116 |
| `ccp_credits_redemption_return` | finance | coach:write | KEEP | teacherCreditRedemptionReturn | `app/api/billing/credit-redemptions/[id]/route.ts` | 128 |
| `ccp_connections_list` | connections | coach:read | KEEP | teacherConnectionsList | `app/api/agent/connections/route.ts` | 136 |
| `ccp_connections_revoke` | connections | coach:write | KEEP | teacherConnectionRevoke | `app/api/agent/connections/route.ts` | 165 |
| `ccp_billing_invoice_draft_update` | finance | coach:write | GRANULAR-ONLY | teacherInvoiceDraftUpdate | `app/api/billing/invoices/[id]/route.ts` | 260 |
| `ccp_billing_invoice_void` | finance | coach:write | GRANULAR-ONLY | teacherInvoiceVoid | `app/api/billing/invoices/[id]/void/route.ts` | 242 |
| `ccp_billing_invoice_delete` | finance | coach:write | GRANULAR-ONLY | teacherInvoiceDelete | `app/api/billing/invoices/[id]/route.ts` | 171 |
| `ccp_billing_invoice_send_preview` | finance | coach:read | KEEP/COMPOSE | teacherInvoiceSendPreview | `app/api/billing/invoices/[id]/send/route.ts` | 242 |
| `ccp_billing_invoice_send` | finance | coach:write | KEEP | teacherInvoiceSend, oauthOrigin | `app/api/billing/invoices/[id]/send/route.ts` | 285 |
| `ccp_billing_invoices_list` | finance | coach:read | KEEP | teacherInvoicesList | No direct route registry claim | 127 |
| `ccp_billing_invoice_detail` | finance | coach:read | KEEP | teacherInvoiceDetail, safeInvoice | `app/api/billing/invoices/[id]/route.ts` | 183 |
| `ccp_billing_payments_export` | finance | coach:read | KEEP | teacherPaymentsExport | `app/api/billing/export/route.ts` | 199 |
| `ccp_studio_policy_get` | studio | coach:read | KEEP | teacherPolicyView | `app/api/settings/policy/route.ts` | 205 |
| `ccp_studio_credentials_handoff` | studio | coach:read | KEEP | teacherPolicyView, oauthOrigin | `app/api/settings/policy/route.ts` | 267 |
| `ccp_studio_policy_update` | studio | coach:write | GRANULAR-ONLY | teacherPolicyUpdate | `app/api/settings/policy/route.ts` | 224 |
| `ccp_events_list` | events | coach:read | KEEP | teacherEventsList | `app/api/events/route.ts` | 102 |
| `ccp_events_detail` | events | coach:read | KEEP | teacherEventDetail | `app/api/events/[id]/route.ts` | 115 |
| `ccp_events_create` | events | coach:write | GRANULAR-ONLY | teacherEventCreate | `app/api/events/route.ts` | 192 |
| `ccp_events_update` | events | coach:write | GRANULAR-ONLY | teacherEventUpdate | `app/api/events/[id]/route.ts` | 143 |
| `ccp_events_delete_impact` | events | coach:read | KEEP | teacherEventDeleteImpact | `app/api/events/[id]/route.ts` | 70 |
| `ccp_events_delete` | events | coach:write | GRANULAR-ONLY | teacherEventDelete | `app/api/events/[id]/route.ts` | 97 |
| `ccp_reports_student_progress` | reports | coach:read | KEEP | teacherStudentProgressReport | `app/api/coaching/student-progress/route.ts` | 239 |
| `ccp_account_security_handoff` | account | coach:read | KEEP | oauthOrigin | No direct route registry claim | 189 |
| `ccp_hosted_subscription_handoff` | hosted | coach:read | KEEP | oauthOrigin | No direct route registry claim | 238 |
| `ccp_teacher_profile_get` | teacher | coach:read | KEEP | teacherProfileGet | `app/api/auth/update-profile/route.ts` | 111 |
| `ccp_teacher_profile_update` | teacher | coach:write | GRANULAR-ONLY | teacherProfileUpdate | `app/api/auth/update-profile/route.ts` | 168 |
| `ccp_calendar_feed_status` | calendar | coach:read | KEEP | teacherCalendarFeedStatus | `app/api/teacher/calendar-token/route.ts` | 95 |
| `ccp_calendar_feed_rotate` | calendar | coach:write | KEEP | teacherCalendarFeedRotate | `app/api/teacher/calendar-token/route.ts` | 203 |
| `ccp_events_email_preview` | events | coach:read | KEEP/COMPOSE | teacherEventInvitePreview | `app/api/events/[id]/email/route.ts` | 212 |
| `ccp_events_email_invites` | events | coach:write | KEEP | teacherEventInviteEmail, oauthOrigin | `app/api/events/[id]/email/route.ts` | 138 |
| `ccp_session_attendance_list` | session | coach:read | KEEP | canonicalAttendanceList | `app/api/coaching/sessions/[id]/attendance/route.ts` | 143 |
| `ccp_session_attendance_set` | session | coach:write | GRANULAR-ONLY | canonicalAttendanceSet | `app/api/coaching/sessions/[id]/attendance/route.ts` | 209 |
| `ccp_session_attendance_bulk_set` | session | coach:write | KEEP/COMPOSE | canonicalAttendanceBulkSet | `app/api/coaching/sessions/[id]/attendance/route.ts` | 149 |
| `ccp_canonical_makeup_credits_list` | canonical | coach:read | KEEP | canonicalMakeupCreditsList | `app/api/coaching/calendar/makeup-credits/route.ts` | 233 |
| `ccp_session_notes_list` | session | coach:read | KEEP | sessionNotesList | `app/api/coaching/sessions/[id]/notes/route.ts` | 190 |
| `ccp_session_notes_save` | session | coach:write | KEEP | sessionNoteSave | `app/api/coaching/sessions/[id]/notes/route.ts` | 206 |
| `ccp_private_sessions_create` | private | coach:write | GRANULAR-ONLY | canonicalPrivateSessionCreate | `app/api/coaching/calendar/private-sessions/route.ts` | 332 |
| `ccp_recurring_slots_list` | recurring | coach:read | KEEP | canonicalSlotsList | `app/api/coaching/calendar/slots/route.ts` | 139 |
| `ccp_recurring_slots_create` | recurring | coach:write | GRANULAR-ONLY | canonicalSlotCreate | `app/api/coaching/calendar/slots/route.ts` | 250 |
| `ccp_recurring_slots_update` | recurring | coach:write | GRANULAR-ONLY | canonicalSlotUpdate | `app/api/coaching/calendar/slots/[id]/route.ts` | 206 |
| `ccp_recurring_slots_delete` | recurring | coach:write | GRANULAR-ONLY | canonicalSlotDelete | `app/api/coaching/calendar/slots/[id]/route.ts` | 181 |
| `ccp_guardians_list` | guardians | coach:read | KEEP | guardiansList, safeGuardian | `app/api/guardians/route.ts` | 174 |
| `ccp_guardians_detail` | guardians | coach:read | KEEP | guardianDetail, safeGuardian | `app/api/guardians/[id]/route.ts` | 126 |
| `ccp_guardians_create` | guardians | coach:write | GRANULAR-ONLY | guardianCreate, safeGuardian | `app/api/guardians/route.ts` | 185 |
| `ccp_guardians_update` | guardians | coach:write | GRANULAR-ONLY | guardianUpdate, safeGuardian | `app/api/guardians/[id]/route.ts` | 142 |
| `ccp_guardians_delete_impact` | guardians | coach:read | KEEP | guardianDeleteImpact | `app/api/guardians/[id]/route.ts` | 67 |
| `ccp_guardians_delete` | guardians | coach:write | GRANULAR-ONLY | guardianDelete | `app/api/guardians/[id]/route.ts` | 111 |
| `ccp_guardians_rotate_portal_token` | guardians | coach:write | KEEP | guardianRotatePortalToken | `app/api/guardians/[id]/rotate-token/route.ts` | 229 |
| `ccp_skill_dimensions_list` | skill | coach:read | KEEP | skillDimensionsList | `app/api/skills/dimensions/route.ts` | 98 |
| `ccp_skill_dimensions_create` | skill | coach:write | GRANULAR-ONLY | skillDimensionsCreate | `app/api/skills/dimensions/route.ts` | 80 |
| `ccp_skill_dimensions_update` | skill | coach:write | GRANULAR-ONLY | skillDimensionsUpdate | `app/api/skills/dimensions/[id]/route.ts` | 88 |
| `ccp_skill_dimensions_delete_impact` | skill | coach:read | KEEP | skillDimensionsDeleteImpact | `app/api/skills/dimensions/[id]/route.ts` | 94 |
| `ccp_skill_dimensions_delete` | skill | coach:write | GRANULAR-ONLY | skillDimensionsDelete | `app/api/skills/dimensions/[id]/route.ts` | 114 |
| `ccp_teacher_context_get` | teacher | coach:read | KEEP | teacherContextGet | `app/api/teacher/context/route.ts` | 151 |
| `ccp_student_ratings_list` | student | coach:read | KEEP | teacherStudentRatingHistory | `app/api/students/[id]/ratings/route.ts` | 171 |
| `ccp_student_ratings_record` | student | coach:write | GRANULAR-ONLY | teacherStudentRatingRecord | `app/api/students/[id]/ratings/route.ts` | 159 |
| `ccp_student_ratings_refresh_preview` | student | coach:read | KEEP/COMPOSE | teacherStudentRatingRefreshPreview | `app/api/students/[id]/ratings/route.ts` | 222 |
| `ccp_student_ratings_refresh_commit` | student | coach:write | KEEP | teacherStudentRatingRefreshCommit | `app/api/students/[id]/ratings/route.ts` | 204 |
| `ccp_materials_preferences_list` | materials | coach:read | KEEP | teacherStudyPreferencesList | `app/api/lichess/study-preferences/route.ts` | 199 |
| `ccp_materials_preferences_resolve` | materials | coach:read | KEEP | teacherStudyPreferenceResolve | `app/api/lichess/study-preferences/route.ts` | 254 |
| `ccp_materials_preferences_set` | materials | coach:write | GRANULAR-ONLY | teacherStudyPreferenceSet | `app/api/lichess/study-preferences/route.ts` | 323 |
| `ccp_materials_chapters_search` | materials | coach:read | KEEP | teacherStudyIndexSearch | `app/api/lichess/chapter-index/route.ts` | 203 |
| `ccp_materials_chapters_get` | materials | coach:read | KEEP | teacherStudyIndexGet | `app/api/lichess/chapter-index/route.ts` | 146 |
| `ccp_materials_chapters_sync` | materials | coach:write | KEEP | teacherStudyIndexSync | `app/api/lichess/chapter-index/route.ts` | 209 |
| `ccp_materials_link_preview` | materials | coach:read | KEEP/COMPOSE | teacherLessonChapterPreview | `app/api/coaching/chapter-evidence/route.ts` | 168 |
| `ccp_materials_link_commit` | materials | coach:write | KEEP | teacherLessonChapterCommit | `app/api/coaching/chapter-evidence/route.ts` | 195 |
| `ccp_chess_fen_validate` | chess | coach:read | KEEP | teacherFenValidate | `app/api/lichess/fen-validate/route.ts` | 178 |
| `ccp_puzzles_study_series_list` | puzzles | coach:read | KEEP | teacherPuzzleSeriesList | `app/api/lichess/puzzle-series/route.ts` | 164 |
| `ccp_puzzles_study_capacity` | puzzles | coach:read | KEEP | teacherPuzzleStudyCapacity | `app/api/lichess/puzzle-series/route.ts` | 136 |
| `ccp_puzzles_study_create` | puzzles | coach:write | GRANULAR-ONLY | teacherPuzzleSeriesCreate | `app/api/lichess/puzzle-series/route.ts` | 192 |
| `ccp_puzzles_study_reconcile` | puzzles | coach:write | KEEP | teacherPuzzleSeriesReconcile | `app/api/lichess/puzzle-series/route.ts` | 130 |
| `ccp_lichess_connection_status` | lichess | coach:read | KEEP | lichessConnectionStatus | `app/api/lichess/connection/route.ts` | 114 |
| `ccp_lichess_image_fen_propose` | lichess | coach:read | KEEP | teacherImageFenPropose | `app/api/lichess/puzzles/preview/route.ts` | 398 |
| `ccp_lichess_puzzle_preview` | lichess | coach:read | KEEP/COMPOSE | teacherLichessPuzzlePreview | `app/api/lichess/puzzles/preview/route.ts` | 322 |
| `ccp_lichess_puzzle_publish` | lichess | coach:write | KEEP | teacherLichessPuzzlePublish | `app/api/lichess/puzzles/route.ts` | 337 |
| `ccp_lichess_studies_search` | lichess | coach:read | KEEP | teacherLichessStudiesSearch | `app/api/lichess/studies/route.ts` | 289 |
| `ccp_lichess_connect_handoff` | lichess | coach:read | KEEP | lichessConnectionHandoff | `app/api/lichess/connect/route.ts` | 180 |
| `ccp_lichess_connection_disconnect` | lichess | coach:write | KEEP | disconnectLichess | `app/api/lichess/connection/route.ts` | 140 |
| `ccp_student_skill_assessments_list` | student | coach:read | KEEP | studentSkillAssessmentsList | `app/api/students/[id]/skills/route.ts` | 102 |
| `ccp_student_skill_assessments_record` | student | coach:write | GRANULAR-ONLY | studentSkillAssessmentsRecord | `app/api/students/[id]/skills/route.ts` | 229 |
| `ccp_students_roster` | students | coach:read | KEEP | teacherStudentsRoster | `app/api/students/route.ts` | 211 |
| `ccp_students_profile` | students | coach:read | KEEP | teacherStudentProfile | `app/api/students/[id]/route.ts` | 198 |
| `ccp_students_chess_history` | students | coach:read | KEEP | teacherStudentChessHistory | `app/api/students/[id]/route.ts` | 177 |
| `ccp_students_delete_impact` | students | coach:read | KEEP | teacherStudentDeleteImpact | `app/api/students/[id]/route.ts` | 145 |
| `ccp_students_delete` | students | coach:write | GRANULAR-ONLY | teacherStudentDelete | `app/api/students/[id]/route.ts` | 175 |
| `ccp_students_archive_preview` | students | coach:read | KEEP/COMPOSE | teacherStudentArchivePreview | `app/api/students/[id]/route.ts` | 195 |
| `ccp_students_profile_edit` | students | coach:write | GRANULAR-ONLY | teacherStudentPatch | `app/api/students/[id]/route.ts` | 337 |
| `ccp_students_search` | students | coach:read | KEEP | teacherStudentsRoster | `app/api/agent/v1/route.ts`, `app/api/students/route.ts` | 123 |
| `ccp_groups_list` | groups | coach:read | KEEP | groupsList | `app/api/agent/v1/route.ts` | 56 |
| `ccp_groups_members` | groups | coach:read | KEEP | groupsMembers | `app/api/agent/v1/route.ts` | 93 |
| `ccp_sessions_list` | sessions | coach:read | KEEP | sessionsList | `app/api/agent/v1/route.ts` | 138 |
| `ccp_sessions_participants` | sessions | coach:read | KEEP | sessionsParticipants | `app/api/agent/v1/route.ts` | 96 |
| `ccp_attendance_preview` | attendance | coach:read | KEEP/COMPOSE | sessionsParticipants, attendanceList | `app/api/agent/v1/route.ts` | 222 |
| `ccp_attendance_record` | attendance | coach:write | GRANULAR-ONLY | attendanceRecord | `app/api/agent/v1/route.ts` | 237 |
| `ccp_attendance_bulk_record` | attendance | coach:write | KEEP/COMPOSE | attendanceBulkRecord | `app/api/agent/v1/route.ts` | 319 |
| `ccp_sessions_note_update` | sessions | coach:write | GRANULAR-ONLY | sessionsUpdate | No direct route registry claim | 187 |
| `ccp_chess_categories_create` | chess | coach:write | GRANULAR-ONLY | chessCategoriesCreate | `app/api/agent/v1/route.ts` | 97 |
| `ccp_chess_categories_update` | chess | coach:write | GRANULAR-ONLY | chessCategoriesUpdate | `app/api/agent/v1/route.ts` | 124 |
| `ccp_material_links_unlink_impact` | material | coach:read | KEEP | materialLinksUnlinkImpact | `app/api/agent/v1/route.ts` | 109 |
| `ccp_material_links_unlink` | material | coach:write | GRANULAR-ONLY | materialLinksUnlink | `app/api/agent/v1/route.ts` | 135 |
| `ccp_chess_categories_delete_impact` | chess | coach:read | KEEP | chessCategoriesDeleteImpact | `app/api/agent/v1/route.ts` | 115 |
| `ccp_chess_categories_delete` | chess | coach:write | GRANULAR-ONLY | chessCategoriesDelete | `app/api/agent/v1/route.ts` | 126 |
| `ccp_chess_observations_update` | chess | coach:write | GRANULAR-ONLY | chessObservationsUpdate | `app/api/agent/v1/route.ts` | 155 |
| `ccp_material_links_update` | material | coach:write | GRANULAR-ONLY | materialLinksUpdate | `app/api/agent/v1/route.ts` | 176 |
| `ccp_chess_categories_list` | chess | coach:read | KEEP | chessCategoriesList | `app/api/agent/v1/route.ts` | 105 |
| `ccp_chess_observations_list` | chess | coach:read | KEEP | chessObservationsList | `app/api/agent/v1/route.ts` | 116 |
| `ccp_chess_observations_propose` | chess | coach:write | KEEP | chessObservationsCreate | `app/api/agent/v1/route.ts` | 127 |
| `ccp_materials_history_list` | materials | coach:read | KEEP | teacherMaterialHistory | `app/api/coaching/materials/route.ts` | 271 |
| `ccp_materials_aggregate` | materials | coach:read | KEEP/COMPOSE | teacherMaterialAggregate | `app/api/coaching/materials/route.ts` | 261 |
| `ccp_material_defaults_list` | material | coach:read | KEEP | teacherMaterialDefaultsList | No direct route registry claim | 159 |
| `ccp_material_default_create` | material | coach:write | GRANULAR-ONLY | teacherMaterialDefaultCreate | No direct route registry claim | 178 |
| `ccp_material_default_update` | material | coach:write | GRANULAR-ONLY | teacherMaterialDefaultUpdate | No direct route registry claim | 135 |
| `ccp_material_default_archive` | material | coach:write | KEEP | teacherMaterialDefaultArchive | No direct route registry claim | 106 |
| `ccp_materials_history_record` | materials | coach:write | GRANULAR-ONLY | teacherMaterialRecord | `app/api/coaching/materials/route.ts` | 274 |
| `ccp_materials_history_void` | materials | coach:write | GRANULAR-ONLY | teacherMaterialVoid | `app/api/coaching/materials/route.ts` | 190 |
| `ccp_materials_lesson_use_preview` | materials | coach:read | KEEP/COMPOSE | teacherMaterialInLessonPreview | `app/api/coaching/materials/lesson-use/route.ts` | 408 |
| `ccp_materials_lesson_use_commit` | materials | coach:write | KEEP | teacherMaterialInLessonCommit | `app/api/coaching/materials/lesson-use/route.ts` | 380 |
| `ccp_material_links_list` | material | coach:read | KEEP | materialLinksList | `app/api/agent/v1/route.ts` | 123 |
| `ccp_material_links_create` | material | coach:write | GRANULAR-ONLY | materialLinksCreate | `app/api/agent/v1/route.ts` | 155 |
| `ccp_workplaces_create` | workplaces | coach:write | GRANULAR-ONLY | agent_coaching_mutate gateway | `app/api/agent/v1/route.ts` | 80 |
| `ccp_workplaces_update` | workplaces | coach:write | GRANULAR-ONLY | agent_coaching_mutate gateway | `app/api/agent/v1/route.ts` | 97 |
| `ccp_students_create` | students | coach:write | GRANULAR-ONLY | agent_coaching_mutate gateway | `app/api/agent/v1/route.ts`, `app/api/students/route.ts` | 173 |
| `ccp_students_create_full` | students | coach:write | KEEP | createStudentWithOptionalFamily | `app/api/students/route.ts` | 321 |
| `ccp_students_update` | students | coach:write | GRANULAR-ONLY | agent_coaching_mutate gateway | `app/api/agent/v1/route.ts`, `app/api/students/[id]/route.ts` | 92 |
| `ccp_workplaces_enroll` | workplaces | coach:write | KEEP | agent_coaching_mutate gateway | `app/api/agent/v1/route.ts` | 76 |
| `ccp_workplaces_unenroll` | workplaces | coach:write | KEEP | workplacesUnenroll | `app/api/agent/v1/route.ts` | 160 |
| `ccp_workplaces_enrollments` | workplaces | coach:read | KEEP | workplacesEnrollments | `app/api/agent/v1/route.ts` | 54 |
| `ccp_groups_create` | groups | coach:write | GRANULAR-ONLY | agent_coaching_mutate gateway | `app/api/agent/v1/route.ts` | 64 |
| `ccp_groups_update` | groups | coach:write | GRANULAR-ONLY | agent_coaching_mutate gateway | `app/api/agent/v1/route.ts` | 77 |
| `ccp_groups_enroll` | groups | coach:write | KEEP | agent_coaching_mutate gateway | `app/api/agent/v1/route.ts` | 100 |
| `ccp_groups_unenroll` | groups | coach:write | KEEP | agent_coaching_mutate gateway | `app/api/agent/v1/route.ts` | 108 |
| `ccp_schedule_day_preview` | schedule | coach:read | KEEP/COMPOSE | teacherScheduleDayPreview | `app/api/coaching/lesson-capture/day/route.ts` | 262 |
| `ccp_students_resolve` | students | coach:read | KEEP | teacherStudentNamesResolve | `app/api/students/resolve/route.ts` | 238 |
| `ccp_lessons_capture_commit_with_chapter` | lessons | coach:write | KEEP/COMPOSE | teacherAtomicLessonChapterCommit | `app/api/coaching/lesson-capture/commit/route.ts` | 415 |
| `ccp_lessons_capture_preview` | lessons | coach:read | KEEP/COMPOSE | teacherLessonCapturePreview | `app/api/coaching/lesson-capture/preview/route.ts` | 371 |
| `ccp_lessons_capture_completed` | lessons | coach:write | KEEP | teacherCompletedGroupCapture | `app/api/coaching/lesson-capture/completed/route.ts` | 524 |
| `ccp_sessions_ad_hoc_create` | sessions | coach:write | GRANULAR-ONLY | sessionsAdHocCreate | `app/api/agent/v1/route.ts` | 184 |
| `ccp_sessions_details` | sessions | coach:read | KEEP | CoachError, sessionsParticipants | No direct route registry claim | 77 |
| `ccp_sessions_create` | sessions | coach:write | GRANULAR-ONLY | agent_coaching_mutate gateway | `app/api/agent/v1/route.ts` | 145 |
| `ccp_sessions_edit` | sessions | coach:write | GRANULAR-ONLY | sessionsUpdate | `app/api/agent/v1/route.ts`, `app/api/coaching/sessions/[id]/lifecycle/route.ts` | 267 |
| `ccp_sessions_complete` | sessions | coach:write | KEEP | sessionsComplete | `app/api/agent/v1/route.ts` | 285 |
| `ccp_sessions_reschedule` | sessions | coach:write | KEEP | agent_coaching_mutate gateway | No direct route registry claim | 106 |
| `ccp_sessions_roster_preview` | sessions | coach:read | KEEP/COMPOSE | teacherSessionRosterPreview | `app/api/coaching/sessions/[id]/roster/route.ts` | 97 |
| `ccp_sessions_roster_correct` | sessions | coach:write | GRANULAR-ONLY | teacherSessionRosterCorrect | `app/api/coaching/sessions/[id]/roster/route.ts` | 243 |
| `ccp_sessions_roster_revisions_list` | sessions | coach:read | KEEP | teacherSessionRosterAudit | `app/api/coaching/sessions/[id]/roster/route.ts` | 129 |
| `ccp_sessions_cancel` | sessions | coach:write | KEEP | agent_coaching_mutate gateway | No direct route registry claim | 83 |
| `ccp_learning_materials_list` | materials | coach:read | KEEP | teacherMaterialCatalogList | `app/api/training/materials/route.ts` | 154 |
| `ccp_learning_materials_get` | materials | coach:read | KEEP | teacherMaterialCatalogGet | `app/api/training/materials/route.ts` | 118 |
| `ccp_learning_materials_create` | materials | coach:write | GRANULAR-ONLY | teacherMaterialCatalogCreate | `app/api/training/materials/route.ts` | 273 |
| `ccp_learning_materials_update` | materials | coach:write | GRANULAR-ONLY | teacherMaterialCatalogUpdate | `app/api/training/materials/route.ts` | 254 |
| `ccp_learning_material_relations_list` | learning | coach:read | KEEP | teacherMaterialRelationsList | `app/api/training/materials/relations/route.ts` | 127 |
| `ccp_learning_material_relation_change` | learning | coach:write | KEEP | teacherMaterialRelationChange | `app/api/training/materials/relations/route.ts` | 181 |
| `ccp_learning_material_archive_preview` | learning | coach:read | KEEP/COMPOSE | teacherMaterialArchivePreview | `app/api/training/materials/lifecycle/route.ts` | 116 |
| `ccp_learning_material_lifecycle_change` | learning | coach:write | GRANULAR-ONLY | teacherMaterialLifecycleChange | `app/api/training/materials/lifecycle/route.ts` | 200 |
| `ccp_training_assignments_list` | training | coach:read | KEEP | teacherAssignmentsList | `app/api/training/assignments/route.ts` | 153 |
| `ccp_training_assignments_create` | training | coach:write | GRANULAR-ONLY | teacherAssignmentsCreate | `app/api/training/assignments/route.ts` | 171 |
| `ccp_training_attempt_record` | training | coach:write | GRANULAR-ONLY | teacherAssignmentAttempt | `app/api/training/assignments/route.ts` | 125 |
| `ccp_training_review_record` | training | coach:write | GRANULAR-ONLY | teacherAssignmentReview | `app/api/training/assignments/route.ts` | 126 |
| `ccp_training_plans_list` | training | coach:read | KEEP | teacherTrainingPlansList | `app/api/training/plans/route.ts` | 136 |
| `ccp_training_plans_get` | training | coach:read | KEEP | teacherTrainingPlanGet | `app/api/training/plans/route.ts` | 94 |
| `ccp_training_plans_commit` | training | coach:write | KEEP | teacherTrainingPlanCommit | `app/api/training/plans/route.ts` | 214 |
| `ccp_coach_briefing_get` | coach | coach:read | KEEP/COMPOSE | teacherCoachBriefing | `app/api/coaching/briefing/route.ts` | 250 |

## High-risk overlapping names: deliberate choice

| Similar tool families | Explicit user-goal selection rule |
| --- | --- |
| `ccp_lessons_capture_completed` versus `ccp_sessions_ad_hoc_create`, `ccp_sessions_complete` | First only when creating AND marking a new multi-student lesson completed with every learner's actual attendance; second schedules with UNKNOWN attendance; third completes an already-existing frozen session |
| `ccp_lessons_capture_commit_with_chapter` versus `ccp_materials_lesson_use_commit` | First creates a scheduled multi-student lesson plus verified Lichess chapter **assigned**; second records a known or new typed material actually assigned/taught in an already-completed lesson; neither declares mastery |
| `ccp_learning_materials_create` / `ccp_material_links_create` / `ccp_materials_history_record` versus composed material use | Existing granular names remain for precise edits or uncommon contexts; choose preview→commit composition for material+lesson+evidence as one user request |
| `ccp_students_create` versus `ccp_students_create_full` | First minimal teacher-owned learner; second exact optional family, guardian, birthdate, private notes, archived state in one reviewed transaction |
| `ccp_historical_attendance_dates_preview` versus advanced historical import and student spreadsheets | Verified prior attendance dates are source-neutral historical EVIDENCE; mixed absence/aggregate sources require advanced history importer; roster spreadsheet imports students/families, not lessons |
| `ccp_settings_export_csv` versus website ZIP/JSON backup | CSV is filtered page-by-page read (not a restore); ZIP is browser transport; only JSON is the canonical complete restore format |
| `ccp_coach_briefing_get` versus raw history/report functions | Prefer the existing factual composite for individualized lesson preparation; use granular history for precise corrections and workplace report for deduplicated instructor time |

## Distinctions requiring human review

- A tool namespace is **not** an MCP subgroup and does not automatically defer model-context loading; client-native progressive discovery controls model exposure.
- Do not add a generic executor. Typed high-level operations are additional named tools backed by the same owner-scoped domain services; all granular field-level tools remain callable.
- PR #95 separates source-neutral presence-date evidence, advanced historical import and student/family spreadsheet import. Do not conflate any of these with a scheduled lesson.
- CSV pages are for an explicitly requested data export; never load the complete archive to answer a normal coaching question. CSV is not the restore format.
- Read-only preview must not claim persistence; confirmation and idempotent commit must preserve tenant, timezone, evidence and retry rules.
- Name/description-only metadata checks are not model-completion benchmarks. Run exact real-client acceptance separately when required.
