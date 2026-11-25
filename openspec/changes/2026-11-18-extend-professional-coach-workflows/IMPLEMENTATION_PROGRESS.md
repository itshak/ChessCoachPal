# Professional coaching workflows implementation inventory

Source scope as of 25 November 2026: this inventory separates current persistence,
connected website/MCP workflows, and unresolved behavior. The active locked
canonical baseline remains authoritative. Production migration, external report
delivery, consent changes, payment and release are outside this source work.

| Phase | Verified foundation | Remaining integration or acceptance |
| --- | --- | --- |
| Lesson close and corrections | Daily Coaching uses a frozen participant roster and a reviewed completion; exact atomic attendance and taught material was accepted in [#190](https://github.com/itshak/ChessCoachPal/pull/190). Teaching/workload and attendance are separate. Archived learners and pre-archive data are distinct. | Keep past unconfirmed sessions pending; document the professional transition matrix and correction controls. Never treat elapsed start time, missing attendance, or cancellation as a payment or evidence of teaching. Keep the pre-archive credit-policy decision in Temporal Enrollment. |
| Recurring schedule scopes | Existing canonical recurring-slot CRUD has desktop web/MCP evidence in `e2e/canonical-recurring-slots-parity.spec.ts`; the locked canonical source contains distinct original-date exception and scoped-series transactions. `e2e/schema-freeze-slot-edit-scoped.spec.ts` proves linked segment edits, stale review and rollback on disposable Auth/PostgREST. | Wire digest-bound scoped preview/commit, then original-date move, cancel and revocation in separate exact review slices. Preserve protected history, immutable original date, separate workplace, tutor-wide conflicts and DST failures. The initial scoped-series app work changes time/duration only and does not enable weekday or zone changes. |
| Report review and publication | Existing student progress reports and the scoped Portal are separate, and locked P0 holds immutable publication and audience rows with entitlement checks. Payload privacy and recipient activation are not supplied by a table alone. | Build an allowlisted, signed preview tied to explicit consent/contact grant at publication and read, then distinct revoke/supersede review. Do not project coach-private notes into reports, infer a recipient from relationship or payment, or send any notification. |
| Day-end, period review and packages | Daily action queue and canonical learner evidence cover some inputs already. Canonical package balances and expiry are visible in existing credit surfaces. | Provide bounded, optional focused review and clear routes; preserve unknowns, source scope and unconfirmed vs closed. Do not implement a second queue of truth or a general mandatory wizard. |
| Settlement and reconciliation | Native ledger provides approved obligations, exact recorded payments, allocations, reversals and read-only earning summaries. Compensation source [#162 acceptance](../2026-11-18-implement-workplace-compensation-and-billing/SOURCE_ACCEPTANCE.md) and `e2e/parity-finance-ledger.spec.ts` cover separation and replay with synthetic money. | Verify period-end reconciliation views and any gap in multi-obligation approval, then exactly one ordinary billing domain. Do not conflate earnings, obligation, received payment and allocated payment, or claim authorized legacy/admission/cutover. |

## Transition and approval boundary

- A recurring edit changes a future rule or eligible draft, not a completed
  lesson or a protected occurrence. A moved session retains its original
  local identity. Separate cancellation and attendance from billability.
- A missing or ambiguous local time, overlapping lesson, changed revision or
  unmatched identity requires a new review. Approval binds the reviewed
  exact date scope and digest to the same idempotency key. An uncertain
  response should retry exactly, not start another edit.
- A report recipient must have an independent approved audience scope and
  current portal access. No private notes, third-party delivery or new access
  follow from an ordinary progress report.
- Reversal and cash allocation remain explicitly approved and auditable.
  For 180 ILS owed and 60 ILS validly allocated, 120 ILS remains outstanding;
  attendance alone changes none of those receipt amounts.
