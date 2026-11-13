# Implementation checklist — canonical session/attendance cutover

**Status:** Physical/source cutover verified on stacked branch `bb498083` by five green workflow families; final child D3/D5 and parent parity acceptance remain open. Checkmarks below mark directly reviewed source/test scope, not a main-release claim.

## A. Inventory and design
- [x] A1. Enumerate every SQL object/FK/RLS/RPC, server service, route, MCP tool, website component, report, export, portal, .ics, email, billing/credit and test referencing old `lessons`, `attendance`, `lesson_notes` or cross-model history.
- [x] A2. Finalize session lifecycle vs per-participant attendance states, late/no-show/notice/cancel semantics, notes sharing, frozen roster, financial ownership, workplace timezone and recurrence identity.
- [x] A3. Record one-to-one cutover map and parity test IDs for all retained behaviors; review old-model deletion impacts before edits.

## B. Canonical schema and atomic service
- [x] B1. Replace old tables, FKs, triggers, RLS and RPCs in the single baseline SQL; add canonical constraints, indexes, tenant policies, audit, revision and idempotency receipts. No migration/backfill/compatibility layer.
- [x] B2. Implement canonical occurrence creation, reschedule, completion, cancellation, slot materialization/edit/delete with stable IDs, DST/holiday and protected historical references.
- [x] B3. Implement roster correction and attendance mark/clear/correct/bulk including present/late/absent/student_cancelled/teacher_cancelled and independent session completion.
- [x] B4. Implement canonical shared/private notes, guardian cancellation and approved durable outbox/receipt notifications with atomic tenant-authorized commands.
- [x] B5. Share one domain service and authorization/transaction layer across website and named MCP tools, including read-only scope, plan gates, revisions and replay protection.

## C. Retained consumer cutover
- [x] C1. Private/group calendar, recurrence, student and workplace lesson history, guardian portal and .ics feeds.
- [x] C2. Invoice generation/lines, paid credits/redemptions, manual payments, cancellation credits and teacher/workplace reports; correct group minute counting.
- [x] C3. Materials taught, student/workplace progress, session notes, archive/history guards and learning briefings.
- [x] C4. Exports, backup/restore, seed fixtures, generated types, API contracts, documentation and MCP registry.
- [x] C5. Remove old tables, old SQL RPCs, `legacy-*` writers/readers, dual history reconciliation and old endpoint/tool aliases; source audit proves zero old-model runtime references.

## D. Evidence and handoff
- [x] D1. Unit/SQL integration: private/group, roster freeze/correction, all statuses, notice windows, attendance revisions, idempotent replay and stale conflicts.
- [x] D2. Authenticated website↔delegated MCP E2E: create/edit/list/complete/cancel/bulk, portal race, no cross-tenant access, read-only grant denial, financial/credit and notes privacy.
- [ ] D3. Recurrence and finance regressions: DST, holidays, moved occurrence, historical notes/attendance, invoice/credit preservation, group teaching minutes once, outbox deduplication.
- [x] D4. Full final fresh-install typecheck/unit/E2E/security/Compose/restore/source-guard tests green on one exact candidate SHA; record evidence without pretending parent strict 93-case parity passed.
- [ ] D5. Merge implementation child into #57 branch in dependency order; update ADR-0005 to implemented only when proven; archive THIS change only with accepted evidence. Resume parent parity OpenSpecs and their remaining 93/new scenarios afterward.

**Do not:** check boxes from proposed code alone; run repeated full CI on each incremental commit; archive parent parity; auto-reset any real database; or weaken retained billing/guardian functionality to simplify deletion.

## Source-branch verification evidence

Exact source `bb498083`: [CI, 441 unit tests and no-legacy strict audit](https://github.com/itshak/ChessCoachPal/actions/runs/43431098540), [229 authenticated website/MCP E2E passing, five skipped](https://github.com/itshak/ChessCoachPal/actions/runs/43431098437), [security](https://github.com/itshak/ChessCoachPal/actions/runs/43431098438), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43431098458), [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43431098490). Unchecked D3 requires independent holiday, financial/credit/history protection coverage; D5 requires merged implementation, evidence update and archival. Parent remains 89/93 old + 21/26 new, strict release blocked.
