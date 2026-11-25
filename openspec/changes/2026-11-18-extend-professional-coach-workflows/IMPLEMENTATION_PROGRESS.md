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

## Verified implementation: reviewed scoped series timing

[PR #196](https://github.com/itshak/ChessCoachPal/pull/196) was verified
on merged source `d09ab4e64cb983d57aa24044b3bf54f1c189e67b`. Website
and delegated MCP review time or duration changes from an original
local date forward, or for all still-editable segments. The canonical
transaction binds the exact reviewed scope and timing, and requests a
new successor ID only if it needs to split a segment. Approval is
explicit. Retrying a lost response returns the original receipt; the
historical section stays in the original rule. Synthetic signed
read-back compared the exact rule boundaries and one successor.

Exact candidate `0cab7c075caa680af67f5b5d63ba6bd4624732cd` passed
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45537592612),
[security](https://github.com/itshak/ChessCoachPal/actions/runs/45537592590),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45537592548),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45537592547)
and [authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45537592581)
(451 browser cases and three scheduling repeats). No change to the
installed schema source, no deployment, and no financial or attendance
writes. This does not yet connect one-original-date exceptions or change
weekday, timezone, billing rates, published reports, or legacy data.

## Verified implementation: move one original date

[PR #198](https://github.com/itshak/ChessCoachPal/pull/198) was verified
on merged source `ad7a96ca76eee937eb156bd67ced3135b19289ae`. The website
and delegated MCP use the exact original slot and local date for a
reviewed, digest-bound move of an unmaterialized occurrence. The
canonical move creates one scheduled lesson and the occurrence
exception. It does not modify the recurring rule, mark attendance,
create a balance, or spend credit. An already materialized date stays
in the existing lesson reschedule workflow. A lost response retries
the exact approved request.

The synthetic signed test includes Jerusalem's daylight-saving change:
the earlier scheduled lesson keeps its original offset and remains
untouched, and the moved lesson uses the destination's local time and
offset. Independent reads checked the exception, the fixed original
date, the earlier lesson, the unrelated rule, and the absence of
attendance and financial records.

Exact candidate `78bd647f5ca8c30d792d2520d18d2343812eb26d` passed
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45543704996),
[security](https://github.com/itshak/ChessCoachPal/actions/runs/45543704930),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45543704937),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45543705052)
and [authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45543705000)
(452 browser cases and three scheduling repeats). The accepted schema
lock is unchanged. Single-date cancellation and revocation, bounded
weekday choices, and report and finance workflows remain separate work.

## Verified implementation: cancel or restore one original date

[PR #200](https://github.com/itshak/ChessCoachPal/pull/200) was verified
on merged source `6e9d205f0a582740d922dd6ad419cd31bc263c4d`. The website and delegated MCP use a
signed owner-scoped, no-write review of the exact original local date,
with the current rule timestamp or audited cancellation revision.
Native cancellation and revocation recheck approval, ownership and
eligibility. Existing generated lessons use their own actions. A lost
response retries only the exact approved request.

The synthetic signed round trip independently confirmed one original
exception with its original approval and later revocation intact, and unchanged earlier and
neighboring schedule rows. Separate calendar generation skipped just
the canceled date and later restored just that original date. Neither
command generated a lesson on its own, created attendance, or touched
charges or credit. Date matching used the local occurrence date even
when its UTC start belonged to the prior date.

Exact candidate `0c0b2c7c9d4ffad2c147049e44b728c8e264a6c3` passed
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45552911175),
[security](https://github.com/itshak/ChessCoachPal/actions/runs/45552911285),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45552911242),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45552911262)
and [authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45552911208)
(453 browser cases and three scheduling repeats). The accepted schema
lock is unchanged. Bounded weekday changes and report and finance
workflows remain separate work.

### Bounded recurring weekday review and approval

[PR #202](https://github.com/itshak/ChessCoachPal/pull/202) merged exact
candidate `555dfcee65f752f978ab1c2d4179d565b1155a7c` at
`066cee56b7712df0057e845cf885a33669301b28`. For changes to weekday only,
the signed website and MCP display the native reviewed original and
proposed dates as separate lists for each affected segment. Those lists
need not be the same length. Approval binds the complete preview;
attempts with missing finite evidence, protected occurrences, invalid
scope, or stale review fail without writes. Earlier lessons and unrelated
workplaces remain unchanged. Existing time/duration edits still work.
Attendance and finance are not changed, and there is no timezone rewrite.

Disposable signed verification on aiserver passed both the new weekday
and existing scoped time/duration scenarios. Exact hosted
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45557795512),
[security](https://github.com/itshak/ChessCoachPal/actions/runs/45557795576),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45557795510),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45557795621),
and [authenticated E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45557795459)
passed (454 cases plus three scheduling repeats). The schema freeze and
transition manifest are unchanged. Privacy-safe report review and finance
workflows remain separate, unclaimed acceptance scope.
