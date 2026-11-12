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
 
## Coordinated finance parity batch — candidate only
 
A separate implementation branch adds the SQL receipt and website/MCP revisions for **generation, regeneration and configured checkout**, plus the actual billing UI and adversarial synthetic tests. Unlike simple tool-name parity, these implement database-owned identical/replayed writes, exact invoice revisions, and a single checkout link under concurrency. See `e2e/parity-billing-finance-receipts.spec.ts` and `e2e/parity-configured-stripe.spec.ts`.
 
The three entries in `scripts/mcp-website-parity.json` deliberately remain `partial` until successful execution on a stable commit; do not count them as verified now. Unfinished canonical lesson cutover, external delivery semantics, unrelated route families, historical 93-case matrix and final merged-main acceptance remain release blockers.

## 2026-11-12 — three finance route families independently accepted on stable PR #52 candidate

On source commit `155cdb014405d3ad25c86c814ceaac29a1da9764`, [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43238134655), [authenticated website/delegated MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43238134567) (**205 passed, five intentionally skipped, zero failed**), [security audit](https://github.com/itshak/ChessCoachPal/actions/runs/43238134563), [self-host Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43238134918) and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43238134615) all completed successfully.

Real website↔MCP and underlying SQL now establish duplicate-safe invoice generation, revisioned regeneration and provider Checkout linking with same-key replay/changed-key rejection, owner scoping, original invoice/credit preservation and a synthetic configured two-session Stripe race. These represent **three verified teacher route-family promotions** in the exact source inventory: **53 of 59 mcp**, **six partial**, **zero names-only gaps** (not the same as end-to-end complete product parity). Three newly indexed finance/checkout-guard behaviors have independently named accepted cases in `docs/MCP_NEW_PARITY_SCENARIOS.md`; the additional checkout-race row remains unchecked because its passing synthetic test is already used by an earlier historical case. Do not duplicate evidence.

The 93 historical cases are not automatically closed. Incomplete `agent/v1`, invoice PDF, invoice bulk, spreadsheet suggestions, studio policy and student record route families remain, alongside the independent canonical `lessons`/`attendance` cutover, guardian/credit histories and final merged-main gates. **No OpenSpec archive, main merge or release**. Live real Stripe/ChatGPT/Claude connection remains separate prepublication verification.

## 2026-11-12 — three additional route-family candidates and student lifecycle fixes

Finance source `3325b0` passed 207 authenticated E2E checks; synthetic AI source `95daf7` passed 208; student-delete source `dd311c` passed 209 authenticated E2E and all five workflows; combined head `ea1c810` passed 210 authenticated E2E, five skipped. Full combined branch verification and prepublication live-provider checks remain separate.

Private multi-page invoice PDF, consent-bound bulk SMTP and optional AI spreadsheet mapping are now accepted in independent authenticated browser/MCP tests, with explicit owner checks and no real secrets. Student deletion preflight previously referenced removed chess_learning_resources/chess_material_progress tables, preventing safe deletion even for empty profiles; the service now counts the current typed-material tables and awaits new E2E. The proposed technical inventory improves from **53/59 to 57/59**, while **two families remain partial**: `/api/agent/v1` (broad legacy website gateway) and `/api/settings/policy` (raw credential safe handoff).

**Release still blocked:** this route-family count is not completion of the separate 93 historical scenarios, new chess-first integration scenarios, canonical calendar writer/attendance cutover, or live ChatGPT/Claude/Stripe prepublication tests. Keep umbrella OpenSpec active and do not merge to main.
**Combined-source acceptance, 12 Nov 2026:** [PR #52 source ea1c8108](https://github.com/itshak/ChessCoachPal/commit/ea1c8108e3442837bdad9a64ff05df07ac35d2e2) passed [210 authenticated browser/MCP E2E tests](https://github.com/itshak/ChessCoachPal/actions/runs/43256956577) (five skipped, zero failed), plus [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43256956966), [security](https://github.com/itshak/ChessCoachPal/actions/runs/43256956336), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43256956228) and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43256956412). This verifies the 7-route family source slice, not complete v0.1.0 or live provider behavior.

