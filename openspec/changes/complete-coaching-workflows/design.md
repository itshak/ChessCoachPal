# Design — complete coaching workflows

## Source of truth and boundaries

PostgreSQL/Supabase is authoritative; the web application and AI endpoint must call the same narrow teacher-scoped domain commands. Use the existing `lib/server/coach-service.ts` and `/api/agent/v1` work in PR #1 as a starting point, not a frozen contract. Keep server-side Supabase user identity and RLS. Never authorize by accepting a caller-supplied `teacher_id`.

## Minimal canonical model

- `students`: one canonical teacher-owned identity (not copied per workplace).
- `workplaces`: teacher-owned configured name, IANA timezone, locale, currency and basic policy data; a default workplace may be provisioned for *new* teachers.
- `workplace_enrollments`: student/workplace relation with start/end dates or an equivalent explicit scoped association.
- `class_groups` and `group_enrollments`: workplace-bound group plus participant membership. Membership may change over time.
- `teaching_sessions`: instructor, workplace, group *or* single student, UTC start, duration, status, general topic and note. Group session duration is stored **once**, not multiplied per student.
- `session_participants`: frozen expected roster at session creation; later group membership changes do not silently rewrite historical attendance.
- `session_attendance`: one entry per participant with status, student-specific note, and edit metadata.

The above names reflect the initial PR where they already exist; schema specifics may change in a pre-1.0 fresh-install refactor. Do not create incremental SQL upgrade migrations for earlier pre-1.0 checkouts.

## Commands and UI

Expose typed list/search/create/update where appropriate for students, workplaces, groups, sessions, attendance and notes. Request IDs make repeated session creation idempotent; attendee records must reject non-participants. The session editor distinguishes **one shared session note** from **individual student comments**. A group meeting must remain even when one student is absent. The UI supports workplace filtering, group roster, calendar or chronological session list, correction controls and useful field-level errors.

Dates are stored as UTC instants, displayed with the workplace IANA timezone; select an explicit behavior for nonexistent/ambiguous DST times and test it. Validate all IDs in their workplace/teacher scope, including group enrollment.

## Test and evidence strategy

- Integration tests on a **new** local Supabase schema, synthetic teacher A/B, with RLS proving cross-owner rejection.
- Browser flow runs on production Next build and seeded DB; use accessible labels, verify actual rendered controls, fix the Workplace selector timeout in PR #1 (run 42392868328).
- Test private session and group session persistence/reload, absence and notes, multiple workplaces, replayed create request, roster snapshots and teaching-time aggregation once.
- Document actual passing job URLs, commit SHA, fixture source and any limitations in docs/STATUS.md. Do not mark tasks complete on code existence alone.

## Compatibility

[ADR-0001](../../../docs/adr/0001-pre1-breaking-changes.md) is binding: no CogNote compatibility or ChessCoachPal pre-1.0 migration. Any destructive local reset must be expressly requested by its operator, never performed against real student data automatically.

