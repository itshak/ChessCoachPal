# ADR-0030: Review exact atomic Daily completion with taught material

**Scope:** Approval only under [ADR-0020](0020-review-exact-preproduction-schema-successors.md). This decision replaces the permit and leaves the installed SQL, manifest, lock and all guards untouched. It does not enable a website/MCP feature, deployment, production migration, or release.

## Decision

A coach may explicitly approve closing an exact ended, scheduled lesson with
all individual decisions on its already-frozen roster, optional shared note,
and one existing active catalog material taught to explicitly selected present
or late learners. The transaction rechecks the owning teacher, original
workplace, current workplace selection, session and attendance revisions,
lesson date, and the named material's exact reviewed revision. It rejects
existing cancellation decisions and does not infer attendance, stages or
mastery, create materials or new sessions, or touch payments or messaging.

Reuse the existing completion and material transactions inside one database
call under the established advisory → teacher row → session sequence. A
shared lock validates the material revision; a concurrent edit returns a
bounded busy result and a changed revision requires review again. The outer
exact SHA-256 receipt replays before stale session/context checks. Server
child keys are not supplied by clients or used for replay. A failed second
write rolls back both child mutations and all receipts. Test evidence does not
claim universal deadlock freedom.

## Exact preserved source and verification

- Source [`6c5c85e127cefbd65d17fdac809399e938a44f29`](https://github.com/itshak/ChessCoachPal/commit/6c5c85e127cefbd65d17fdac809399e938a44f29),
  sole parent `d86bc81c7818c8c5e3b0f1abeed040e8f7a86612` and tree
  `a316f3b60573ab31e95df4947a22b620391a8a28`: exactly the single canonical baseline,
  its manifest and two disposable fixtures. SQL SHA-256
  `8b34bd598a656a4751423c75ee4f3fccb4837e642cb852494c24a63816de9c0d`;
  manifest SHA-256 `84393529d12108145c64ccd61cffe3503a0ed97e697ece4e146597603af1f258`. Previous accepted source remains in the ancestry.
- Independent warm application on the exact installed predecessor and clean
  PG17.12 canonical application matched Format 3 SHA-256
  `1e4260600a4b572e1dd04efaa7d3bbb31d9326de91689bbf176d04ac42f98f59`
  (predecessor `f7f2b77d630745aa5d447db90f7410b0149b597954be0446938a97d995c61ac5`).
  The sole new routine has only owner and authenticated EXECUTE entries; no
  broader ACL, relation, column, policy or sequence changed. Materialized row
  contract verifies 61 typed tables, 746 columns and no issues.
- Disposable SQL proof verifies real tenant/role denial, precise frozen
  individual and shared evidence, absence causes second-phase rollback, one
  valid completion and material link, exact replay and conflicting replay. It
  independently reads status, attendance, learner evidence and receipts.
  Six concurrency cases test identical and changed keys, independent request,
  workplace change, standalone material write and a material catalog edit.
  The first five observed a genuine lock wait. The catalog race refuses busy
  and then stale after that edit commits, with neither partial writes nor a
  receipt.
- A separately provisioned empty target restored the checksum-sealed logical
  database/Auth/Storage archive with the repository backup/restore scripts.
  Format 3 matched independently; synthetic private Storage HTTP bytes
  matched; the populated target rejected a second restore. The exact original
  SQL confirmation replayed on the restored Auth owner with the same receipt
  and unchanged persisted evidence. No production data, real provider access,
  physical-cluster recovery or operator cutover is claimed.

The [permit](../../scripts/approved-schema-freeze-successor.json) fixes the
exact previous and successor lock bytes. Application adoption is separate
and requires authenticated browser and delegated MCP evidence; operator
approval remains separate under [ADR-0017](0017-pre-v1-single-final-cutover-no-compatibility.md).
