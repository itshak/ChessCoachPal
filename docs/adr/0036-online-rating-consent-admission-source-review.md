# ADR-0036: Review exact online rating consent and admission source

**Scope:** Candidate review and a protected-base permit only under
[ADR-0020](0020-review-exact-preproduction-schema-successors.md). This
permit does not install the candidate, change the currently accepted lock,
create a scheduler, call a provider, or authorize a deployment.

## Decision

A saved public account does not imply consent to standing background reads.
Reuse the existing provider-scoped consent, queue and receipts. The internal
consent command verifies the exact owned saved username, current identity
epoch and provider consent revision. A successful explicit opt-in and its
first job commit together. An exact replay of an old accepted opt-in may
return its historical job but cannot restore permission. Exact revoke
replay is supported while that request is still the most recent decision.
Archiving retires both permissions in the learner transaction; reactivation
does not restore them. Changing only one saved handle retires only that
provider's permission. Existing rating snapshots are not changed.

Add an internal, read-only, single-statement fresh admission check for an
exact current supported lease, recorded consent, active provider and
currently saved public handle. Check again independently when finalizing.
Revocation before the fresh database read prevents the subsequent provider
request. This does not provide a lock across a network call or recall an
already transmitted request. Background history is outside this first
protected schema slice. The new functions run with invoker permissions;
the only non-owner execute grant is to the service role.

## Exact source and disposable evidence

- [Preserved candidate](https://github.com/itshak/ChessCoachPal/commit/8a1be97d5fbd06632a3a2bbc6dd897ebb9822a80)
  `8a1be97d5fbd06632a3a2bbc6dd897ebb9822a80`, sole parent
  `5626e69d19cfaf77c601048722258d82230f1ed1`, exact tree
  `b5473506f7ef222e9e28c6e1380adf18d19da319`. The baseline, transition
  manifest and four synthetic regression files differ; the accepted lock
  is unchanged in this commit. An independent fetch confirmed the remote
  commit has the same predecessor and exact tested file tree.
- Baseline SHA-256
  `332ed35cbb4fe5db3f6084e804d7e6e8c906dd431f8d7f3eb730efe771549bcc`,
  manifest SHA-256
  `572782090b7c7d806a988a11aa67b7546230df75800d69fa7a8401e5c78c9352`.
  The unchanged current lock SHA-256 is
  `7e15f244c9f23d79430d42a3f4c3a8dedae8938c368b895f99b30364ddccf3fc`;
  the exact proposed successor is
  `c515ea4c089897f9def5b583916355f74eb54b13ab6220f7f8f16be1b2eca8e7`.
- Two independent disposable PostgreSQL 17.12 fresh installs of those
  SQL and manifest bytes returned the same full Format 3 digest
  `505de99cf86b73c279e10b5ce89217fd3aaeece2f817da5d4b6f2d3df08cb2a7`,
  versus the exact predecessor
  `3cc057dc36af943da61453976ec8792f562b03be972f00444491f2c7466e68d7`.
  The delta is two new routines and their four ACL entries, the existing
  handle-change routine and its watch trigger. No tables, rows, indexes,
  connection settings or grants on existing objects changed in the
  schema definitions.
- Synthetic tests exercised archive/reactivation with both providers,
  provider-specific handle changes, unrelated saves, current lease denial
  cases including revoke and unsupported backfill, safe replay, stale and
  foreign ownership handling, and atomic first-job creation. Two distinct
  sessions showed no partial uncommitted state and a typed competing
  lock response. An intentionally rejected queue insert rolled back
  consent; an exact retry created one job and one consent. Verified 61
  declared row contracts and 748 columns against the fresh catalog,
  with no mismatches.
- An independent initially empty, newly provisioned disposable stack
  restored via the repository checksum-verified scripts. Format 3 and
  complete selected consent/job/Storage states were identical; an owner
  authenticated with the new stack's secrets and read the original
  synthetic private Storage upload byte-for-byte. Replaying a revoked
  provider's old opt-in did not re-enable or permit its job. An unaffected
  provider remained claimable, and a second restore into the now populated
  target was refused. No existing beta data or release was involved.

Website and delegated MCP adoption, worker registration and scheduling,
provider approvals and usage policies, history and actual populated or
off-host acceptance remain separate. A successor must be activated from
the protected base only after separate review and exact CI.
