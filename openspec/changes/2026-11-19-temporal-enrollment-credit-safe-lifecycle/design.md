# Design: temporal enrollment and prepaid entitlement

## Enrollment
Extend existing `workplace_enrollments` (not a second competing history table). Use inclusive user-facing dates `starts_on` and `ends_on` but half-open PostgreSQL `daterange(starts_on, ends_on + 1, '[)')` for non-overlap. Future cancelled rows require `cancelled_at`, `cancel_reason`; current/previous/future status is derived from dates and cancellation. Preserve legacy unknown starts explicitly, without manufacturing dates. New rows require starts_on. Teacher-local date is used for status. Exclusion constraint on teacher/student/workplace plus date range, ignoring cancelled rows. Existing student/workplace and tenant ownership checks remain.

## Archive preview and commit
Preview student revision, all current and future enrollments, recurring slots, future teaching sessions/participants, group memberships, credit packages with remaining units, invoice payment status, refund/dispute status and expiry dates. Block until every conflicting commitment has an approved disposition. Archive commit atomically closes ongoing memberships effective immediately, cancels future ones with audit, resolves commitments, archives student. No implicit credit consumption or financial write. Credit holds are implicit eligibility restriction from archived status plus explicit auditable hold reason; do not mutate original purchase validity dates. If original expiry passes during hold, show expired on return; any extension requires explicit policy and audited adjustment.

## Credit accounting
Existing `credit_packages` has teacher/student/invoice/workplace, credits, duration, price, starts_on/expires_on. `credit_redemptions` records one session redemption; balance is purchased credits minus valid redemptions and separately recorded explicit adjustments. Need to inventory cancellation/return receipts, invoice payments and refunds before deciding exact new ledger/adjustment table. Use immutable credit-adjustment events for transfer, forfeiture, refund or expiry extensions, with transaction-safe balance constraints and unique idempotency keys. Do not equate invoiced with paid; no transfer or refund without payer/account verification. No financial side effects from archiving by default.

## Reactivation
Preview each last completed enrollment per workplace (possibly several), plus held/expired credits and any future plans. Require explicit selected workplace IDs and start dates; commit reactivates and inserts fresh enrollment periods, without auto-redeeming credits. A package may be scoped to a workplace but never itself creates enrollment. For a package from a closed workplace, teacher must explicitly transfer or amend entitlement, not guess.

## MCP
Typed structured clarification: `code`, `missingFields`, `choices`, `previewDigest`, `expectedRevisions`, `retryTool`. Never flatten an expected ambiguity into a generic error. All mutation paths call the same service as website and database RPC, with idempotency and transactional enforcement.

## Data transition
The live-private-beta database has 28 students, zero current enrollments, 167 Yatmal historical attendance evidence rows (27 students); neither inspected DB has credit packages/redemptions as of 2026-11-19. Historical attendance is evidence only. Do not backfill active memberships from it automatically. Freeze candidate and checksum must be revised and tested on disposable DB before a single operator-approved cutover.
