# Canonical chess lesson occurrence: cutover contract and source disposition

**State: canonical attendance cutover implemented and exact-source verified on 2026-11-13.** The historical inventory below is preserved for context; parent holiday/workplace and full website/MCP parity remain separate.
OpenSpec: `converge-chess-core-and-complete-mcp-parity` tasks B5/C2/C3/C4/C8/C9.
Use ADR-0001: one current fresh-install snapshot, **no** previous-data
migration, dual-writer, API alias, or upgrade version. This is NOT permission
to erase a real database. Child OpenSpec accepted after
[229 authenticated E2E passed](https://github.com/itshak/ChessCoachPal/actions/runs/43431098437),
while parent parity and merged-main release checks remain open.

## Decision: one actual occurrence

`teaching_sessions` is the **only authoritative actual lesson**; keep one
session and one duration per group/private/ad-hoc occurrence. Its immutable
`session_participants` snapshot defines exactly who was in the lesson.
`session_attendance` is one student's status, correction revision and
teacher note. Staff/finance reports must not multiply the session's teacher
duration by the roster size. Group lessons may nonetheless create separate
student charges or credit redemptions.

`lesson_slots` becomes *recurrence intent only*. It may request future
occurrences using a stable (slot UUID, local occurrence date) key. No slot is
itself a completed lesson and no slot automatically provides attendance
evidence. The occurrence is created using the same authorized session-create
service as website and MCP, with explicit workplace, timezone/DST policy
and enrollment rules. Existing ad-hoc roster correction/audit remains
current; do not overwrite historic frozen rosters when membership changes.

## Current duplicate surfaces and required disposition

| Current owner / source | Still-supported behavior | Canonical replacement / acceptance |
| --- | --- | --- |
| `lib/server/legacy-calendar-service.ts`, `lib/server/scheduling.ts` | One-off, reschedule, home visit, make-up, recurrence, disable slot, protected past notes | Implement with `teaching_sessions` and `session_participants`; recurrence creates only canonical occurrences; roster/attendance/credit-linked history immutable |
| `lib/server/legacy-attendance-service.ts` | Single/bulk student cancel, teacher cancel, no-show, attended, notice timestamp, opt-in family messages, private/family notes | Expand canonical `session_attendance` to store **explicit** billing decision, notice timestamp and cancellation reason; no inference from unmarked, absent or generic cancelled status. Move parent-facing notes into teacher-owned per-session/per-student notes and use durable outbox receipts for mail |
| `app/api/schedule/{slots,lessons,attendance}/**`, teacher schedule UI | Private calendar CRUD, bulk attendance, explicit date+time and DST validation | Thin website wrappers of same revised domain service used by named MCP tools, revision/idempotency on changes and browser↔OAuth/MCP tests |
| `lib/server/unified-lesson-service.ts`, `lib/unified-lesson-history.ts` | Combined history, reports, possible cross-model duplicate warnings | One direct canonical session history query; remove dual-read/reconciliation and `legacy:` synthetic IDs only **after** finance/portal are moved. No hiding an active writer by altering report counts |
| `lib/server/billing.ts`, `lib/server/teacher-billing-operations.ts` | Policy charges per attended/no-show/cancelled student, flat/hourly rate, home-visit travel, regenerations and invoice lines | Derive from canonical session + individual attendance billing decision, freeze rate/visit provenance when applicable. The **billable identity** for a group is (session ID, student ID), unlike one teacher-time occurrence; atomic invoice and redemption commit must enforce both identities |
| `lib/server/credits.ts`, `lib/server/teacher-credit-service.ts` | Paid credit packages, expiry, earned/used make-up rights and remaining credits | Credit uses and make-up evidence attach to (session ID, student ID), with original specific student cancellation evidence; no shared-session credit double spend; preserve ledger, audit and guardian restrictions |
| `lib/server/lesson-cancel-email.ts`, `lib/server/invoice-send.ts` | Family cancellation, notes, invoice and bulk-email delivery | Resolve recipients from authorized student-contact relationships for a *specific session participant*; confirmed destination/amount preview and durable claim/outbox prevent repeated model-triggered sends; no secrets in MCP |
| `app/api/portal/[token]/**`, `app/api/feeds/[token]/calendar/route.ts` | Family view/cancel and subscribed ICS calendar | Authorize portal token **and** linked participant; allow only upcoming permitted student cancellation; teacher feed one event per session, family feed only approved student participation; stable per-session UID and local DST |
| `invoice_items.lesson_id`, `credit_redemptions.lesson_id`, `lesson_notes.lesson_id`, `lessons.makeup_for` | Foreign keys into second occurrence table | Remove old FKs only after canonical `session_id` plus `student_id` ownership and one-charge/one-redemption constraints are verified. The new schema must not retain shadow old-data columns |
| `docs/MCP_WEBSITE_PARITY_CHECKLIST.md`, `docs/MCP_NEW_PARITY_SCENARIOS.md`, `scripts/mcp-website-parity.json` | 93 historical + new cross-interface behaviors | Preserve existing case IDs; add individual fresh E2E for recurring DST, private/group billing, revision races, makeup/credit, guardian cancellation, mail and calendar feeds; zero incomplete teacher business routes before closure |

## Required current-schema semantics before deleting duplicate writer

1. `teaching_sessions` occurrence: immutable teacher/workplace, optional group
   or direct learner identity, **frozen roster**, slot+local-day recurrence
   provenance, make-up linkage, home-visit rate/fee evidence and updated
   timestamp. One slot/day materialization must be idempotent through service
   plus database unique constraint. Never double-book teacher or student
   silently. Existing completed history cannot be deleted by a slot update.
2. `session_attendance` per student: independent `status`
   (unmarked/present/absent/late/excused) and separately explicit
   `billing_outcome` (attended/no_show/student_cancel/teacher_cancel/null),
   cancellation notice timestamp and note. Being absent is **not** by itself
   a billable no-show; a teacher-cancel does not imply delivered teaching.
   Each correction uses a revision and stored idempotency receipt.
3. `session_student_notes`: family-facing text, teacher-private text and
   delivery receipt per student+session, with tenant and family permission
   safeguards. A group teacher note must not accidentally expose one learner's
   private information to another household.
4. `invoice_items` and `credit_redemptions` must reference the **same
   session-participant pair**, not merely a session UUID. A credit belongs to
   one learner, not all participants. Enforce one active invoice line per
   session/student/kind and one active redemption per covered learner.
   Existing paid/void/checkout/receipt protections must stay intact.
5. Financial reports use each group session's duration once for instructor
   hours, but bill/redeem each entitled learner individually. Parent-facing
   calendar events and email are filtered to that learner. Make-up credits
   must reference their original individual cancellation decision.

## Sequence / refusal boundaries

- Implement canonical fields/FKs and conditional tenant RLS, transaction
  services and private/group/ad-hoc billing tests first.
- Replace recurrence and calendar teacher web/MCP operations **together**,
  including local wall-time DST and simultaneous slot materialization.
- Replace billing, invoices/credits/make-ups, family notes, portal cancellation,
  subscribed feeds and synthetic external provider send behavior.
- Switch history/report/export to one direct session read. At that point remove
  `lessons`, `attendance`, `lesson_notes` and old FKs/SQL helpers from the
  **single fresh-install baseline** and source. Do not ship a view/bridge that
  disguises an old record as canonical.
- Run complete website↔delegated MCP and negative tenant/replay/permission tests,
  all 93 historical + all new cases, strict source/field parity, synthetic
  checkout/mail/Lichess tests, fresh database/Compose/backup restore. Audit
  actual `main` post merge before archiving. Never reset any real instance.

**2026-11-13 cutover result:** Old `lessons`, `attendance` and
`lesson_notes` physical tables, their second writers and the
synthetic `legacy:` history reconciliation are absent from the
strict-audited fresh-install/runtime model. Private/group/recurring
canonical sessions, attendance, portal, billing and backup tests run against
one canonical source. [CI/strict source audit](https://github.com/itshak/ChessCoachPal/actions/runs/43431098540)
and [229-passing authenticated E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43431098437)
are verified on the same implementation SHA. Separate parent blockers:
holiday/workplace schedule coverage, secure credential and subscription
handoffs, exact field/action closure, independently named new parity
scenarios and merged-main release tests. Do not assert full parity or
reset an existing real database.
