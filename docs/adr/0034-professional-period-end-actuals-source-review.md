# ADR-0034: Review exact monthly settlement source

**Scope:** Prior protected-base permit only under
[ADR-0020](0020-review-exact-preproduction-schema-successors.md). This
does not install the proposed schema, change the accepted lock, initiate
a financial operation or authorize deployment.

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

- Preserved [candidate source](https://github.com/itshak/ChessCoachPal/commit/db1bc5abd2e9993294dff282f42ff002a9f57b9c)
  `db1bc5abd2e9993294dff282f42ff002a9f57b9c`, sole parent
  `059ec422cdb361308e6228d081c19349db71e046`, exact tree
  `05ed395b4537f79822eab3bc84b00fc9f9d90329`. Only the canonical
  baseline, required-object manifest and disposable synthetic SQL proof
  differ. SQL SHA-256
  `a91c35f2fd3758df15413756cbb93c082b9d9b883652d40bfb7c2119ff5c117a`,
  manifest SHA-256
  `1c049893bb1377e64c55070fbe8cc983c77b86f40a4dbb9076a530d0baed1647`.
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
  `7a3a3d7a0ab06296f5cc6a93314bdb51f0d59403` passed the new signed
  category, payer, workplace, currency and keyboard case and two signed
  finance regressions. Storage object and bucket checksums remained
  unchanged. This does not replace exact final hosted runtime checks.

The [exact permit](../../scripts/approved-schema-freeze-successor.json)
precedes a separately verified activation. Website and MCP integration
still requires its own exact acceptance from the actual accepted base.
