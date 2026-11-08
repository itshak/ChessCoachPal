# Implementation checklist — conversational workflows and chess student profiles

**All unchecked: proposal only.** Development acceptance requires reviewed PRs, merged main SHA and green synthetic GitHub Actions; never interpret this task list as implemented.

## A. Student identity and chess progress
- [ ] A1: Add tenant-keyed `student_aliases`, optional short-display alias, normalized Unicode/RTL match logic, ambiguity/duplicate safeguards, report-name stability and safe pagination.
- [ ] A2: Add `student_chess_profiles` strength 1–10 (nullable, teacher-origin only), append-only strength assessments, goals/focus; reconcile existing `skill_assessments` (1–5) and `chess_observations` as separate histories, not duplicate sources of truth.
- [ ] A3: Add Lichess and Chess.com account references (student-only public usernames, claim status, privacy) and provider/time-control rating snapshots with source/provisional/last fetch; controlled read-only API sync with mocks, throttling and explicit opt-in.
- [ ] A4: Update website student add/profile/list editor, Hebrew RTL report name, editable English short name/aliases, strengths, source-tagged ratings and graph, skills, goals and independent teacher-verified reviews.
- [ ] A5: Add MCP `students_list/get/resolve/aliases_update/profile_update`, `student_strength_assessments_*`, `student_chess_accounts_*`, `student_ratings_*`, `student_progress_summary`; test teacher consent and cross-teacher ID rejection.

## B. Timetable and multi-person lesson
- [ ] B1: Reconcile existing `lesson_slots/lessons` and `teaching_sessions/session_participants/session_attendance` into one canonical teaching-history projection, ensuring one 90-minute teacher session for three concurrent students and correct reports/payments.
- [ ] B2: Add ad-hoc frozen roster mode, teacher/student/workplace slot ownership, IANA timezone and effective-date/DST handling; no silent group or workplace enrollment.
- [ ] B3: Implement MCP `teacher_context_get`, `schedule_slots_list/upsert/disable`, `schedule_day_preview`, `lessons_capture_preview/commit`, `lessons_history_list/get/correct`; preview never writes, commit one idempotent/atomic local transaction after human confirmation.
- [ ] B4: Create website lesson preview/edit/correction and history parity; refuse ambiguous student alias, conflicting slots/workplaces, unapproved attendance or guessed skill grades.

## C. Study materials and provider permissions
- [ ] C1: Implement encrypted teacher Lichess OAuth PKCE `study:read` and separately approved `study:write` or PAT mode, website connect/status/revoke, strict server token custody and rate limits.
- [ ] C2: Add tenant-scoped study/chapter metadata index (PGN tags + provider IDs + ordinal), selected/default lesson/puzzle studies at teacher/workplace/student scopes and accessible nondefault explicit study overrides.
- [ ] C3: Implement `materials_connection_status`, `materials_studies_list/search/sync`, `materials_chapters_search/get`, `materials_preferences_list/update`, `materials_history_list/link_preview/link_commit`.
- [ ] C4: Tests for “Classic Games 2 / game 32 / Steinitz–Chigorin” exact identity, ambiguity, private study denial, unknown chapter and stale/offline link status.

## D. Puzzle position and remote study writes
- [ ] D1: Integrate tested chess FEN parser/legality checker, PGN SetUp/FEN serializer and a website editable board review; no client-agnostic image-attachment promise.
- [ ] D2: Implement `chess_fen_validate`, `puzzles_position_preview/publish`, `puzzles_study_series_list`; insist on teacher confirmation of board and uncertain FEN state.
- [ ] D3: Enforce 64-chapter study count (including starter), new/private Puzzles series and unique Puzzles N allocation, 30/day provider limit and write permission.
- [ ] D4: Persist/reconcile external-write intents across provider timeout/429, idempotent repeats, concurrent near-full uploads, and no deletion of unrelated chapters.

