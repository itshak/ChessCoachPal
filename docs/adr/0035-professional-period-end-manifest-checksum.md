# ADR-0035: Correct the monthly settlement source manifest checksum

**Scope:** Prior protected-base permit only under
[ADR-0020](0020-review-exact-preproduction-schema-successors.md). This
does not install the proposed schema, change the accepted lock, initiate
a financial operation or authorize deployment.

This supersedes the exact permit recorded by
[ADR-0034](0034-professional-period-end-actuals-source-review.md). The
earlier activation draft did not land: the transition manifest still
declared the predecessor SQL checksum. Correct only
`baselineSha256` to match the already reviewed new SQL bytes; the
disposable fixture and executable schema SQL are byte-identical. The
previous permit does not authorize this new manifest or lock. The
unchanged current lock is required until a later separately verified
activation.

## Decision

Provide an optional, read-only view of the **current** settlement of
posted obligations for one owned workplace, one full calendar month, one
currency and optionally one exact owned payer. Keep coaching earnings,
fixed-period compensation and participant charges separate. Use the
frozen source date for occurrence obligations and the approved complete
month for fixed-period obligations. Include only actual approved
obligations and allocations linked to them, net of recorded corrections
and reversals. Do not assign unallocated cash to a workplace, imply a
month-end historical cutoff, or present expected earnings as money
received. An empty result is not evidence that everything pending has
already been approved.

A separate STABLE SECURITY INVOKER RPC reads the books in one consistent
database snapshot. The existing capped activity list cannot certify
complete totals, and independent round trips could combine different
settlement states. The existing earnings summary remains unchanged.
Owner and scoped payer checks, existing tenant policies and a bounded
period apply before returning data. There are no new tables, columns,
indexes, triggers or changes to any existing ACL.

## Exact source and disposable evidence

- Preserved [candidate source](https://github.com/itshak/ChessCoachPal/commit/51d124fd8cba172462f9e9248e97cf95386cca89)
  `51d124fd8cba172462f9e9248e97cf95386cca89`, sole parent
  `29b54b816696ee6a4adbbfb91cf8c1a244d7833e`, exact tree
  `28db1af20e5331d46f7bb7b8ef5925641f3ab3f7`. Only the canonical
  baseline, required-object manifest and disposable synthetic SQL proof
  differ. SQL SHA-256
  `a91c35f2fd3758df15413756cbb93c082b9d9b883652d40bfb7c2119ff5c117a`,
  manifest SHA-256
  `5297bd8a8faa0d92eddbb701c020183ab619b3d0633e5034ac96893ee389bd8e`.
- Warm verification from the exact predecessor, an independent fresh
  PostgreSQL 17.12 installation and a separate initially empty official
  logical restore agreed on full Format 3 public structure
  `3cc057dc36af943da61453976ec8792f562b03be972f00444491f2c7466e68d7`.
  The predecessor was
  `cb295160ff16c527082af39a11f0f19315364c613ab3de4243c09d3e2cb758ec`.
  Only the new routine and its owner/authenticated execute entries were
  added. Anonymous and service roles cannot use the routine. Typed
  verification covered 61 tables and 748 columns without issues.
- Independent restore reproduced the synthetic obligation, receipt,
  allocation, reversal and signed output state
  `a2cf9071c49547cc4ff2ca952b2c8d9d0bb8f8a5bb233b53cf3474f81577844a`.
  Repeating the restore into the populated target was refused, and
  Storage held no objects. The disposable fixture checked exact
  leap-month boundary, prior earnings parity, reversals, corrections
  and ownership. No real or populated-beta database was used.
- The provisional exact website/MCP tree
  `25305511cbb9cf20625b5fec833fd315c7d0661e` passed the independent
  canonical checksum guard and three signed Chromium cases against
  the corrected manifest, including the new monthly reconciliation
  and both finance regressions. Storage object and bucket checksums
  remained unchanged. The local canonical-guard suite passed all 67
  tests. This does not replace exact final hosted runtime checks.

The [exact permit](../../scripts/approved-schema-freeze-successor.json)
precedes a separately verified activation. Website and MCP integration
still requires its own exact acceptance from the actual accepted base.
