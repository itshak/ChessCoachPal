# ChessCoachPal chess-trainer MCP workflows — implementation roadmap

**Status: specification design only, not deployed.** Updated 2026-11-08. Proposed work is tracked in [support-conversational-lesson-and-lichess-workflows](../openspec/changes/support-conversational-lesson-and-lichess-workflows/proposal.md), with [full current/proposed MCP tool catalogue](../openspec/changes/support-conversational-lesson-and-lichess-workflows/tool-catalog.md). The independent first-release gate remains [complete-v0-1-0-release-gates](../openspec/changes/complete-v0-1-0-release-gates/tasks.md) and package version remains `0.0.0`.

## What already works on main

- Deployed Vercel demo and isolated Supabase, correct OAuth/MCP discovery and dynamic registration, authenticated real Codex client. An actual synthetic student **Armond** and **Marshal** workplace/enrollment were confirmed by querying Supabase.
- **28** versioned MCP commands for student search/create/update, workplace/group/session CRUD and attendance/learning safe operations. Only **nonempty search**, not true roster list. Lichess material links are stored as URLs, not provider reads/writes.
- Website student management stores canonical `students.name`, birthdate, free-form `level`, teacher notes, guardian, rates and archive status. Student detail has some inherited per-dimension `skill_assessments` (1–5), lesson notes and attendance; Chess learning has separate teacher-verified or agent-suggested observations.
- Legacy `lesson_slots → lessons` scheduling and MCP `teaching_sessions → session_participants/session_attendance` coexist; ad-hoc three-person single-session recording, missing-hours schedule fallback, student aliases, online chess usernames and rating history are **not** implemented in the MCP workflows.
- There is no implemented image-to-FEN, Lichess API connection, PGN indexing/study creation, puzzle chapter upload or rolling 64-chapter sequence.

## Target example: one sentence → one historical teaching record

Teacher says: **“Today I taught Armond, Shushana and David Zaruk from 13:00 to 14:30. We studied Steinitz versus Chigorin in Classic Games 2, game 32.”**

1. Resolve teacher local date/timezone, all three canonical student UUIDs through full names and English/Hebrew aliases. Ask if duplicate matches.
2. Resolve workplace/common roster, explicit 90-minute block. If hours omitted, use a **single applicable nonconflicting weekly slot**; otherwise ask. Never silently use UTC, guess schedule or create a permanent group.
3. Resolve actual accessible Lichess study and chapter by provider study/chapter ID, 1-based ordinal and PGN White/Black/Event metadata, or ask for clarification. An explicitly stated nondefault study is allowed and linked to students/lesson without changing selected defaults.
4. Preview **one** 90-minute instructor lesson, 3 participant records, marked-present attendance for explicitly taught students, material links and **unknown comprehension**. Request teacher approval.
5. Atomic DB commit with revision and idempotency, no double count between scheduling structures. Show receipt; website corrections are visible to the MCP client.

## Target example: image → FEN → puzzle chapter

Teacher sends a position image to a supported vision-capable chat. The client can propose piece placement; ChessCoachPal validates full six-field FEN, presents a board preview and asks for missing turn/castling/en-passant context. After consent and separate Lichess `study:write`, use teacher/student/workplace default Puzzles study or an explicitly chosen study. Import a standards-compliant FEN-PGN chapter, check **64 chapter capacity** including the new-study starter, or create a collision-safe `Puzzles 2`, `Puzzles 3` successor with consent. Respect study creation/rate limits, idempotent provider-write reconciliation and offline/pending state. A website FEN/board editor works without image transfer in the MCP client.

## Recommended chess student profile

| Feature | Data model / behavior |
| --- | --- |
| Full reporting name | Existing `students.name`; canonical Hebrew or other full name; **reports use this**, no auto transliteration |
| Short English name and aliases | Proposed `student_aliases` table with English/Hebrew variants, nickname and former name; searchable, case/Unicode-normalized; duplicate alias asks for selection |
| Strength 1–10 | Optional teacher-assessed score with date and append-only snapshots; `null` means **not assessed**; not computed from website ratings |
| Individual chess skills | Keep existing `skill_assessments` 1–5 and `chess_skill_categories` / `chess_observations`; consolidate progress display, retain source/teacher approval |
| Lichess and Chess.com accounts | Proposed provider-specific usernames, public profile links, verification/availability and optional opt-in public rating sync; **no child's password/token** |
| Provider ratings | Separate Lichess vs Chess.com, rapid/blitz/bullet/classical/daily/puzzle where available; timestamped history, provisional/number games, manual/API source; do not compare values directly |
| Chess progress | Teacher-set goals/focus, dated observations, session attendance, exact assigned studies/chapters, optional exercises/assignments with status; unknown skill comprehension stays unknown |
| Scheduling | Weekly slots per learner/workplace with timezone, effective dates and exceptions; missing lesson time uses only uniquely resolvable occurrence |
| Privacy | Parent contacts/birthdates private to website and authorized views, absent from default MCP list; cross-teacher RLS and no public indexing of children's accounts |

### Example record (illustrative, no personal real data)

- **Name for reports:** `שושנה לוי`
- **English aliases for chat:** `Shushana`, `Shoshana`, `Shoshi`
- **Teacher strength:** `4/10`, assessed `2026-11-08`; **independent from provider ratings**
- **Lichess:** `student-example` rapid `1190` (sample/illustrative; real data must come from verified provider fetch), **Chess.com:** not configured
- **Learning:** "Needs practice with opposition" as a dated *teacher-verified* or *unverified agent proposal*; not a fabricated automatic assessment.

## Implementation phases (each requires merged-main tests)

1. **Student identity/progress:** alias normalization, profiles, accounts, rating histories and bilingual website/MCP parity.
2. **Schedule and narrative lessons:** reconcile canonical lesson history, recurring slots, arbitrary frozen roster, preview/commit and missing-time rules.
3. **Study materials:** Materials → Lichess OAuth/PAT settings, selected/default studies, safe chapter PGN indexing, per-student links and offline status.
4. **Puzzles:** verified board/FEN, PGN chapter import, 64 chapter rollover, remote-write intent reconciliation, website fallback.
5. **Verification/acceptance:** synthetic provider-mock GitHub Actions, fresh Supabase RLS/Playwright, Compose/restore, docs and versioned MCP contract coverage.

**Version strategy:** This is a comprehensive proposal, not a promise every feature belongs to the currently blocked v0.1.0 release. Plan milestones deliberately; keep `0.0.0` until approved release and no compatibility constraints before v1.0.0.

## Hosting and ChatGPT Plugin Directory recommendation

**Keep the public ChessCoachPal Plugin Directory submission out of the initial self-hosted development release.** The simplest one-click ChatGPT experience is best after there is a stable multi-teacher cloud account service with OAuth, support, privacy/terms, uptime, billing/quotas and tenant isolation. A public plugin is **not technically dependent on semantic version v1.0.0**; a properly controlled SaaS beta could submit earlier if production-grade readiness/reviewer requirements are met. Our recommended default is **prepare plugin interfaces now, launch hosted SaaS/public directory at or after v1.0.0**, and revise earlier only by explicit decision after safe hosted beta evidence. Self-hosters and Codex/Claude custom MCP clients can continue using their own deployments before then. See [PUBLIC_PLUGIN_SUBMISSION.md](PUBLIC_PLUGIN_SUBMISSION.md).
