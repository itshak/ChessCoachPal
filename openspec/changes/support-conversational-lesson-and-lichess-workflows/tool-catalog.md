# MCP command inventory and proposed extensions

**Status:** 28 current concrete tools are implemented; every line tagged **PROPOSED** is a design task and is NOT available via `tools/list` today. Names are intentionally `ccp_v1_*` so the agent can discover teacher workflows. Every tool uses tenant-scoped teacher OAuth, exact IDs, versioned schemas, cursor-limited reads and structured errors.

## Already implemented in live MCP (28)

| Domain | Read | Write |
| --- | --- | --- |
| Workplaces | `ccp_v1_workplaces_list`, `ccp_v1_workplaces_enrollments` | `ccp_v1_workplaces_create`, `ccp_v1_workplaces_update`, `ccp_v1_workplaces_enroll` |
| Students | `ccp_v1_students_search` (nonempty query required) | `ccp_v1_students_create`, `ccp_v1_students_update` |
| Groups | `ccp_v1_groups_list`, `ccp_v1_groups_members` | `ccp_v1_groups_create`, `ccp_v1_groups_update`, `ccp_v1_groups_enroll`, `ccp_v1_groups_unenroll` |
| Sessions | `ccp_v1_sessions_list`, `ccp_v1_sessions_details`, `ccp_v1_sessions_participants` | `ccp_v1_sessions_create` (one student or registered group), `ccp_v1_sessions_reschedule`, `ccp_v1_sessions_cancel`, `ccp_v1_sessions_note_update` |
| Attendance | `ccp_v1_attendance_preview` | `ccp_v1_attendance_record` (one roster student) |
| Learning | `ccp_v1_chess_categories_list`, `ccp_v1_chess_observations_list`, `ccp_v1_chess_resources_list` | `ccp_v1_chess_observations_propose`, `ccp_v1_chess_resources_link` (reference only) |

None of these existing commands connects to Lichess API, supports generic all-students listing, or writes ratings and study chapters.

## PROPOSED student identity and progress

| Proposed exact tool | Scope | Purpose/constraints |
| --- | --- | --- |
| `ccp_v1_students_list` | read | Cursor-paginated active/all-roster listing, no mandatory search query; no guardian contacts. |
| `ccp_v1_students_get` | read | One UUID; canonical Hebrew name, safe short alias, strength/selected ratings, revision, workplace IDs. |
| `ccp_v1_students_resolve` | read | Resolve multiple provided English/Hebrew aliases/names to teacher UUIDs; return `NEEDS_RESOLUTION` for ambiguous names. |
| `ccp_v1_students_aliases_list` | read | Teacher-owned normalized aliases and their types. |
| `ccp_v1_students_aliases_update` | write | Preview/confirmed addition or removal of exact aliases; revision/idempotency; never overwrite report name. |
| `ccp_v1_students_chess_profile_get` | read | Overall strength 1–10, last teacher assessment, stated goals, skill dimensions; unknown when absent. |
| `ccp_v1_students_chess_profile_update` | write | Teacher-confirmed goals/focus and strength changes, with append-only strength history. Unverified model proposals stay pending. |
| `ccp_v1_students_strength_history` | read | Dated strength assessment trend, source and assessment author. |
| `ccp_v1_students_chess_accounts_list` | read | Provider and sanitized usernames/profile URLs, verification and sync status. |
| `ccp_v1_students_chess_accounts_upsert` | write | Teacher-confirmed Lichess/Chess.com username; verify public profile/ownership limitations; no student passwords. |
| `ccp_v1_students_ratings_get` | read | Latest per provider/time-control, provisional, observed/fetched timestamps and source. |
| `ccp_v1_students_ratings_history` | read | Paginated rating snapshots, no platform conflation. |
| `ccp_v1_students_ratings_refresh` | write | Explicit bounded provider API fetch and snapshot insert; public read-only provider access, rate limited, opt-in for minors. |
| `ccp_v1_students_progress_summary` | read | Lessons/attendance/materials/skill observations + teacher strength/rating trends; fact and unknown separation. |

## PROPOSED weekly scheduling and lesson capture

