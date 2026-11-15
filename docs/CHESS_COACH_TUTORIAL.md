# Chess coach tutorial (synthetic data)

Use a fresh isolated installation and dummy student names. No external AI account is required.

1. Sign in and create workplaces North Club (Asia/Jerusalem, he, ILS) and Online Lessons (UTC, en, USD).
2. Add the canonical student Demo Learner, enroll in North Club, create group Rooks and enroll the learner. Enroll the same student at Online Lessons without duplicating the identity.
3. Schedule a 60-minute Rooks group lesson and a separate Online Lessons private lesson, using valid local times. Confirm the group roster is frozen for the historical session.
4. Record per-person attendance, edit the shared lesson note and correct one attendance status. Reload to verify changes persist. Removing a current group member does not erase past roster.
5. In Chess learning, record an observation in a chess category, link a curated HTTPS/Lichess study reference (not copyrighted content), and review/correct any synthetic agent proposal from the website. Agents cannot approve their own suggestions.
6. Open Teaching activity report, select North Club and a date range containing the group lesson. Check that 60 teacher minutes are counted once regardless of attendance count, attendance statuses are per participant, and CSV/text exports are available. Hebrew workplace locale shows RTL presentation. Reload and regenerate to verify persistence.

## Conversational chess lesson capture (same behavior in ChatGPT/Claude MCP and website)

1. Create three synthetic active learners, give one a Hebrew reporting name and an English short alias, and enroll all three in a single workplace. Use the website `/api/students/resolve` or `ccp_students_resolve` to verify exact identity without guessing.
2. Create matching active 90-minute weekly slots at 13:00 for all three in the same workplace. On the **Coaching** page choose **Use a unique matching weekly slot (date only)**. Supply a real workplace-local date and see the same UTC time and frozen roster produced by `ccp_schedule_day_preview` and `ccp_lessons_capture_preview`. An incorrect or duplicate alias, missing slot, multiple matching times, DST ambiguity or occupied canonical session must block approval.
3. Optionally connect a synthetic `study:read` Lichess provider (see provider mocks in `e2e/parity-conversational-batch.spec.ts`) and index `Classic Games 2`. Enter exact title + chapter ordinal `32` + expected PGN player names `Steinitz–Chigorin`. The read-only preview must display actual provider study and chapter IDs, source verification and `attached:false`—not invented mastery.
4. Explicitly confirm one 90-minute lesson. The UI and MCP both call the existing atomic ad-hoc session writer, freezing three learners. Verify the instructor minutes are 90, not 270, and all three attendance decisions are initially unmarked. An exact request retry returns the same session.
5. After the session exists, optionally review and **separately approve** attaching the verified chapter as `assigned` using the same website chapter-evidence service and `ccp_materials_link_preview/commit`. It creates one workplace chapter association and three student-coverage records in a single separate transaction. The chapter is **not** marked taught until the lesson is completed with explicit attendance and teacher evidence.
6. Test negative outcomes against both browser and delegated MCP: changing the chapter title/players, stale cache, unauthorized study, another teacher's workplace/student, changed replay, and provider outage must never manufacture teaching history or publish a puzzle.

Keep all fixtures synthetic. Only the final local prepublication v0.1.0 gate needs actual ChatGPT/Claude client verification; see docs/LOCAL_CLIENT_ACCEPTANCE.md.
