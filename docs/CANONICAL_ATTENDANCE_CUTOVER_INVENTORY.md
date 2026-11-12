# Canonical lesson/attendance cutover â€” source inventory

**State:** Unresolved implementation inventory for OpenSpec consolidate-canonical-lessons-and-attendance, inspected on 2026-11-12 against PR #58 head 10bbc99a. This is NOT evidence of a completed migration or website/MCP parity.

Run npm run schema:attendance:inventory for current source evidence, or npm run schema:attendance:strict for the intentionally failing pre-cutover source gate. The scanner excludes documentation and is NOT a substitute for E2E.

## Physical SQL objects and dependencies

- Remove the three old physical tables: public.lessons, public.attendance, public.lesson_notes. Drop their RLS, triggers, indexes, grants, foreign keys and obsolete RPCs. Do not create compatibility views.
- Keep public.lesson_slots strictly as recurrence intent, not an actual lesson ledger.
- Use public.teaching_sessions for every actual occurrence, public.session_participants for the frozen roster and public.session_attendance for at most one decision per participant. No attendance row represents unmarked.
- Replace the foreign keys credit_redemptions.lesson_id -> lessons.id (currently ON DELETE CASCADE), invoice_items.lesson_id -> lessons.id (currently ON DELETE SET NULL), attendance.lesson_id -> lessons.id, lesson_notes.lesson_id -> lessons.id and lessons.makeup_for -> attendance.id. Protect immutable issued invoice/credit evidence; use session and participant IDs.
- Audit and rewire SQL functions for credit enforcement, ¶»§q«^