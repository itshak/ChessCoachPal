# Implementation checklist — canonical session/attendance cutover

**Status:** Accepted 2026-11-13 — canonical physical attendance cutover merged through PRs #59 and #58 into #57. This does not complete the parent website/MCP parity/release gate.

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
- [x] D3. Recurrence and finance regressions: DST/timezone, moved occurrence, historical notes/attendance, invoice/credit preservation, group teaching minutes once, outbox deduplication. Automatic holiday exclusions and fully independent holiday/workplace parity acceptance remain explicitly tracked by the parent OpenSpec.
- [x] D4. Full final fresh-install typecheck/unit/E2E/security/Compose/restore/source-guard tests green on one exact candidate SHA; record evidence without pretending parent strict 93-case parity passed.
- [x] D5. Merge implementation child into #57 branch in dependency order; update ADR-0005 to implemented only when proven; archive THIS change only with accepted evidence. Resume parent parity OpenSpecs and their remaining 93/new scenarios afterward.

**Do not:** check boxes from proposed code alone; run repeated full CI on each incremental commit; archive parent parity; auto-reset any real database; or weaken retained billing/guardian functionality to simplify deletion.

## Exact-source acceptance and remaining parent blockers

- Canonical implementation source: `bb498083203a3b82ddbcfe1af10863cb2aea4cf1`; [authenticated website/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43431098437): **229 passed, five intentionally skipped, zero failed**.
- Identical source: [CI, strict source/legacy-model audit, typecheck and unit tests](https://github.com/itshak/ChessCoachPal/actions/runs/43431098540), [security](https://github.com/itshak/ChessCoachPal/actions/runs/43431098438), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43431098458) and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43431098490) passed.
- [Implementation PR #59](https://github.com/itshak/ChessCoachPal/pull/59) merged as `8f24f3b05fff20a06bf84bcaa2d13d00068be106` into [spec PR #58](https://github.com/itshak/ChessCoachPal/pull/58), merged as `74d3276935898b3b8be402ee70bcda2cfda68858` into open [parent PR #57](https://github.com/itshak/ChessCoachPal/pull/57).
- Historical 93-case parity, separate new independent scenarios, automatic holiday-specific behavior, final merged-main release gates and live ChatGPT/Claude provider verification are **not** implied by this archive. Do not reset a real database or assume legacy data migrations; this is a pre-v1 fresh-install schema only.


## Independent follow-up behavioral acceptance (2026-11-13)

The already archived child was supplemented with named canonical website/MCP behavioral tests through [merged PR #60](https://github.com/itshak/ChessCoachPal/pull/60). Exact source [`ac250e5`](https://github.com/itshak/ChessCoachPal/commit/ac250e596cbc3fbf29441fbc65175eed7292b772) passed [235 authenticated E2E tests](https://github.com/itshak/ChessCoachPal/actions/runs/43441151638), five intentional skips and zero failures, plus [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43441151541), [security](https://github.com/itshak/ChessCoachPal/actions/runs/43441151676), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43441151544) and [restore](https://github.com/itshak/ChessCoachPal/actions/runs/43441151570). This adds independent optimistic attendance/replay, bulk rollback, comprehensive foreign-calendar denial, portal mark/past guard, invoice/credit/private-note preservation and a teacher-approved manually cancelled holiday occurrence across DST. Parent source integration and merged-main strict parity remain separate verifications, not implied by this archived child.
