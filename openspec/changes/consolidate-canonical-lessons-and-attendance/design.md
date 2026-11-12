# Design: canonical teaching occurrences and per-student attendance

## Ownership and invariants

1. `teaching_sessions` is the sole actual lesson occurrence, with teacher, workplace (nullable), group (nullable), recurrence/slot reference (nullable), local timezone, starts/ends, lifecycle, revision, stable idempotency identity and audited updates. A scheduled occurrence is distinct from its recurring `lesson_slots` intent. The slot does not own a second actual lesson.
2. `session_participants` is the occurrence-time student roster; each row belongs to one session and one teacher-owned student. A student can have one participant row per session. Roster corrections are explicit, revisioned and audited; deleting a student/group/workplace must not silently erase historical rosters.
3. `session_attendance` has at most one current decision per participant; no row means unmarked. Status is `present | late | absent | student_cancelled | teacher_cancelled`. Use `late` as attended for presence-based metrics but preserve late arrival. Track cancellation initiator, notice timestamp, reason, cancellation policy evaluation, marked_by/at, revision and audit; no hidden default of present. Decide policy for partial group cancellations per participant, not by deleting session.
4. Session lifecycle is independent: scheduled, completed, cancelled (and rescheduled semantics with stable occurrence identity). A group session counts once for instructor minutes; per-participant attendance and charges count individually. Reconciliation must never double-count duration.
5. Shared/family-facing and teacher-private notes are canonical session/participant-owned records with explicit sharing/notification flags and safe provenance. Preserve existing useful privacy semantics; do not preserve `lesson_notes` as a physical alias.
6. Financial references: occurrence ID for teaching event and participant ID for per-student invoice line/credit/redemption. Preserve immutable issued financial evidence, no silent cascade of billed sessions; use explicit authorized correction/void workflows. The invoice/payment model itself remains.
7. Cancellation/guardian portal writes, recurrence materialization/edits, attendance bulk writes, notes and financial adjustments must be tenant-authorized atomic transactions (SQL RPC or equivalent). Use expected revision + stable idempotency receipt; external messages go through a durable outbox with send receipts, explicit approval and retry-safe deduplication.
8. Web API and delegated MCP invoke identical domain commands, validation, authorization and transactional boundaries. MCP uses named typed tools and scoped JWT/RLS; browser-only exceptions limited to actual credential/consent entry. No raw SQL MCP or tenant bypass.

## Cutover map

| Old source | Canonical destination / action |
| --- | --- |
| `lessons` | `teaching_sessions` + `session_participants`; remove old table |
| `attendance` | `session_attendance`; remove old table and calendar attendance RPC |
| `lesson_notes` | canonical session/participant notes; remove old table |
| `lesson_slots` | retain as scheduling rules; rewire materialization to sessions |
| `lib/server/legacy-calendar-service.ts` | replace with canonical calendar service |
| `lib/server/legacy-attendance-service.ts` | replace with canonical attendance/notes service |
| `lib/server/unified-lesson-service.ts` and `lib/unified-lesson-history.ts` | simplify to canonical-only reads; remove dual-source union |
| guardian portal, .ics, reports, materials, archive | canonical session/participant queries |
| invoice items, credit redemptions, generation, email | canonical FK/transactions; preserve behavior |
| backup/restore, fixtures, seeds, generated types | current schema only; no old ID aliases |
| browser routes + named MCP tools | shared service and equivalent operations; delete old aliases |

## Execution constraints

**Stage 1 — inventory and contract:** enumerate SQL FK, triggers, RPC, RLS, TS, website, MCP, emails, portal, reports, tests and docs touching old model. Record behavior and cross-interface coverage before deletion. Specify status and cancellation rules including late arrival, no-show and notice policy.

**Stage 2 — schema and domain:** edit `supabase/migrations/20261107000000_chesscoachpal_baseline.sql` directly. Implement canonical service, transactional commands, occurrence materialization, audit and tenant authorization. No incremental upgrade migration.

**Stage 3 — consumer cutover:** rewire private/group calendars, recurrence, bulk attendance, notes, parent portal, notifications, financial statements and credits, materials, reports, .ics and transfer. Preserve professional features and plan gates.

**Stage 4 — deletion:** remove old physical objects, legacy RPCs, service forks, dual history readers, old fixture expectations, dead endpoints/tool aliases and misleading docs. Tighten source audit to forbid legacy tables and runtime references, while allowing historical ADR documentation.

**Stage 5 — verification:** targeted tests during implementation; then one complete canonical fresh-install + web/MCP parity/security/Compose/restore campaign on the implementation head. Capture exact SHA and test evidence. No claim of 100% overall parity or merged-main acceptance from this child alone.

## Risk controls

- Roster/attendance history and invoice linkage cannot be destroyed by recurrence edits or student archive.
- DST, workplace timezone, holiday exceptions and reschedule identity need explicit synthetic test cases.
- Replay, concurrency, stale revision and portal/teacher race are tested at SQL transaction level.
- Teacher private notes must never leak to guardian or delegated read-only clients.
- Explicit operator opt-in and backup required for any existing real data; no silent destructive reset.