| Proposed exact tool | Scope | Purpose/constraints |
| --- | --- | --- |
| `ccp_v1_teacher_context_get` | read | Server-local teacher date, configured IANA timezone/locale and allowed workplaces. |
| `ccp_v1_schedule_slots_list` | read | Weekly slots/recurrence, workplace, named students, exceptions/effective dates. |
| `ccp_v1_schedule_slots_upsert` | write | Confirmed single recurring slot, timezone/revision/idempotency and conflict checks. |
| `ccp_v1_schedule_slots_disable` | write | Confirmed deactivation without changing historical lessons. |
| `ccp_v1_schedule_day_preview` | read | Actual occurrences for one local day, which slot supplies omitted hours, DST and conflict candidates. |
| `ccp_v1_lessons_capture_preview` | read | Resolve teacher, 1–100 student names/aliases, date/time, group/ad hoc roster, material candidates, attendance and missing data; no writes. |
| `ccp_v1_lessons_capture_commit` | write | Preview ID/digest + `confirmed:true` + idempotency; one transaction for session/roster/attendance/materials. |
| `ccp_v1_lessons_history_list` | read | Date/teacher/student/workplace filtered canonical lesson history and pagination. |
| `ccp_v1_lessons_history_get` | read | Frozen roster, per-student attendance/learning and material references. |
| `ccp_v1_lessons_history_correct` | write | Teacher-confirmed revision-safe correction; never silently rewrite archived roster or verified assessments. |

## PROPOSED Lichess material management and puzzles

| Proposed exact tool | Scope | Purpose/constraints |
| --- | --- | --- |
| `ccp_v1_materials_connection_status` | read | Connected Lichess account/scope/status only. **Never** return a token. |
| `ccp_v1_materials_studies_list` | read | Paginated cached authorized studies and selected status. |
| `ccp_v1_materials_studies_search` | read | Study titles/URLs/owner; supports explicit nondefault study. |
| `ccp_v1_materials_studies_sync` | write | Rate-limited explicit refresh of server-side Lichess metadata; no generic scraping. |
| `ccp_v1_materials_chapters_search` | read | Exact chapter title/ordinal/PGN White/Black/Event/Date, source revision and provider IDs. |
| `ccp_v1_materials_chapters_get` | read | One authorized chapter ID/URL and permitted metadata, bounded PGN summary. |
| `ccp_v1_materials_preferences_list` | read | Effective teacher/workplace/student default lesson/puzzle studies with precedence. |
| `ccp_v1_materials_preferences_update` | write | Teacher-confirmed association/change; doesn't expose private study contents. |
| `ccp_v1_materials_history_list` | read | Per-session/student exact study/chapter links, source/verification. |
| `ccp_v1_materials_link_preview` | read | Proposed attachment, out-of-default source, many student IDs, permission/ambiguity. |
| `ccp_v1_materials_link_commit` | write | Confirmed deduplicated local session/student material associations. |
| `ccp_v1_chess_fen_validate` | read | Validate six FEN fields/legality and enumerate missing context. |
| `ccp_v1_puzzles_study_series_list` | read | Configured puzzles destination, current chapter count and numbered successors. |
| `ccp_v1_puzzles_position_preview` | read | No provider write; review exact board/FEN/PGN and target/rollover/quota. |
| `ccp_v1_puzzles_position_publish` | write | Confirmed provider write with Lichess `study:write`, idempotent remote intent and reconciliation. |

**Do not make website Lichess password/PAT/OAuth consent into a chat tool.** "write" for metadata sync or rating refresh means persisted local metadata and external read; it still needs user authorization and sensible annotation. For every proposed tool, implement schema bounds, `coach:read` or `coach:write`, correct read-only/destructive/open-world hints, rate budgets, typed errors and generated OpenAPI parity.

## PROPOSED complete teacher workspace, field editing and reporting

**None of the tools below are available yet.** All belong in the existing `/mcp` endpoint (no extra reporting connector). Ordinary record fields must be editable using typed domain commands or a **field-allowlisted** and revision-checked patch preview/commit, not raw SQL.

