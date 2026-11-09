# Design: student-first coaching and typed learning materials

**Status: proposed design, not implemented.** Shared teacher-owned PostgreSQL/Supabase domain services, RLS, OAuth scopes, optimistic revisions and idempotent receipts remain mandatory. Before any implementation, reconcile this scope with existing active parity and conversational-lesson OpenSpecs.

## 1. Canonical business concepts

- **Student**: independent teacher-owned subject and permanent UUID, with display/report name, multilingual aliases, optional chess profile and active/archive lifecycle. Not a family or payer.
- **Contact**: optional person with one or more purpose-limited student relationships (self, guardian, emergency, other). A contact can be linked to siblings. A student may have zero contacts.
- **Payer**: separate optional billing responsibility; payment does not confer access to lessons or student notes.
- **Workplace / group / session**: a workplace contextualizes a school/club/private practice; a group is a *current* roster; a session is an actual occurrence with a frozen participant list and one teacher duration.
- **Material**: a reusable content object; **assignment**: a per-student request to work on material; **attempt**: submission/effort evidence; **review**: instructor feedback; **assessment**: independently authorized judgment. Never conflate them.

## 2. Student contacts and navigation

Logical schema:
- Preserve `students` and stable student IDs; no mandatory birthdate, guardian or family link. Existing `name_aliases`/strength/handles remain where appropriate; alias resolution must be conservative for Hebrew/English duplicates.
- `contacts`: id, teacher_id, name, optional direct channels, verification and privacy metadata.
- `student_contacts`: student_id, contact_id, teacher_id, role (`self`, `guardian`, `emergency`, `other`), granular permissions (communication, schedule access, portal access), consent/revocation status; tenant-safe composite references.
- Optional `billing_responsibilities` references authorized student/contact/workplace payer without granting teaching access.
- Retire the CogNote "family of one" path in clean pre-1.0 schema, while preserving required guardian access for minors. Do not infer legal adult/minor status from an absent birthdate. No token or privileged contact info in ordinary student-search MCP responses.

Teacher nav: Today, Students, Lessons, Training & Materials, Calendar, Reports. Workplaces/Groups stay contextual and easy to find; Contacts & Guardians, Business/Billing and Settings stay available as needed. Today displays upcoming lessons, unrecorded lesson hints only when verifiable, pending reviews and next lesson follow-up. Remove family terminology from adult-first onboarding. Preserve security/consent and explicit portal grants.

## 3. One authoritative lesson history

Use `teaching_sessions` + `session_participants` + `session_attendance` as the canonical teacher occurrence and historical roster. Scheduling recurrence is separate. Reconcile or remove independent historical `lessons` and `lesson_slots` writes under ADR-0001 so no double counts; one derived reporting projection across UI and MCP. Never multiply teacher duration by participant count. Session links to material coverage and per-student observations remain independent.

Support group/private/ad-hoc session membership without manufacturing a group/enrollment; confirmed local time with IANA zone/DST; status transitions; clear per-student attendance vs optional unmarked; immutable roster snapshots and audited corrections. Preview identity, date, optional slot match, workplace, duration, material candidates and unknown fields before one atomic, idempotent commit. If alias or schedule cannot be uniquely resolved, return NEEDS_RESOLUTION and make no write. Reuse existing conversational lesson design to avoid two command families.

Archiving must inspect future *group participant* commitments as well as direct sessions, retain full history and perform transaction-safe active-student capacity checks on reactivation.

## 4. Materials data model: common root, specialized payloads

### Selected model

`learning_materials` is the canonical teacher-owned identity used by lessons, assignments, collections, search and reports. Columns: material UUID, teacher_id, `kind` (`game`, `puzzle`, `drill`, `study_chapter`, `external_link`), title, optional description, source/provider and allowlisted URL, source object ID, provenance/verification status, timestamps and revision.

One material kind has a required and validated typed detail row (where applicable), with `material_id` as a PK/FK to the root:
- `chess_games`: PGN (bounded, parsed/validated), players, result, event, date/UTC if known, time control, opening/ECO if known, optional nonstandard start FEN, annotation source. A student having *played* the game requires an explicit `student_game_links` relationship and player role; merely linking it to a lesson does not assert they played it.
- `chess_puzzles`: validated start FEN, side to move, optional validated solution PGN/move line, themes, difficulty/source. A link-only puzzle may have unknown solution and be clearly marked as such. Image-derived FEN with unknown castling/en-passant must be reviewed; no guessed board state.
- `chess_drills`: training instructions/objective, exercise mode, repetitions/time target if specified, and optional ordered `drill_items` referencing puzzles, games or positions. A drill is repeatable practice, **not** a game and not automatically a solved puzzle.
- `chess_study_chapters`: provider name, canonical study/chapter IDs and URL, chapter title/ordinal if actually known, retrieved/revision timestamp and content-available flag. Lichess URL alone does not prove exact chapter contents.
- `external_link`: metadata in root; optional types (book section/video/document) can be added later after concrete need.

