# Professional coaching workflows implementation inventory

## Reconciled source scope (2026-11-27)

The active locked canonical baseline remains authoritative. Release, external delivery and real funds are outside this source evidence. The original acceptance phases are distinct:

| Phase | Verified in current source | Still open or deliberately separate |
| --- | --- | --- |
| Lesson close and recurrence | [#190](https://github.com/itshak/ChessCoachPal/pull/190) uses reviewed frozen-roster and taught-material completion; [#196](https://github.com/itshak/ChessCoachPal/pull/196), [#198](https://github.com/itshak/ChessCoachPal/pull/198), [#200](https://github.com/itshak/ChessCoachPal/pull/200) and [#202](https://github.com/itshak/ChessCoachPal/pull/202) cover scoped edits, original-date move and cancel/restore, and bounded weekday changes. | An elapsed slot is still unconfirmed. No retroactive attendance, hours or billability follow from a scheduling change. Late redemption against archived credit is a separate pending product decision. |
| Publication and audience | [#204](https://github.com/itshak/ChessCoachPal/pull/204), [#208](https://github.com/itshak/ChessCoachPal/pull/208), [#212](https://github.com/itshak/ChessCoachPal/pull/212) and [#216](https://github.com/itshak/ChessCoachPal/pull/216) cover private preview/save, per-grant access approval, withdrawal and explicit supersession with no inherited grants. | Live ingress/log retention, real recipient acceptance and delivery are separate. No contact automatically gets access by paying or scheduling. |
| Day and period review | [#218](https://github.com/itshak/ChessCoachPal/pull/218) covers ended, still-unconfirmed lessons. [#220](https://github.com/itshak/ChessCoachPal/pull/220) covers upcoming expiry of issued positive prepaid units. [#226](https://github.com/itshak/ChessCoachPal/pull/226) covers current posted settlements; separate fixed-period unposted review is covered by the signed period review test. | Neither an expiry window nor a schedule projects when credit will be exhausted. An unposted hourly/participant forecast is not settled cash. No generalized intake workflow or new persistence is required by this acceptance record. |
| Settlement | The [compensation source acceptance](../2026-11-18-implement-workplace-compensation-and-billing/SOURCE_ACCEPTANCE.md) and signed native ledger case verify eight learners with one 180 ILS coach earning, separately recorded synthetic payment, partial allocation, reversal and replay. The existing allocation RPC takes one payment and one obligation per approval. | A reviewed multi-obligation batch is not exposed. Keep separately approved allocation as the supported action; don't chain calls and call the batch atomic. If a batch is required, review locking, scope, replay and any canonical contract separately before implementation. |

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

### Private teacher-only learner report preview

[PR #204](https://github.com/itshak/ChessCoachPal/pull/204) merged exact
candidate `724bf58be22af7fb6a131dbdfb9c0ec4c2f003d2` at
`b7a0ef9236df8588d36a183c8c3b58bd9acd7fdf`. A signed teacher explicitly
selects one owned learner, one owned workplace, a date range and output
language. The website and delegated read tool project only completed
lessons with a frozen roster and recorded local dates, with the selected
learner's attendance. Unrecorded is not absent. Notes, other learners,
identifiers, imports and financial state are not candidate output.
The preview is live and read-only, not a sealed report or a sharing grant.

The disposable production-mode build on aiserver passed the new signed
browser/HTTP/MCP evidence and the older learner-evidence regression, with
unchanged Storage object and bucket tables. Exact hosted
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45564452189),
[security](https://github.com/itshak/ChessCoachPal/actions/runs/45564452223),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45564452311),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45564452204)
and [authenticated E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45564452168)
passed (455 cases plus three scheduling repeats). The schema freeze and
transition manifest are unchanged. Saving a sealed report, approving a
recipient, portal reads, revocation and supersession remain unaccepted.

### Save and reopen a reviewed private learner report

[PR #208](https://github.com/itshak/ChessCoachPal/pull/208) merged exact
candidate `fac79ca37bc21c9cdaea03d3c5ad6b83cdb72f71` at
`3a0693d79f800e784c58bf4656576d62a6ec6ad1`. A teacher with the existing
report publishing entitlement can explicitly save a reviewed attendance
candidate for one owned learner and workplace. Approval is bound to the
candidate and its source revision. A source substitution that preserves the
displayed counts invalidates the prior approval. An exact replay after a
lost response returns the original receipt without another publication.
The signed website and delegated MCP match the sealed result; a fresh
signed browser context reopens the saved version after corrections without
recomputing it from current attendance. Private listings are limited to the
newest 30 reports for the learner, with truncation signaled.

[ADR-0031](../../../docs/adr/0031-private-learner-report-seal-source-review.md) was
accepted separately in [PR #206](https://github.com/itshak/ChessCoachPal/pull/206)
and activated at the repository level by [PR #207](https://github.com/itshak/ChessCoachPal/pull/207)
after disposable fresh, warm, restore, scope and concurrency checks.
The application change did not alter the accepted schema lock.

The two signed private report scenarios passed against the disposable
production-mode build, with independent checks showing unchanged Storage
objects and buckets. Exact hosted
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45581817696),
[security](https://github.com/itshak/ChessCoachPal/actions/runs/45581817701),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45581817661),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45581817977)
and [authenticated E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45581817763)
passed (456 cases plus three scheduling repeats). No report audience,
portal access, delivery, billing, or deployment occurred. Explicit
recipient approval, portal reads, revocation and supersession remain
separate, unaccepted scope.

### Approve and withdraw access for one existing portal link

[PR #212](https://github.com/itshak/ChessCoachPal/pull/212) merged exact
candidate `8d27bc4d268620ea9614467fbcf970d71a32c02c` at
`b91051fa7bdc116f5f7e9b952f0c0aaff76577e7`. The signed website and delegated
MCP share review, approval and withdrawal for one explicitly selected
existing eligible link and one previously sealed report. A renamed
recipient invalidates the exact prior review; retrying an uncertain result
returns the existing approval instead of creating another audience.
A linked contact without that approval cannot see the report.

The server-rendered guest page shows only the allowlisted saved facts in
the report’s chosen language. Synthetic guests for a different learner
or linked-but-unapproved guardian see no report. A teacher can withdraw
one exact approval even after the publishing entitlement ends. The
private copy and other permissions stay intact. There are no link,
notification, finance or Storage writes from this workflow.

[ADR-0032](../../../docs/adr/0032-private-learner-report-audience-source-review.md)
received its separate prior permit in [PR #210](https://github.com/itshak/ChessCoachPal/pull/210);
[PR #211](https://github.com/itshak/ChessCoachPal/pull/211) activated the
reviewed exact preproduction schema in source only. The application PR
left the accepted lock unchanged. Independent disposable production-mode
runs passed both signed report cases with unchanged Storage tables. Exact
hosted [CI](https://github.com/itshak/ChessCoachPal/actions/runs/45600178301),
[security](https://github.com/itshak/ChessCoachPal/actions/runs/45600178141),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45600178292),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45600178300)
and [authenticated E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45600178266)
passed (457 cases plus three scheduling repeats). Whole-publication
revocation and correction by explicit supersession remain separate, along
with any real recipient operation or deployment.

### Withdraw or supersede an exact saved report

[PR #216](https://github.com/itshak/ChessCoachPal/pull/216) merged exact
candidate `c03f95d24fe911a2de93089545298f0e8897ace3` at
`0b65642bcf2109b17c8f0b0f0c95f1a5310769fd`. The website and delegated MCP
review the exact saved artifact, an optional separately sealed correction,
and the current set of previous approvals. A changed approval forces a
new review. A lost response can retry the exact approved request without
duplicating the lifecycle result. The original remains available in private
history. Whole withdrawal removes all access to that version, and
replacement never transfers access; correction is not delivery. An
entitlement downgrade does not remove the coach’s ability to withdraw.

[ADR-0033](../../../docs/adr/0033-private-learner-report-lifecycle-source-review.md)'s separate prior permit was accepted in
[#214](https://github.com/itshak/ChessCoachPal/pull/214); its exact
preproduction source was activated by
[#215](https://github.com/itshak/ChessCoachPal/pull/215)
after fresh, warm, restore, replay and concurrency checks. The application
PR preserved the accepted schema lock. The three signed report cases
passed in a disposable production-mode build with independently unchanged
Storage. Exact hosted
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45621695994),
[security](https://github.com/itshak/ChessCoachPal/actions/runs/45621695844),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45621695970),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45621695965)
and [authenticated E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45621695895)
passed (458 cases plus three scheduling repeats). No live migration or
deployment, real recipient, notification or access approval occurred.

### Optional day-end review of ended, unconfirmed lessons

[PR #218](https://github.com/itshak/ChessCoachPal/pull/218) merged exact
candidate `561ed2dd22a7ef35876b1d0e4cb85faad908c185` at
`117d8ffaa5ab58923649923f2c56698caa61b529`. The Dashboard, signed
HTTP and delegated MCP use the same bounded frozen-roster scan. The
teacher can open an optional review for a specific civil day. An ended
lesson still marked scheduled stays on the list even if every
attendance decision is recorded. A missing or oversized roster stays
unknown; one group is one row; closed, in-progress and cancelled lessons
do not appear. Scope, truncation and canonical resolution links are
preserved. The view does not change or infer closure, attendance,
teaching or charges.

The exact disposable production-mode build passed the new review and
both earlier attendance/close cases with unchanged Storage. Exact hosted
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45631899784),
[security](https://github.com/itshak/ChessCoachPal/actions/runs/45631900979),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45631899635),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45631899719)
and [authenticated E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45631899640)
passed (459 cases and three scheduling repeats). The source change
preserved the schema lock; no deployment, closing, or billing occurred.
The package-expiry and period-reconciliation parts of the work remain
independent.

### Optional workplace prepaid-credit expiry review

[PR #220](https://github.com/itshak/ChessCoachPal/pull/220) merged exact
candidate `f23944d650a094fd3f11bcb5f05331a3427699b9` at
`b2a3c65da22d13eb8c1e25e5082879b5e872f4af`. The optional Dashboard
panel, signed HTTP and delegated MCP read the same bounded review.
It uses the selected owned workplace's recorded civil date, applies
the latest effective expiry extension, and reports factual positive
unredeemed units of issued packages for active scoped learners.
Unknown or oversized results are not treated as empty. This is not
a forecast of exhaustion, proof of funding, authority to spend, or
permission to modify archived credit.

The exact disposable production-mode build passed all four signed
cases (new expiry, earlier day-end and both credit adjustments), with
unchanged Storage. Exact hosted
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45645489135),
[security](https://github.com/itshak/ChessCoachPal/actions/runs/45645489049),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45645489042),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45645489012)
and [authenticated E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45645489032)
passed (460 cases and three scheduling repeats). The schema lock is
unchanged. No deployment, redemptions or charges occurred.
Period-end reconciliation remains independent.

### Current settlement of posted monthly obligations

[PR #226](https://github.com/itshak/ChessCoachPal/pull/226) merged at
`1d0de5d876e261ab6d3a08e96f96888273203970` on verified exact head
`aeb6ed474e6cac47e22ebd883bcdfb53a4aa5bee`. One owned workplace, month,
currency and optional payer filter the current settlement of posted coaching
earnings, fixed-period compensation and participant charges separately.
Corrections, applied allocations net of reversals, and outstanding balances
are shown without implying historical as-of settlement, account cash received,
projections or authority to alter the ledger. Signed website/MCP agree.

[ADR-0035](../../../docs/adr/0035-professional-period-end-manifest-checksum.md)
was permitted separately in [#224](https://github.com/itshak/ChessCoachPal/pull/224)
and activated in [#225](https://github.com/itshak/ChessCoachPal/pull/225).
The application patch preserved that lock. Exact hosted
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45694275231),
[security](https://github.com/itshak/ChessCoachPal/actions/runs/45694275374),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45694275491),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45694275472),
and [authenticated E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45694275370)
passed with 461 browser cases plus three repeats. Both independent
production-mode signed test runs preserved Storage. This is source acceptance
only; no live configuration, data, payments or access changed.
