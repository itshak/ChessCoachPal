# Tasks — complete-coaching-workflows

All tasks start unchecked. Mark them only after merged implementation and **observed verification evidence** recorded in docs/STATUS.md; include commit SHA and test/run link. PR #1 is a starting point, not proof of acceptance.

- [ ] 1.1 Review/finish PR #1 without restoring archived omnibus OpenSpec files; merge the shared service and minimal coaching UI after tests pass.
- [ ] 1.2 Implement teacher-owned workplaces with names, timezone, locale, currency and current policy schema; support create, list and edit.
- [ ] 1.3 Reuse a canonical teacher-owned student across workplaces; implement verified workplace and group enrollments, edit and search.
- [ ] 1.4 Implement create/edit/list/reschedule/cancel for one-off group and private sessions with explicit UTC/timezone handling.
- [ ] 1.5 Freeze group participants when a session is created and enforce one attendance row per roster participant.
- [ ] 1.6 Provide editable group/individual attendance statuses, per-student notes and shared session notes, with reload persistence.
- [ ] 1.7 Supply workplace filters, teacher session timeline and clear group register, with accessible labels and mobile layouts.
- [ ] 1.8 Implement idempotent session creation, safe retry behavior and input-validation errors in the shared command service.
- [ ] 1.9 Validate a 60-minute session credits exactly 60 instructor minutes with 1 or many attendees; test absence without canceling class.
- [ ] 1.10 Test two independent teacher identities and cross-workplace object mismatches; unauthorized IDs reveal no private student data.
- [ ] 1.11 Fix the coaching Playwright selector timeout from E2E 42392868328 and add a passing website create → edit → reload scenario.
- [ ] 1.12 Run fresh database reset/seed, typecheck, unit and browser E2E, and record passing commit/run evidence in docs/STATUS.md.

