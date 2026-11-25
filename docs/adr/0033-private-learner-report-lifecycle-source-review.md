# ADR-0033: Review exact whole learner report lifecycle source

**Scope:** Prior protected-base permit only under
[ADR-0020](0020-review-exact-preproduction-schema-successors.md). This
review does not install the proposed schema, change the accepted lock,
affect a live report, or authorize deployment.

## Decision

Keep whole-report revocation and correction distinct from withdrawing one
recipient's approval. The signed teacher can review the exact old
artifact, the number of prior approvals not individually withdrawn, and
the optional exact private replacement. The count is not a claim that all
those links still work. The review changes nothing; a confirmation binds
the chosen transition, both immutable report identities and revisions,
and the applicable audience state to one digest. Stale review is rejected.

A corrected version is a separately sealed, strictly newer artifact for
the same teacher, learner and workplace, with no previously bound
audience. The original is never overwritten or exposed after a terminal
decision, and the replacement never inherits access. Both original and
replacement are still independently readable by their owner. No guest
link, notification, entitlement, finance row or Storage object is created.
Both safety actions remain available after the publishing capability ends.

The transition reuses the existing report publication state and durable
teacher operation receipt. It acquires the teacher lock already used by
sealing and audience approval, then locks exact publication/audience rows
in a stable order. An identical retry returns the original decision even
after a later change to the replacement. A conflicting request key or a
new approval after the review cannot partially modify the old report.
There are no new tables, columns, indexes, triggers or existing ACL changes.

## Exact source and disposable evidence

- Preserved [candidate source](https://github.com/itshak/ChessCoachPal/commit/b2c785cf925ee2f096344a95ff95d323c5bf346a)
  `b2c785cf925ee2f096344a95ff95d323c5bf346a`, sole parent
  `b91051fa7bdc116f5f7e9b952f0c0aaff76577e7`, exact tree
  `9f8d0f2b2ae43df8467ce73b0f2809e3ca7fd908`. Only the canonical baseline,
  transition manifest and the two disposable proofs differ. SQL SHA-256
  `fa68647bd5b6920b5813ed3090da6ac4d1c083f7f31c018041999b7f8a04404d`,
  manifest SHA-256
  `e9af806ac4f7803a1f2b94d961bb2151e77ffbd5bb66a6701964c191cf3ff638`.
- Warm verification from the exact accepted predecessor, a fresh
  PostgreSQL 17.12 install and a separate initially empty checksum-sealed
  logical restore matched full Format 3 public structure
  `cb295160ff16c527082af39a11f0f19315364c613ab3de4243c09d3e2cb758ec`
  and the predecessor was
  `2e2d8fbc8d774c80db875fb68a863dc49b5c6b733cd10b8329d2afca78080c78`.
  Differences were exactly three routines and their five function ACL
  entries, with signed review and commit granted only to authenticated
  callers apart from the owner; neither anonymous nor service consumers
  receive these entry points. Independent typed verification covered 61
  tables and 748 columns with zero issues.
- Synthetic evidence verified no side effects from review, foreign owner
  denial, legacy and self replacement denial, changed audience impact
  invalidating earlier review, explicit confirmation, exact and conflicting
  retry, continued owner read-back, no inherited guest permission and
  revocation after a publishing downgrade. The two concurrent cases
  observed actual lock waits: one exact replay produced one terminal
  receipt; an intervening audience approval left the other publication and
  lifecycle receipt unchanged. This is not a claim of exhaustively tested
  concurrency.
- The independent archive restored matching report, sealed snapshots,
  audience and receipt rows and exact guest denials; separately checked
  Storage contained zero objects and repeating the restore into the now
  populated target was refused. This is not populated-beta, off-host or
  real guest acceptance.

The [exact permit](../../scripts/approved-schema-freeze-successor.json)
precedes any separate activation. Website and delegated MCP integration,
real recipients and release/production operations remain outside this
review.