## E. MCP-first parity across every teacher website business function (MANDATORY)
- [ ] E1: Maintain audited registry of **all** app/api teacher-facing routes, 17 teacher pages and 49 teacher components, plus complete per-action/field [93-case checklist](../../../docs/MCP_WEBSITE_PARITY_CHECKLIST.md). Any new webpage/business field MUST add an MCP equivalent or explicit reviewed secure browser exception in the **same feature PR**.
- [ ] E2: Implement safe discovery `ccp_v1_capabilities_list` / `ccp_v1_fields_describe` and central allowlisted field registry, shared between website and MCP. Verify nullable clear, types, aliases, source/permissions and versioned schemas.
- [ ] E3: Implement `ccp_v1_records_patch_preview/commit` for ordinary single teacher-owned fields with protected revision, digest, idempotency and audit; cover student name/level/profile, workplace name/timezone/policy, and prevent all raw SQL, arbitrary JSON/secret paths and cross-tenant writes.
- [ ] E4: Implement missing CRUD / protected actions for student notes/archive/rates/guardians, workplace unenroll, groups, recurring slots/legacy lessons, bulk attendance, notes, learning categories/edit/approval, skill assessments, events, studio settings, data import and notifications, using verified domain services.
- [ ] E5: Implement truthful `ccp_v1_materials_history_list` student/workplace/group/session date filters, `ccp_v1_materials_history_summary` and `ccp_v1_materials_coverage_matrix`. Prove lesson workplace is historical and three students/one chapter/one group lesson count as **one** workplace lesson and **three** individual coverages.
- [ ] E6: Extract website `/api/coaching/report` calculations into shared tenant-scoped service, expose `ccp_v1_reports_workplace_summary`, `ccp_v1_reports_student_progress`, `ccp_v1_reports_material_coverage`, `ccp_v1_reports_export_prepare/create` through **the same /mcp**; compare website/MCP output for range, IANA timezone/DST, attendance, cancellations, instructor time, CSV formula injection and Hebrew RTL.
- [ ] E7: Implement narrow scopes and chat-initiated secure approval for financial credit/invoice/payment actions, family sensitive data, account/credential security, exports/deletes, external emails/notifications and payment links. Protect guardian identity and prevent chat access to passwords/tokens.
- [ ] E8: Add authenticated website↔MCP behavioral parity integration tests for **all checklist scenarios**, teacher A/B isolation, read-only scopes, revocation, expectedUpdatedAt, exact idempotent retries, provider outage, report correctness, negative controls; status entries may move from gap/partial to complete only with test IDs.
- [ ] E9: Enforce normal CI `npm run mcp:parity:audit` and mandatory **release blocker** `npm run mcp:parity:strict`. A green inventory check does not mean parity; no version/tag or archived-success claim until strict and all 93 scenario tests pass.

## F. Acceptance, documentation and release boundary
- [ ] F1: Build exact MCP/OpenAPI schemas with correct readOnly/destructive/openWorld annotations, no credentials/bulk SQL; all new tables RLS and composite teacher FKs.
- [ ] F2: Unit and E2E user story A: canonical Hebrew report name and English alias attendance, three students, 13:00–14:30, real resolved study chapter 32, no fabricated comprehension, one teaching interval, no duplicate retry.
- [ ] F3: E2E missing-hours fallback (one uniquely matching weekly occurrence), cross-workplace/timezone/DST ambiguity and teacher-isolation/regression on the two preexisting lesson models.
- [ ] F4: E2E ratings (Lichess rapid vs blitz vs Chess.com rapid), stale/public API errors, missing/provisional rating, manual vs provider sources and 1–10 skill history untouched.
- [ ] F5: E2E user story B: image-assisted candidate vs manual FEN, board validation, confirmation, study missing/full, 64 capacity, Puzzles 2 rollover, quota, timeout recovery, two-teacher denial.
- [ ] F6: Run fresh CI/typecheck/Playwright/Supabase RLS, Compose and DB/file backup-restore green **on merged main**; cite SHA/runs; update applied specs/AI_CONNECTORS with implemented tools and archive only after full acceptance.

**Unchanged:** `complete-v0-1-0-release-gates` remains open; no v0.1.0 tag, v1.0.0 promise or official public ChatGPT plugin is authorized by this change.
