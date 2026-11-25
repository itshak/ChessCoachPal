# ADR-0032: Review exact private learner report audience source

**Scope:** Exact protected-base source permit only under
[ADR-0020](0020-review-exact-preproduction-schema-successors.md). This review
does not install the candidate schema, change the current lock, grant
anyone report access, or authorize a live migration or deployment.

## Decision

A saved attendance summary stays private unless the teacher independently
reviews and approves its exact learner, workplace, snapshot and one
already-issued, current portal grant. An active contact relationship,
guardian label, payment role, or shared-notes permission is not on its own an
audience approval. No contact, portal grant, link, notification, Storage
object or billing obligation follows from approval.

The new binding is a domain-separated digest of the issued grant's exact
tenant, learner, workplace, contact, optional payer, permissions, revision,
bearer hash and issuance/expiry. Do not store or return a copy of the bearer
or its original hash. This binding prevents a replaced bearer from
inheriting access even if a writer omitted the revision increment.
Separately preserve the approved review digest so an exact lost-response
retry returns the original approval identity, not a second audience.
Receipt read-back reflects withdrawal if that approval was later withdrawn.
The older unbound audience metadata stays non-visible. A different issued
grant needs explicit approval. Withdrawal is one-way, scoped to the exact
immutable approval and possible after portal access or the paid capability
ends.

The service-only guest read checks the current bearer and its active
recipient, relationship, enrollment, student, workplace and optional payer
against the approved exact binding and digest-checked sealed report using
one relational snapshot. It omits archived, expired, rotated, revoked and
superseded access. Output is a bounded, allowlisted projection of the sealed
attendance facts, not names, identifiers, notes, financial data, source
provenance, or grant information. Neither browser anonymous/authenticated
RPC access nor direct service access to the raw snapshot is permitted.

## Exact source and evidence

- Preserved [candidate source](https://github.com/itshak/ChessCoachPal/commit/f4ae3264b3bfb0e1ef229504defc3d9b98b5395e)
  `f4ae3264b3bfb0e1ef229504defc3d9b98b5395e`, sole parent
  `ed84605e645272712d8204b4d7168a25c14db61c`, tree
  `2702b4a227c0e74a7f36a9358803dc992cdc9216`. Scoped five-path change:
  canonical baseline, transition manifest, typed audience row and two
  disposable proofs. SQL SHA-256
  `1f587cb9eb6a96db2e3eed0148e1a6ea3c092a967103a8121b9d7b5ddab9d42c`;
  manifest SHA-256
  `07e582f34fba07fbba2d69069a27f903b36bc2d8818000cd97cfa028ce920d88`.
- Warm transition from the exact accepted predecessor, fresh PostgreSQL
  17.12 install, and an independent restore into an empty installation
  matched Format 3 public structure
  `2e2d8fbc8d774c80db875fb68a863dc49b5c6b733cd10b8329d2afca78080c78`.
  The predecessor fingerprint is
  `45223459a3770fe5143492638dd2f5ee7e7adb28271ed457d8d9c90ae1a67d8c`.
  Independent comparison found only two columns and constraints, one trigger,
  eight functions and twelve ACL additions for those functions. Existing
  public relations, policies and ACL entries did not change. Restore compared
  exact publication, payload and audience state and observed a valid
  synthetic guest alongside withdrawn, rotated and legacy denials; there
  were zero Storage objects. A second restore into the populated target was
  rejected. Typed row validation checked 61 tables and 748 columns with zero
  issues. This is logical restore proof, not populated-beta or off-host
  acceptance.
- Synthetic checks cover an unissued grant, wrong learner and foreign
  teacher, linked but unapproved guardian, attempted direct bind by service
  role, changed reviewed
  recipient name, exact and conflicting retries, ended link or enrollment,
  archived contact, invalid bearer, revoked publication, replacement bearer
  without a revision change, normal rotation, and withdrawal after paid
  capability removal. The sealed teacher copy remains readable. The two
  concurrent database cases observed actual lock waits: identical request
  wrote one approval, and a rotation winning before approval left zero
  audience rows for that stale request. No whole-system concurrency or
  real-client sign-off is implied.

The [permit](../../scripts/approved-schema-freeze-successor.json) must
precede any activation, and the separately verified activation must preserve
both the reviewed base and preserved source. Website and MCP integration,
actual portal recipient use, delivery, explicit report supersession,
and production operations remain separate.
