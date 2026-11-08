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

## Composite behavior: one sentence, not dozens of user commands

For “Today I taught Armond, Shushana and David Zaruk 13:00–14:30, Classic Games 2 chapter 32,” an agent should orchestrate `teacher_context_get`, `students_resolve`, `schedule_day_preview`, `materials_chapters_search`, `lessons_capture_preview`, teacher review, then **one** `lessons_capture_commit`. The server owns authoritative IDs, one 90-minute instructor interval and database atomicity. Client-generated timestamps/UUIDs are never treated as ownership authority.

For image puzzles, a vision-enabled client first suggests structured FEN; `chess_fen_validate` and `puzzles_position_preview` require missing-state confirmation, and only `puzzles_position_publish` does a remote Lichess mutation. Clients that do not transmit image data may use an editable board/FEN from the website.
