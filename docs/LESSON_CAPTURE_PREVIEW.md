# Preview and confirm a multi-student lesson

**Scope:** one implementation slice of `support-conversational-lesson-and-lichess-workflows` and `refocus-student-centered-chess-coaching`. This feature is not a complete free-form conversation parser.

The teacher's **Coaching** page now contains **Capture a lesson from student names**:

1. Select the workplace and choose either **exact start + duration** or **infer from weekly schedule** (date only). In both modes the lesson's local day is interpreted in the workplace's IANA timezone. The browser or backend rejects nonexistent or repeated daylight-saving local times rather than guessing.
2. Enter at least two learner names, one per line. Each may be an exact report name or an existing Hebrew/English alias. The preview searches the authenticated teacher's **active** student roster only. It never transliterates, guesses partial names or silently picks between duplicates.
3. Review all exact student IDs, their workplace enrollment, the proposed session title, start, duration and note. Any missing, duplicate or ambiguous identity prevents confirmation. Without a workplace ID, the API only selects a workplace when **exactly one** is shared by all resolved learners. The authenticated parity test exercises a three-person 90-minute lesson both with an explicitly selected workplace and with the unique common workplace inferred.
4. Approve the reviewed proposal explicitly. The website calls the existing one-transaction `sessions.createAdHoc` operation; a delegated agent instead calls `ccp_v1_sessions_ad_hoc_create` with `confirmed=true` and a stable idempotency UUID. Both paths create **one** scheduled coaching occurrence and freeze the student roster; retrying the same request does not duplicate it.
5. Mark per-student attendance and complete the lesson **separately** after confirming actual outcomes. Creating a session does not imply attendance, teaching evidence, grades, or mastery.

## Website and agent tool parity

- Website preview: authenticated `POST /api/coaching/lesson-capture/preview`.
- Delegated read-only MCP preview: `ccp_v1_lessons_capture_preview` (`coach:read`). Input: `{names, workplaceId?, title, lessonNote?, startsAt, durationMinutes}` **or** `{names, workplaceId?, title, lessonNote?, localDate}` (ISO local calendar date). The output now includes `review.timeSource`, `review.slotIds`, `review.timezone` and inferred UTC `proposedSession.startsAt` only when commit-ready.
- Same owner-scoped preview service: `lib/server/lesson-capture-preview.ts`, returning `canCommit`, `resolutions`, `issues`, `workplace`, `proposedSession`, `review`.
- Confirmed creation: existing `ccp_v1_sessions_ad_hoc_create` (`coach:write`) or browser `sessions.createAdHoc`, both using the existing atomic SQL RPC `ccp_teacher_ad_hoc_session_create`.
- Authenticated website ↔ OAuth/MCP tests: `e2e/parity-lesson-capture-preview.spec.ts` and `e2e/parity-lesson-schedule-inference.spec.ts`, covering exact Hebrew/English aliases, enrollment and same-session retry, unique recurring start/duration, missing/multiple times, local spring-forward gap/fall-back fold, and already occupied instructor time.

## Intentional limits and follow-up work

The preview now accepts **either** a concrete start instant plus duration **or** one explicitly selected `localDate` for weekly-slot inference. In date-only mode, every named student must have one matching active, workplace-scoped recurring slot on that local date, and there must be **exactly one shared start and duration**. It does not guess a date, infer a time from just one student's slot, or treat a personal/unassigned slot as a named-workplace slot. More than one common interval, a missing slot, a DST gap/fold or a canonical teaching-session overlap prevents a commit-ready preview. This is still a read-only advisory; the atomic SQL creation writer rechecks all enrollment, recurrence and schedule conflicts. The alias and workplace lookup pages every owned active student and relevant workplace membership; if the tenant data exceeds its explicit safe scan limit, the preview fails rather than presenting a potentially incomplete identity decision. It does not infer a session date from prose, use incomplete or conflicting recurring slots, identify an exact Lichess chapter, attach material teaching evidence, or retroactively mark the session completed. Those are follow-on OpenSpec requirements and must have their own preview/confirmation, shared website/MCP services and real cross-interface tests. No provider credentials, real student data or API keys belong in the repo.

No production data is migrated or reset. This is part of pre-v1.0 feature development and does not waive the separate live ChatGPT/Claude acceptance gate for publishing v0.1.0.
