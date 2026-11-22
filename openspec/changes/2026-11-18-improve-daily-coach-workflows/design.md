> **2026-11-21 schema-ownership handoff:** All anticipated physical persistence in this design is owned by the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** under ADR-0019. This design remains a downstream feature contract. Superseded old freeze references below are historical; no independently staged feature DDL or live database change is authorized.

# Design: deterministic teacher workflow, AI-optional presentation

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


## Existing source and evidence
app/(teacher)/dashboard/page.tsx shows global counts/upcoming/recent. lib/server/coach-briefing.ts already computes student-specific briefings; components/teacher/CoachBriefingPanel.tsx renders them manually. Canonical lesson and frozen attendance live in teaching_sessions/session_participants/session_attendance; lesson capture preview/commit and student training plan services exist. Current spreadsheet imports and historical attendance distinguish synthetic/aggregate historic evidence from actual canonical sessions.

## Read-only action queue
Create one shared domain service getDailyCoachingQueue(teacherId, workplaceId|null, teacherLocalDate, optional horizon), preserving explicit requested date and timezone source. Resolve future scheduled canonical sessions and relevant latest event per student; include statuses absent, due/blocked, stale, needs-review with reason/source IDs. Database-backed indicators only: never infer a lesson occurred because a slot existed, never claim homework done without recorded review, never infer that a material was mastered because assigned or taught.

Index and batch queries to avoid N+1 per student and excessive MCP response tokens. Show summary with optional expand/student drilldown. Group work is one instructor session, but student-specific needs remain separate. Archive students remain searchable through history, but absent from default future action queue.

## Prepare lesson and review
Use existing coach-briefing evidence as a server-authoritative source. Preparation combines prior topic/material coverage, latest verified teacher observations, planned training goals and outstanding assignments per student. Group preparation is a protected teacher-only aggregate; no cross-student private exposure in a student/contact portal.

Lesson close obtains actual occurrence and frozen roster; preview validates attendance decisions, shared/per-participant note scope, exact material IDs, original workplace/timezone, independent homework/assignments, teacher approval and expected revisions. Commit uses the same atomic/idempotent occurrence/attendance/material evidence services already accepted in ADR-0005; do not create duplicate session IDs or mark missing attendance as present. Prepare or preview can be invoked from web or task-oriented ccp_* MCP. High-risk corrections use existing approval gates.

## Import reconciliation
Read existing import receipts, aliases, name-search and archive flags; produce exact unmatched rows and ambiguous resolutions with affected IDs and data provenance. An imported aggregate attendance count remains aggregate evidence rather than fabricated dated sessions. A read-only review creates no new records, mutation explicitly confirmed and idempotent. Preserve linked originals and teacher privacy.

## Priorities and testing
Implement workplace filter first. Use no optional LLM dependency: server deterministic fields and verified evidence; AI only summarizes, never invents missing data. Update registry for every teacher action, response compaction tests and representative small-model user-journey evaluations as optional non-blocking UX evidence. En/he/ru and mobile support. No chat-side claim of changed attendance without persisted read-back.

## Archived-learner exception in the everyday lesson flow (2026-11-21)
Integrate the shared temporal lifecycle's lesson-intent preview/atomic commit into the individual, ad-hoc group and completed-group action surfaces. A lesson-specific exact name/alias/ID lookup must search owner-authorized archived and active candidates and return a first-class lifecycle clarification; ordinary active-only rosters, search filters and historical reads need not change. If there is a same-name active/archived collision, ask which ID is intended before discussing reactivation. A uniquely archived match is **not** `NOT_FOUND`.

Present a short, localized teacher confirmation: “This student is archived. Reactivate [display name] at [reviewed workplace] and create [lesson type/date/time]?” Choices: **Reactivate and create**, **Keep archived / cancel**, **Choose another student**; for past lesson intent, **Review historical record**. Only verified previous workplaces are suggestions. Never auto-restore a previous group or recurring series. Where workplace enrollment requires a new explicit authorization, gather it through a separate approved preview before committing any lesson. A blocked quota, unavailable workplace, schedule conflict or stale preview must produce actionable typed results without partial writes.

The MCP surface MUST expose the same focused read-only preview and approved transactional commit as the website, with explicit schema for ID selection, archived confirmations, workplace, time, participant roster, revisions/digest and idempotency. Do not use a generic executor, invent tool-call success, or silently make an enrolled student by calling `ccp_students_lifecycle_commit` and `ccp_sessions_ad_hoc_create` as unguarded separate operations. A compact receipt must distinguish reactivated IDs, selected enrollment periods, session ID, lesson status, replay and independent read-back. Group teaching minutes are one duration; per-student attendance and material evidence are never inferred. Past corrections and historical evidence must remain possible without forcing a student active.
