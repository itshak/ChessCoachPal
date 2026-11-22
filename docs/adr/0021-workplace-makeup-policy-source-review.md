# ADR-0021: Reviewed preproduction workplace make-up policy successor

**Scope:** This review permits one exact preproduction source-lock successor under [ADR-0020](0020-review-exact-preproduction-schema-successors.md). It does not unfreeze other files, alter the current schema on its own, or authorize a deployment, release, live migration, or billing activation.

## Product decision

An owned workplace may set an integer make-up notice window (0–8760 hours) or explicitly inherit the typed teacher setting. Effective fallback with no setting is 24 hours. Use the lesson's recorded owned workplace, not the teacher's current selector or the proposed replacement venue.

New student cancellation decisions record the applicable window, source lesson start, timely/late make-up flags, and observed provenance. The database computes the exact cutoff conclusion. Later setting changes cannot reinterpret those terms; audit evidence is retained and corrected/replayed through the existing boundary. Older rows without terms keep their previous account-level behavior, not a fabricated workplace snapshot. Teacher cancellation/no-show and existing posted money, rates and classifications remain unchanged. The guest text describes make-up notice, not a new payment rule.

Teacher-authored portable restore is not attestation: claimed terms remain informational when restored as unverified and never automatically authorize make-up bookings, invoices or credits; matching verified existing rows remain protected. A physical backup preserves actual recorded provenance and evidence.

## Exact approval scope and independent evidence

- Accepted candidate [`c960a47ba72758cba9a20861ba033d874edffbbb`](https://github.com/itshak/ChessCoachPal/commit/c960a47ba72758cba9a20861ba033d874edffbbb), source tree `3d5d6f28978e27ad98cc95c4b75b06be1a73b4ec`. Canonical SQL SHA-256 `94511e25acb5149f6c84a901814f34137cd425c2f9d91ed6989787db7a8cc90b`; manifest SHA-256 `02da6400dc8ff98e169daa97ee48ff18b6d676ab77ee84a8daa45911d1c54a80`.
- Signed browser, guest and delegated MCP assertions cover explicit zero/inheritance and live form persistence, owner and foreign venue boundaries, exact versus one-millisecond-late cutoff, guest retry, stored policy after changes, portable unverified denial, and successful signed booking/replay. Durable seeded SQL checks cover legacy NULL, 24-hour fallback, preserved authentic history and failed unauthorized automatic finance actions. Local checks passed 561 unit cases, 66 schema guards, strict parity, type and source audits.
- Two independently bootstrapped PostgreSQL 17.12 databases matched Format 3 SHA-256 `961b2e7caad05e5cc96b3a63fc999e2367ace0eb08918a715a8ccfe94aec8d96`, with zero differences. Each passed actual effective ACL and 60 Row contracts/737 columns. The sealed physical backup restored into the second disposable installation preserved the observed decision and generated result after the venue setting changed, with identical associated audit evidence. Resources were removed. Test-only and documentation overlays keep those SQL and manifest bytes unchanged.
- Approval lives in the separately reviewed base [permit](../../scripts/approved-schema-freeze-successor.json). The old installed lock stays active until a later feature commit matches both exact lock digests and the exact hosted verification passes. A subsequent unrelated edit cannot reuse this permit.

This does not include operational data restoration, provider activation, billing change approval, or private beta cutover.
