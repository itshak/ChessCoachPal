# Canonical lesson/attendance cutover — source inventory

**State:** Unresolved implementation inventory for OpenSpec consolidate-canonical-lessons-and-attendance, inspected on 2026-11-12 against PR #58 head 10bbc99a. This is NOT evidence of a completed migration or website/MCP parity.

Run npm run schema:attendance:inventory for current source evidence, or npm run schema:attendance:strict for the intentionally failing pre-cutover source gate. The scanner excludes documentation and is NOT a substitute for E2E.

## Physical SQL objects and dependencies

- Remove the three old physical tables: public.lessons, public.attendance, public.lesson_notes. Drop their RLS, triggers, indexes, grants, foreign keys and obsolete RPCs. Do not create compatibility views.
- Keep public.lesson_slots strictly as recurrence intent, not an actual lesson ledger.
- Use public.teaching_sessions for every actual occurrence, public.session_participants for the frozen roster and public.session_attendance for at most one decision per participant. No attendance row represents unmarked.
- Replace the foreign keys credit_redemptions.lesson_id -> lessons.id (currently ON DELETE CASCADE), invoice_items.lesson_id -> lessons.id (currently ON DELETE SET NULL), attendance.lesson_id -> lessons.id, lesson_notes.lesson_id -> lessons.id and lessons.makeup_for -> attendance.id. Protect immutable issued invoice/credit evidence; use session and participant IDs.
- Audit and rewire SQL functions for credit enforcement, invoice draft/generation/regeneration, ccp_calendar_attendance_commit, ccp_portal_cancel_lesson, ccp_calendar_slot_delete, ccp_credit_redemption_return, ccp_teacher_backup_restore, student deletion guards and current canonical session commit/roster checks.
- All SQL alterations must be made in the one pre-v1 fresh-install snapshot: supabase/migrations/20261107000000_chesscoachpal_baseline.sql. No upgrade chain, migration adapter or implicit real-data reset.

## Direct source consumers by business behavior

| Domain | Direct consumers | Required destination |
| --- | --- | --- |
| Recurrence, schedule | lib/server/legacy-calendar-service.ts; lib/server/scheduling.ts; app/(teacher)/schedule/page.tsx | Canonical calendar service, atomic slot materialization/edit/delete, timezone/DST |
| Attendance and notes | lib/server/legacy-attendance-service.ts; app/(teacher)/students/[id]/page.tsx | Canonical per-participant status, revisions, audited teacher notes |
| Guardian portal | app/portal/[token]/page.tsx; app/api/portal/[token]/calendar/route.ts; app/api/portal/[token]/lessons/[id]/cancel/route.ts; lib/server/lesson-cancel-email.ts | Tenant/guardian scoped cancellation, immutable notice, outbox/receipts |
| Calendar feeds | app/api/feeds/[token]/calendar/route.ts | One canonical occurrence, one group event |
| Finance | lib/server/billing.ts; lib/server/credits.ts and SQL invoice/credit functions | Participant-specific charges, preserved invoice/credit links |
| History/archive | lib/server/student-profile-service.ts; lib/server/unified-lesson-service.ts | Single canonical timeline and history preservation |
| Seed/transfer | supabase/seed.sql; SQL backup/restore; lib/data-transfer.ts | Canonical-only data import/export |

Indirect entry points needing behavior tests even without direct old-table reads: app/api/schedule routes; app/api/agent/v1/route.ts; named ccp_v1_calendar_* MCP operations in lib/server/agent-tools.ts; teacher schedule, attendance and notes components; portal, invoice and credit flows; reports, feeds, backups and notifications.

## Behavioral acceptance map

1. Stable private/group/ad-hoc/makeup/recurring occurrence identity; counted instructor time once for group teaching, per-student attendance and charges separately; DST/holiday/slot change acceptance.
2. Frozen roster and audited corrections; no implicit presence; present, late, absent/no-show, student-cancelled and teacher-cancelled; explicit revisions and replay keys.
3. Guardian permission, single notice timestamp, concurrent cancel vs teacher correction, approved durable notification outbox, private-note isolation.
4. Issued invoice/credit evidence preserved through reschedule, archive and recurring-slot deletion. No cascade deletes or historical detachment.
5. Shared atomic website and delegated MCP services; scoped read-only, tenant/RLS, replay and stale-revision failures; reports/backup parity.
6. Remove legacy physical tables, SQL RPCs, readers/writers and history union only once replacement E2E and full fresh-install regression pass.

## Gate ownership

Verify exact-source SHA with types, unit/SQL integration, authenticated website/MCP E2E, security, Compose and backup/restore. Parent strict 93-case parity and merged-main gates remain separate. **No implementation checkboxes are completed by creating this inventory.**