Require kind/payload consistency, one root identity and tenant-safe FKs in a database transaction; do not put type-specific data into one giant nullable table or arbitrary JSON. Scope input sizes, URL schemes and external origins. Deduplicate verified provider IDs or explicit content hashes cautiously; never merge same-titled distinct games/puzzles.

### Material relationships and reuse

`material_collections`/`material_collection_items` group resources. `material_relationships` connect teacher-owned IDs with explicit types such as extracted_from, part_of, derived_from, prerequisite; guard self-links and problematic cycles. Example: an instructional *game* is one material; a *puzzle* extracted from a position in it is a second material linked by extracted_from; a *drill* using that puzzle is a third material with ordered drill item(s); the Lichess *study chapter* mentioning it is a fourth record.

Existing `chess_learning_resources` (source URLs) and `chess_material_progress` (assigned/taught/completed history) are current, real concepts. Refactor to one canonical material identity and source-aware history without parallel writes and without reinterpreting an existing link as "taught". Preserve historical records and their source/provenance. Pre-1.0 fresh-only baseline changes are allowed; do not silently wipe a possibly real installation.

**Rejected designs:** reuse `chess_games` for every type (semantically false); one universal table with hundreds of nullable fields (weak integrity); unrelated type tables without a common registry (assignments and search become polymorphic/unreliable). Root + typed payload offers a single FK/search interface with correct chess semantics.

## 5. Training plans and homework

Logical model (final exact SQL deferred to implementation review):
- `training_plans`: student/teacher, title, dates/status, teacher-approved scope.
- `training_goals`: plan/student, skill/focus, success criteria, priority, optional target date and review state.
- `training_assignments`: student, material UUID, optional plan/session/group-batch origin, instructions, due date optional, assigned-by/source, status, revision, created_at.
- `assignment_attempts`: assignment, source/actor, timestamp, outcome/evidence/link and optional time spent. In initial scope teacher may record this manually; a student portal is NOT required.
- `assignment_reviews`: teacher/attempt or assignment, time, feedback and review status. Coach-reviewed work is **not automatically mastered**; a verified skill assessment is separately authored/approved.

A group assignment fans out to one student-specific assignment per assignee; this does not create a group lesson or duplicate teacher time. Status transitions are explicit and auditable (assigned → in_progress → submitted/completed → reviewed; cancelled separately). Correction requires revision or append-only corrective event. Distinguish linked, taught, assigned, attempted, completed, reviewed and mastered/assessed in reporting. Never infer student comprehension from a checked box, URL visit or AI summary.

## 6. Briefing and teacher/agent interface

A deterministic `coach_briefing_get` service returns teacher-scoped recent sessions and attendance; exact material coverage by stage; pending and reviewed assignments; goals; teacher-verified observations/assessments; time/provider/source of any verified rating and explicit "unknown" gaps. Include source record IDs, dates and a bounded history window; do not disclose guardian/contact secrets. Both website Today/student/next lesson views and MCP call the same service.

Representative MCP tool families (naming may be refined):
- Contacts/student relationships: list/get/upsert/link/unlink with role-scoped approval.
- Lesson capture/history: resolve, preview/commit, correct, list/get; reuse existing OpenSpec tool naming.
- Materials: list/search/get, typed create/update, links/relations/collection management, scoped material history.
- Plans, goals, assignments, attempts, reviews: full read/write/correct, bulk assignment preview/commit, export.
- `ccp_v1_coach_briefing_get`.
All ordinary editable fields must have web and /mcp parity via shared server validation, typed schemas, OAuth scopes, tenant checks and safe retries. Portal invitation/payment-card/auth credential handling uses narrow secure browser handoffs; no arbitrary SQL/unguarded mass export. No separate MCP server for reports.

Optional AI summarization may rephrase linked facts but not invent grades, weaknesses or material completion. If provider/AI connection is unavailable, core local data, links and deterministic briefings remain usable.

## 7. Privacy, reliability, evidence and rollout

Every parent/subtype/relationship, assignment and review enforces teacher-scoped RLS and ownership FKs; negative tests must include foreign teacher UUIDs, revoked/read-only credentials, private-contact leakage and student portal scope. Validate and bound PGN/FEN, instructor text and HTTPS links; reject SSRF/untrusted external hosts. Optimistic revisions, explicit confirmations and idempotent receipts for multi-record writes; retries cannot double-create lessons or homework. Avoid silent future-session cancellation during archiving and unsafe concurrent reactivation quota races.

Implementation uses one canonical fresh-install schema under ADR-0001, with no permanent CogNote compatibility adapters. **Never silently reset/delete real records.** Require operator inventory, backup/export and explicit approval if any installed instance might contain actual data. Development uses fresh synthetic databases in GitHub CI; all new website operations add MCP and browser↔MCP integration tests in the same PR. Existing 93-case release gate stays binding, and added scenarios must be tracked alongside it. Provider live-client testing is not a prerequisite to development acceptance.

## Open implementation choices

The exact subtype constraints/triggers, study chapter vs provider-specific ref, drill item representation and optional portal access details should be settled in implementation review and verified in schema tests. These choices cannot weaken typed data integrity, provenance, permissioning or teacher-first UX.
