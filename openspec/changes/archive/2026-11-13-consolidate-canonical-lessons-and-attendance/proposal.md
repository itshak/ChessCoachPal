# Change: consolidate-canonical-lessons-and-attendance

**Status:** PROPOSED — implement BEFORE closing `enforce-mcp-website-functional-parity` and `converge-chess-core-and-complete-mcp-parity`.

## Why

Two independently writable lesson/attendance models coexist: inherited `lessons` + `attendance` + `lesson_notes` and chess-first `teaching_sessions` + `session_participants` + `session_attendance` + `lesson_note`. A unified history read adapter is not a single source of truth. A group meeting must count as one teaching occurrence, while each frozen student has an independent attendance, cancellation and billing outcome. The current duality makes historical edits, finance, calendar, guardian messaging, reports and website↔MCP equivalence unreliable.

## Decision

Adopt ADR-0005, consistent with binding ADR-0001 and ADR-0003. One canonical actual lesson is `teaching_sessions`; `session_participants` stores the immutable-at-occurrence roster (with audited authorized corrections); `session_attendance` stores the one per-participant attendance/cancellation decision. `lesson_slots` represents recurring scheduling intent only. Preserve and rewire professional business capabilities, not their CogNote-era physical tables or route aliases. Remove `lessons`, `attendance`, `lesson_notes`, old RPCs, all old readers/writers, legacy history union and obsolete tests after canonical replacements exist. Modify the consolidated fresh-install SQL snapshot in place; **no compatibility views, backfills, dual writes, sequential upgrade migrations or old-ID adapters**. Never automatically destroy actual data.

## Scope

- One occurrence model for individual, group, ad-hoc, make-up and recurring teaching; stable occurrence IDs, local timezone/DST, rescheduling, cancellation and holiday handling; frozen roster and revisioned corrections.
- Attendance statuses: unmarked (absence of decision), present, late, absent/no-show, student-cancelled and teacher-cancelled. Preserve who cancelled, verified notice time, notes, reason and policy evaluation. Separate session lifecycle (scheduled/completed/cancelled) from per-student attendance. Do not equate attended with completed or count group minutes per participant.
- Shared authorized transactional service for web and named MCP operations: create/list/edit/reschedule/cancel/complete, roster, notes, mark/clear/correct/bulk attendance, recurrence edits and student history. Optimistic revisions, idempotency, tenant RLS, audit and explicit external-notification approval.
- Repoint invoices/lines, credit packages/redemptions, billing generation, portal/guardian tokens and cancellation, email/outbox receipts, materials taught, student/workplace progress, reports, .ics feeds, archive guards, exports and backup/restore to canonical session/participant IDs. Keep all retained behavior.
- Remove obsolete physical model, policies, triggers, SQL functions, TypeScript, route handlers, MCP tools and tests. Keep useful website/API functionality using current names/contracts without legacy compatibility shims.

## Dependency / execution order

This is a **blocking prerequisite** for the remaining attendance/calendar/history/billing acceptance of `enforce-mcp-website-functional-parity` (B3/B5/B6, C1–C3), and for `converge-chess-core-and-complete-mcp-parity` (B5/B6/B10, C2/C3). It does **not** supersede or archive either parent change. The parent retains ownership of exhaustive website↔MCP parity, 93 historical scenarios, all new scenarios, integrated acceptance, merged-main verification and final archiving.

Git topology at proposal time: draft PR #57 (`feat/portal-calendar-cancellation-atomic-20261112`) is stacked on #56 → #51 → #50. This OpenSpec branch starts at #57 head `cbae924f341b87aa768cc2950fc23a44282d1030`, and its PR targets #57. Implement and verify this cutover on the child branch, merge it **into #57's branch first**, then resume remaining parity work there. Only after final parity acceptance merge the dependency stack into main in order. Do not archive #57's active OpenSpec merely because this child change passes. Avoid running the final full CI campaign before implementation completeness; targeted tests during development are permitted.

## Acceptance

A fresh database has exactly one actual lesson model and one attendance ledger; no runtime reference to removed tables, old RPCs, duplicate history reconciliation or old-data compatibility; all retained professional features work on canonical IDs; per-participant financial history and shared teacher duration are correct; browser and delegated MCP call the same services; deterministic E2E covers private/group, attendance corrections, cancellation notices, credits/invoices, recurring edits, DST, portal race, emails/outbox, RLS, replay and stale conflicts; baseline setup, types, source guard, unit/integration and security tests pass on the exact implementation head. This child change can be archived once its scoped evidence is accepted, **but the parent parity change remains active until 93/93 plus new cases and strict merged-main gates pass**.

**Data safety:** A full dev reset is required for old pre-1.0 schema. Require explicit operator approval and backup before any real-data destruction; do not silently reset.
