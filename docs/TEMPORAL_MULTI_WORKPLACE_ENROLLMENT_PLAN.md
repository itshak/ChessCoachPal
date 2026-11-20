# OpenSpec planning note: temporal multi-workplace enrollment (proposal only)

Status: **design proposal; no schema migration applied**. Supersedes the two-table history recommendation in `docs/AGENT_SAFE_ENROLLMENT_REACTIVATION_DESIGN.md` once accepted.

## Decision
Keep **one canonical** `workplace_enrollments` relation. One row represents one uninterrupted membership of a student at one workplace. Multiple workplaces are independent and can overlap. Ended rows are never deleted; returning creates a new row. Derive status from date interval rather than storing redundant status.

Proposed columns: existing `id,teacher_id,student_id,workplace_id,created_at`, plus `starts_on date`, `ends_on date nullable`, `updated_at timestamptz`, optional `end_reason` and `source`. Use **half-open intervals** internally `[starts_on, ends_before)` if precise non-overlap/exclusion constraints are implemented; if using user-facing inclusive `ends_on`, convert consistently at API boundary. Never mix interpretations. The current document's preferred external contract is inclusive `ends_on`, with internal PostgreSQL daterange(start, ends_on + 1, '[)') and NULL unbounded.

For legacy current enrollments with unknown start date, do not invent a historical start. Migrate them to an explicit `start_date_unknown` representation or nullable `starts_on` with `legacy_unknown_start` flag and narrow constraint; new enrollments must have a concrete start date. A legacy unknown-start active membership is treated as current until ended, and conflicts with a new same-workplace period unless explicitly closed. Historical attendance is not proof of current enrollment.

## Invariants
- Owner-scoped FK checks and RLS; all writes through transactional services/RPC, not client-side assumptions.
- Exclusion constraint (GiST with btree_gist) prevents overlapping periods for same `teacher_id,student_id,workplace_id`; separate workplaces may overlap.
- `ends_on >= starts_on` for known dates; prohibit a new period with unknown start; allow future starts.
- `current` = starts_on <= today and (ends_on IS NULL OR ends_on >= today); `future` = starts_on > today; `previous` = ends_on < today. Timezone uses teacher's configured local calendar day, not database UTC implicitly.
- Historical rows are preserved; no hard delete from MCP/website. Corrections use explicit authorized edit with revision, audit and confirmation.
- Archived student cannot have a current or future membership after archive commit. Archive preview must propose how to close/cancel each membership; commit atomically applies explicitly confirmed dispositions and archive. No silent truncation or loss of future dates.
- Student reactivation does not implicitly restore memberships. Preview last-ended membership **per workplace** (not just the globally last row), plus any future scheduled periods. Present selectable suggestions. If no verified membership, require explicit workplace choice. Confirm start dates and selection; atomically reactivate + insert selected periods.
- Existing contact, billing, group, lesson, portal and attendance records are unaffected unless separately requested.

## MCP and UI contract
Shared commands `enrollments_list`, `enrollment_preview`, `enrollment_commit`, `student_reactivation_preview`, `student_reactivation_commit`, `student_archive_preview`, `student_archive_commit` (names subject to parity audit). Stable UUIDs, tenant ownership, idempotency key, expected revision, preview digest, explicit confirmation. Fail-closed structured `CLARIFICATION_REQUIRED` with `missingFields`, workplace choices, candidate periods, and retry instructions; no inference from historic attendance alone. Existing `ccp_workplaces_enroll`/`unenroll` and bulk lifecycle routes must be migrated to the same domain service or explicitly deprecated before v1.

## Implementation phases
1. ADR/OpenSpec change and schema inventory, find all reads/writes of `workplace_enrollments` and archival/lesson/group dependencies. Freeze candidate amendment and update checksum manifest.
2. Migration on disposable DB: add temporal fields and safe constraints, preserve current rows and distinguish unknown dates. Add tenant/RLS and exclusion indexes, update RPCs.
3. Shared domain service for interval create/close, archive/reactivation atomic previews and commits; preserve exact revision/idempotency semantics.
4. MCP and web UI parity: display current, future and previous periods, multi-select reactivation suggestions, explicit date selection, clear status/error contracts.
5. Unit, SQL, tenant/RLS, concurrency, replay, DST/local-date, E2E and CI tests. Test same-workplace overlap blocked, different-workplace overlap allowed, return after break, archived with future membership, legacy unknown-start, no-history, duplicate names.
6. Verified off-host backup and restore rehearsal, row-level cutover inventory, operator approval. Do not auto-repair live student memberships from attendance evidence.

## Verified reason for proposal
Coolify live-private-beta DB on aiserver has 28 students, 0 workplace enrollments, and 167 historical Yatmal attendance evidence records across 27 students. The existing baseline bulk lifecycle RPC blocks archiving students who have active enrollments, while current enrollment links do not retain ended membership history. No live data changes made.
