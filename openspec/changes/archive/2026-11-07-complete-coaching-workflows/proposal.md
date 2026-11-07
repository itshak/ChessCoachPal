# Change: complete-coaching-workflows

- **Status:** Accepted on main 2026-11-07 — milestone 1 of 5; archived
- **Target:** ChessCoachPal v0.1.0
- **Depends on:** None; refine and merge [draft coaching PR #1](https://github.com/itshak/ChessCoachPal/pull/1)
- **Release roadmap:** [OpenSpec v0.1.0](../../../ROADMAP-v0.1.0.md)

## Why

An instructor needs a reliable way to manage students, independent workplaces, groups, lessons, attendance and notes even without an AI provider. Today the CogNote-derived UI does not offer a verified end-to-end chess-specific workflow. PR #1 proposes the new data model and minimal page but its browser acceptance test is failing.

## Change

Deliver a complete teacher-owned **website-first fallback** and shared typed domain service: add/edit students and workplaces, enroll students in classes, create and edit group and private sessions, capture per-student attendance and teaching notes, and review records after reload. Count teacher work once per session irrespective of participant count. Handle timezone and day boundaries correctly, disallow cross-workplace/group IDs, and preserve group attendance snapshots.

The domain operations must be reusable by the agent gateway delivered in [connect-chatgpt-and-claude](../connect-chatgpt-and-claude/proposal.md). Website use must not require ChatGPT/Claude accounts. Choose a clean current schema rather than support existing CogNote or pre-1.0 installations.

## Deliberate exclusions

No full compensation engine, parental invoicing, music practice, automatic recurring calendar generation, Google/Notion integration, or chessboard. These must not silently become MVP blockers. A one-off session and basic reschedule/cancel operation suffice for this milestone.

## Acceptance

An authenticated teacher can start with a fresh synthetic seed and, through the UI, create two workplaces, add/edit one student, enroll that student in a group, schedule one group and one private session, mark individual attendance and edit the session/participant notes. After reload, the correct records display in a workplace-scoped list. Another teacher cannot read or alter them. A group's 60-minute session counts as 60 instructor minutes irrespective of class size. Browser E2E and fresh-DB tests pass, including the currently failing Workplace selector path.

**Acceptance evidence:** [PR #4](https://github.com/itshak/ChessCoachPal/pull/4) merged in main commit [a87fb63](https://github.com/itshak/ChessCoachPal/commit/a87fb63a8440a358d039187be48fce5a14609e36), [CI 42407121579](https://github.com/itshak/ChessCoachPal/actions/runs/42407121579) and [fresh-database E2E 42407121512](https://github.com/itshak/ChessCoachPal/actions/runs/42407121512) passed (25 tests passed, 5 skipped). PR #1 was closed as superseded.

