# ADR-0005: One canonical lesson occurrence, roster and attendance ledger

**Status:** Implemented on the integrated #57 development branch (2026-11-13); separate parent release and MCP parity gates remain open.
**Date:** 2026-11-12

## Context

ChessCoachPal is an MCP-first chess coach assistant with a website for visual
review and corrections. Pre-v1.0.0 changes require no backwards compatibility.
Before this cutover, the inherited calendar wrote `lessons`, `attendance`,
`lesson_notes` and separate invoice/credit references while chess coaching
used independent canonical session and attendance tables. Read-time
reconciliation could not establish one authoritative writer. The 2026-11-13
pre-v1 fresh-install cutover removes the legacy model and duplicate writers.

## Decision

1. **Canonical actual occurrence:** `teaching_sessions` is the sole persisted
   lesson occurrence for private, group, ad-hoc and recurring teaching.
   `session_participants` is its teacher-owned, frozen, per-student roster;
   `session_attendance` is its sole attendance/cancellation ledger.
2. **Scheduling intent:** `lesson_slots` holds the rules for future private
   recurrence, **not** a second definition of an actual taught lesson.
   Recurrence materializes into canonical occurrences with stable IDs and
   workplace-local timezone/DST semantics. Teachers can correct a slot
   without rewriting sessions with teacher notes, attendance, make-up, paid
   credit, guardian messages or invoice references.
3. **Attendance semantics:** Preserve the distinction between presence, late
   arrival, absence/no-show and *who cancelled*, including a verified notice
   timestamp needed for cancellation windows and make-up credits. Do not
   equate legacy `attended` with every modern `present`/completion state,
   or collapse a guardian cancellation into an unexplained session deletion.
   All affected frozen students get an explicit decision on lesson completion.
4. **Teacher history:** A single group meeting counts once toward teaching
   duration even if several participants are billed or marked. Teacher and
   workplace reports, materials taught, billing, guardian portal, calendar
   feeds, invoices and prepaid credits reference the **same** occurrence IDs;
   per-student financial obligations additionally reference the participant.
   Historical evidence remains reviewable and correctable with audit trails.
5. **One mutation boundary:** Website routes and named authenticated MCP tools
   invoke the same domain service and, for multi-record writes, the same
   tenant-authorized SQL transaction. Use optimistic revisions, stable
   idempotency receipts, explicit external-email approval and durable delivery
   receipts/outbox where necessary. Neither surface may bypass RLS by raw DML
   or use a second old-model operation.
6. **Fresh-install schema only:** Remove the old `lessons`, `attendance`
   and `lesson_notes` physical models and their writers, readers and foreign
   keys **after** all retained business capabilities have been transferred.
   No compatibility view, dual write, temporary legacy ID alias or old-schema
   restore/converter is allowed. A development database reset is an explicit
   operator action; never silently reset deployed data.

## Implementation and acceptance consequences

- First enumerate each old-model consumer: calendar/recurrence, direct private
  lessons, family/guardian portal, cancellations and email, notes, invoice
  generation and lines, credit issuance/redemption, reporting, .ics feeds,
  student archive checks, teacher export and backup/restore.
- Repoint each to canonical services and revise the sole fresh-install SQL
  snapshot together. Update existing Playwright coverage rather than merely
  making old endpoints return cosmetically similar shapes.
- Individually test browser versus delegated MCP for create, list, edit,
  complete, correct, cancel, bulk attendance, future recurring edits, group
  attendance, cross-tenant denial, read-only grants, DST/holidays, financial
  history preservation and concurrent stale/replay writes.
- The **separate parent release/parity gate** still requires 93/93 historical
  plus every new chess-first scenario, zero incomplete route families, and
  strict checks on merged main. Accepted attendance cutover is not acceptance
  of those remaining route, holiday/workplace or consent/handoff cases.
  Provider-live and actual ChatGPT/Claude verification remain distinct
  prepublication checks.

## Implementation acceptance — 2026-11-13

The physical canonical lesson/attendance cutover passed on exact source
`bb498083203a3b82ddbcfe1af10863cb2aea4cf1`:
[229 authenticated browser↔delegated MCP E2E tests, five intentionally skipped,
zero failed](https://github.com/itshak/ChessCoachPal/actions/runs/43431098437),
[CI and strict legacy/schema guards](https://github.com/itshak/ChessCoachPal/actions/runs/43431098540),
[security](https://github.com/itshak/ChessCoachPal/actions/runs/43431098438),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43431098458),
and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43431098490).
Implementation [PR #59](https://github.com/itshak/ChessCoachPal/pull/59)
and spec [PR #58](https://github.com/itshak/ChessCoachPal/pull/58) have been
merged into open parent [PR #57](https://github.com/itshak/ChessCoachPal/pull/57).

The SQL session table always has a teacher-owned workplace. A private lesson
without a selected workplace resolves to the seeded personal workspace and
atomically enrolls its active learner for a **new** lesson; an explicitly named
workplace still requires prior membership. Replay never recreates membership.
No existing-database migration or deployed-data reset is implied.

**Remaining parent gates:** the four unaccepted historical cases include
DST/holiday/workplace schedule semantics, profile/security handoffs,
subscription portal handoff and complete website/MCP field/action closure.
Some additional independently named scenarios and merged-main/live-provider
tests remain open. Do not claim v0.1.0 publication readiness.


### Post-archive independent acceptance extension (2026-11-13)

Child [PR #60](https://github.com/itshak/ChessCoachPal/pull/60) subsequently passed [235 delegated-OAuth/browser E2E tests](https://github.com/itshak/ChessCoachPal/actions/runs/43441151638) with five intentional skips at source `ac250e596cbc3fbf29441fbc65175eed7292b772`. It confirms replay/revision boundaries, foreign-owner denial, guardian cancellation guard, financial-history preservation and teacher-approved single-occurrence holiday cancellation across DST. A jurisdiction-specific automatic holiday calendar is intentionally **not** inferred. Final parent integration, 93-case strict release gate and merged-main verification remain separate.