| New MCP tool (planned) | Intent / security |
| --- | --- |
| `ccp_v1_capabilities_list`, `ccp_v1_fields_describe` | Discover all authorized entities, business fields, read/write support, validation, sensitive approvals and exclusions. |
| `ccp_v1_records_patch_preview`, `ccp_v1_records_patch_commit` | Review and atomically patch **one** allowed teacher-owned entity with exact field names, revision/digest/UUID idempotency; null-clear and sensitive field rules. |
| `ccp_v1_workplaces_get`, `ccp_v1_workplaces_unenroll` | Workplace full safe details and reversible membership changes (no history rewrite). |
| `ccp_v1_students_notes_list`, `ccp_v1_students_notes_update`, `ccp_v1_students_archive_preview`, `ccp_v1_students_archive_commit` | Existing website-only student notes/private fields, archive impact with appropriate PII/admin scopes. |
| `ccp_v1_skills_dimensions_list`, `ccp_v1_skills_dimensions_upsert`, `ccp_v1_skills_assessments_list`, `ccp_v1_skills_assessments_record`, `ccp_v1_skills_assessments_correct` | Teacher-defined 1–5 chess skill axes and provenance-aware dated scores, separate from overall 1–10 strength. |
| `ccp_v1_chess_observations_edit_preview`, `ccp_v1_chess_observations_edit_commit` | Revision-safe correction; teacher approval remains an explicit human action. |
| `ccp_v1_materials_history_summary`, `ccp_v1_materials_coverage_matrix` | Material history per student, workplace, group, session and range; distinct taught/assigned/completed and no double counting. |
| `ccp_v1_materials_assignments_list`, `ccp_v1_materials_assignments_upsert` | Manage selected study chapter assignments and teacher-confirmed progress without inferring understanding. |
| **`ccp_v1_reports_workplace_summary`** | **Reuses deterministic existing website report** by workplace/date range: sessions, cancellations, teacher minutes counted once, participant attendance by status. |
| **`ccp_v1_reports_student_progress`**, **`ccp_v1_reports_material_coverage`** | Student/skills/attendance and verified study/chapter coverage reports with source/unknown markers. |
| **`ccp_v1_reports_export_prepare`**, **`ccp_v1_reports_export_create`** | Preview and export CSV/text (and supported PDF where implemented) with protected personal data, signed expiring download and CSV formula injection defense. |
| `ccp_v1_families_list`, `ccp_v1_families_get`, `ccp_v1_families_update` | Guardian/child relationship management under `student:sensitive`; never default MCP roster output. |
| `ccp_v1_events_list`, `ccp_v1_events_upsert`, `ccp_v1_events_cancel` | Teacher calendar, event management/RSVP information; inviting others separately approved. |
| `ccp_v1_billing_summary`, `ccp_v1_billing_invoices_list`, `ccp_v1_billing_invoice_preview`, `ccp_v1_billing_invoice_commit` | Invoices, credits, mark-paid/void/reconciliation via finance scope and human approval; no processor credentials. |
| `ccp_v1_communications_preview`, `ccp_v1_communications_send` | Exact recipient/content preview for teacher-approved notification, no unreviewed bulk sends. |
| `ccp_v1_data_import_preview`, `ccp_v1_data_import_commit`, `ccp_v1_data_export_request` | Safe teacher import/export with mapping, PII checks, bounded output and idempotent commits. |
| `ccp_v1_approval_request`, `ccp_v1_approval_status` | Safe chat-initiated website approval for credential/payment/destructive operations; never expose passwords or access tokens. |

Extend proposed `ccp_v1_materials_history_list` to filter by **studentId or workplaceId or groupId or sessionId** (and dates), not just one student. The report/coverage tools must preserve the historical lesson's workplace and dedupe chapter count per lesson.

**Mandatory implementation rule:** New website teacher-business features may not be merged as feature-complete without their equivalent MCP operations/tests, or a documented justified secure approval exception. [Audit checklist](../../../docs/MCP_WEBSITE_PARITY_CHECKLIST.md) and [source inventory](../../../scripts/mcp-website-parity.json) are release gates. Currently existing tools `ccp_v1_workplaces_update` and `ccp_v1_students_update` do support workplace name and basic student name/level updates; they do NOT support all website fields.

## Composite behavior: one sentence, not dozens of user commands

For “Today I taught Armond, Shushana and David Zaruk 13:00–14:30, Classic Games 2 chapter 32,” an agent should orchestrate `teacher_context_get`, `students_resolve`, `schedule_day_preview`, `materials_chapters_search`, `lessons_capture_preview`, teacher review, then **one** `lessons_capture_commit`. The server owns authoritative IDs, one 90-minute instructor interval and database atomicity. Client-generated timestamps/UUIDs are never treated as ownership authority.

For image puzzles, a vision-enabled client first suggests structured FEN; `chess_fen_validate` and `puzzles_position_preview` require missing-state confirmation, and only `puzzles_position_publish` does a remote Lichess mutation. Clients that do not transmit image data may use an editable board/FEN from the website.
