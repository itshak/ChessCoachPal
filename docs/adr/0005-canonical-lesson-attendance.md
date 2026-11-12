# ADR-0005: One canonical lesson occurrence, roster and attendance ledger

**Status:** Accepted architectural direction; implementation incomplete (strict MCP parity blocker)
**Date:** 2026-11-12

## Context

ChessCoachPal is an MCP-first chess coach assistant with a website for visual
review and corrections. Pre-v1.0.0 changes require no backwards compatibility.
The inherited private calendar currently writes `lessons`, `attendance`,
`lesson_notes` and separate invoice/credit references. The chess-first
coaching workflow independently writes `teaching_sessions`,
`session_participants`, `session_attendance` and `lesson_note`.
`/api/coaching/unified-lessons` and its MCP counterpart reconcile reads but
**do not create one source of truth**. Passing route/tool inventory checks
cannot certify semantic equality while both are independent writers.

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
- Require 93/93 historical plus every new chess-first scenario, zero incomplete
  route families, a strict single-model source audit, and the same strict
  source/security/Compose/restore/E2E gates on the final PR head and merged main.
  Provider-live and actual ChatGPT/Claude verification remain distinct
  prepublication checks.

## Current status

As of 2026-11-12, this decision is **not implemented end to end**:
legacy calendar and coaching attendance are still independent writers.
The strict source audit deliberately flags that condition. Keep parity
OpenSpecs and PRs open; do not assert release readiness.
