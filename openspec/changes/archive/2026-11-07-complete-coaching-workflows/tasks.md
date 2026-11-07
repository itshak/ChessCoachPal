# Tasks — complete-coaching-workflows

**Accepted 2026-11-07.** All tasks verified after main merge [a87fb63](https://github.com/itshak/ChessCoachPal/commit/a87fb63a8440a358d039187be48fce5a14609e36), passing [CI 42407121579](https://github.com/itshak/ChessCoachPal/actions/runs/42407121579), passing [fresh Supabase + browser E2E 42407121512](https://github.com/itshak/ChessCoachPal/actions/runs/42407121512), and evidence in [docs/STATUS.md](../../../../docs/STATUS.md). PR #1 was closed as superseded.

- [x] 1.1 Review/finish PR #1 without restoring archived omnibus OpenSpec files; merge the shared service and minimal coaching UI after tests pass.
- [x] 1.2 Implement teacher-owned workplaces with names, timezone, locale, currency and current policy schema; support create, list and edit.
- [x] 1.3 Reuse a canonical teacher-owned student across workplaces; implement verified workplace and group enrollments, edit and search.
- [x] 1.4 Implement create/edit/list/reschedule/cancel for one-off group and private sessions with explicit UTC/timezone handling.
- [x] 1.5 Freeze group participants when a session is created and enforce one attendance row per roster participant.
- [x] 1.6 Provide editable group/individual attendance statuses, per-student notes and shared session notes, with reload persistence.
- [x] 1.7 Supply workplace filters, teacher session timeline and clear group register, with accessible labels and mobile layouts.
- [x] 1.8 Implement idempotent session creation, safe retry behavior and input-validation errors in the shared command service.
- [x] 1.9 Validate a 60-minute session credits exactly 60 instructor minutes with 1 or many attendees; test absence without canceling class.
- [x] 1.10 Test two independent teacher identities and cross-workplace object mismatches; unauthorized IDs reveal no private student data.
- [x] 1.11 Fix the coaching Playwright selector timeout from E2E 42392868328 and add a passing website create → edit → reload scenario.
- [x] 1.12 Run fresh database reset/seed, typecheck, unit and browser E2E, and record passing commit/run evidence in docs/STATUS.md.

