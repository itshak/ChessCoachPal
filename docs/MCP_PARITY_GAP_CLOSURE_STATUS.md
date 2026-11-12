# MCP↔website parity closure: evidence-based implementation ledger

**Candidate stage:** 2026-11-12, PR #51 (draft, deliberately unmerged).
This document distinguishes **verified runtime behavior** from **newly coded,
not-yet-run** test obligations. It does not replace the original
93-case behavioral checklist, new chess-first matrix or the canonical OpenSpec.

## Accepted current-route behaviors

- **Verified runtime:** commit `a3af159a6c3759933993713b77c0f5b86ba832f5`
  completed all five workflow families: [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43163757030),
  [authenticated web↔delegated OAuth MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43163756881)
  (**188 passed, five skipped, zero failures**), [security](https://github.com/itshak/ChessCoachPal/actions/runs/43163756770),
  [fresh Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43163756792),
  [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43163756780).
- Five previously marked `gap` routes have retained their supported business
  functionality and now have current-schema, signed-in **real** browser/MCP
  evidence: events collection/item CRUD, guardians collection/item CRUD and
  portal-token rotation. See `e2e/parity-families-events.spec.ts`,
  `e2e/event-atomic.spec.ts`, `e2e/guardian-atomic.spec.ts`. Tokens are
  never returned to an MCP tool; no event/guardian mutation silently emails.
- Newly signed-off behavior cases, not yet the calendar cutover:
  `PARITY-calendar-attendance-atomic-replay`,
  `PARITY-calendar-bulk-replay` and `PARITY-studio-policy-fields-all`.
  Their exact-head evidence is recorded in `docs/MCP_NEW_PARITY_SCENARIOS.md`.

**Registry after these accepted reclassifications:** 28 complete, 17 partial,
14 gap among 59 teacher route families. That is a route classification, not
full field- or source-of-truth parity.

## New candidate implementation awaiting its own exact-head proof

1. `ccp_calendar_attendance_commit` now protects current private-calendar
   single and bulk attendance, revisions and retry receipts. This is an
   interim safety hardening; it does not legitimize the duplicate
   `lessons`/`attendance` completion model.
2. An all-fields studio policy E2E compares 33 ordinary persisted values
   across website and MCP, with 38/38 mapped fields enforced by source audit
   and four raw credentials explicitly browser-only.
3. Billing manual payment recording/reversal has extra cross-tenant and
   concurrent correction cases on the real synthetic database.
4. The spreadsheet suggestion website can request the same safe local
   header mapping as MCP; AI sample export still requires explicit teacher
   approval. A new case tests local equality and malformed samples.
5. Draft invoice corrections now use `ccp_invoice_draft_update` with a
   stable request UUID, changed-payload conflict, exact-head source revision
   and immutable receipt, shared schema on both transports. Existing
   invoice/PDF/credit protections remain. Tests cover cross-client replay,
   conflicting key reuse, concurrent invoice lines and unknown fields.

**Do not mark these new cases accepted or reclassify the outstanding invoice,
policy or spreadsheet routes until they pass CI plus authenticated E2E.**

## Blocking work before full OpenSpec acceptance

- **Stage B5/C2**: replace the parallel recurring calendar
  `lesson_slots`/actual `lessons`/`attendance` with the canonical frozen-
  roster `teaching_sessions` + per-student records, preserve recurrence,
  booking, make-ups, home visits, student billable identities and local DST.
  This is a domain cutover, not a registry edit. See
  `docs/CANONICAL_LESSON_CUTOVER.md`.
- **Stage C3/C4**: route all finance credits, invoice regeneration, delivery
  and family/portal email side effects through retry-safe, tenant-locked
  services, with a durable external-send receipt/outbox or a precisely
  explained unavoidable provider uncertainty.
- **Stage B4**: independent adult/junior guardian/contact/payer roles and
  portal permissions; existing family/guardian CRUD is not the new role model.
- **Stages C5–C10**: finish provider/AI/Lichess optional paths, typed
  learning/training/student/history corrections and every previously partial
  route with ordinary business-field parity, explicit approvals and negative
  cases. No shrinking the 93-case historical checklist.
- **Stages D/E**: only after source closure, run exact-head strict parity and
  all fresh synthetic, E2E, RLS, provider-mock, Compose and restore checks.
  Merge the integrated source, repeat evidence on merged `main`, archive
  OpenSpec only for completed scopes. No production database reset, official
  release tag, or live-provider acceptance claim.

All unverified work remains on the draft implementation branch. No test
passes or source classifications may be invented to close these gaps.
