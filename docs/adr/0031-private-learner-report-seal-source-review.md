# ADR-0031: Review exact private learner report sealing source

**Scope:** Approval only under [ADR-0020](0020-review-exact-preproduction-schema-successors.md). This changes the exact protected-base permit, not the installed canonical SQL, manifest, lock, guard, runtime, or deployment. The accepted baseline remains in force until a separate verified transition.

## Decision

The teacher's existing live attendance preview stores nothing. For a distinct
explicit review and approval, persist the small allowlisted report and its
private source provenance in the same database transaction as its immutable
publication metadata. Here a sealed report is still **teacher-only**: sealing
creates zero audience records, grants, notifications, or Storage objects.
A versioned internal reference resolves the immutable payload without using
a public or shared file bucket. Owner read-back returns the sanitized snapshot
and checks its content digest. It never returns provenance, and cannot read
legacy object references through this path.

The review binds both the rendered facts and their exact source attribution
for one owned learner, one owned workplace, one finite date range and one
output language. Use completed sessions with exact frozen membership and
recorded local dates. Missing attendance remains unknown. Notes, imported
estimates, other learners, inferred mastery and money are not report evidence.
A changed source mapping requires review even when the rendered rows are
identical. The selected attendance revision may conservatively require a
fresh review. The teacher row serializes use of the same request key;
an identical completed request returns the original receipt. New saves also
pass the existing publishing entitlement guard. The RPCs do not activate
sharing or write finance, attendance, or learner data.

## Exact source and verification

- Preserved [candidate source](https://github.com/itshak/ChessCoachPal/commit/ca588bcf0eed68cccbb2d3492a720fb777dc8c6c)
  `ca588bcf0eed68cccbb2d3492a720fb777dc8c6c`, sole parent
  `a3c1d1c82ced2579c7f5db6afddceed041eb9c7e`, tree
  `71ec6bb3ec28a1a9aaef443e558466b3cbb55ff3`; four verified paths
  (single baseline, transition manifest, source inventory, disposable proof).
  SQL SHA-256 `b87da78c99bcf65357c6cc5fb59a348abe2c7e69e3c18465580d9abcf1db203e`;
  manifest SHA-256 `cd274b0275a37586b8869ccfebba1c7c1773a6923cf93afcb776959a3e60eff8`.
  Prior accepted source remains in this ancestry.
- Isolated warm append on the exact accepted predecessor, independently
  installed fresh PG17.12 candidate, and backup-restored target matched the
  complete public structural fingerprint
  `b8a36570394aed300772b9c64ac8742fb463d336fa08cf4a314ba335c1336859`,
  vs predecessor `f6989ac5fb7cea4c9f43c23924898ddef94c7e0bef02586811a27c0f170a107e`.
  Independent before/after comparison found only one RLS relation (five
  columns, five constraints, one index and one guard trigger), two internal
  routines, and three authenticated-only security-definer RPCs. No old
  objects or ACLs changed; no anonymous/service role read grants on the new
  payload, no new public/storage policies. The Format 3 restored contract
  checked 61 typed tables, 746 typed columns and zero issues; the new payload
  relation is intentionally SQL-only. All 67 canonical guard tests passed.
- The [synthetic proof](https://github.com/itshak/ChessCoachPal/blob/ca588bcf0eed68cccbb2d3492a720fb777dc8c6c/scripts/private-learner-report-seal-synthetic.sql)
  is on the preserved candidate and becomes available on the protected tree
  only when the successor lands. The exact disposable test checks owner and
  foreign access, free preview without permission to seal, explicit approval,
  empty range refusal, a same-day attendance swap whose rendered rows stay
  identical but makes old approval stale, a fresh seal, unchanged private
  read-back after a further source edit, immutable provenance, and exact
  versus conflicting replay. Both concurrent same-key cases waited on an
  actual database lock; independent read-back found one publication, one
  payload and zero audience in each. No universal concurrency claim.
- An official checksum-sealed logical archive restored into a separately
  initialized empty disposable target. Its restored snapshot, publication,
  Auth reference and zero audience matched the source; a second restore was
  rejected and the original request replayed unchanged with exact persisted
  state. This is not a populated-beta, physical, or off-host operator proof.

The [permit](../../scripts/approved-schema-freeze-successor.json) does not
itself change the accepted schema. The future exact successor
must retain both the approval and the preserved source in its history.
Signed website and delegated MCP integration, explicit recipient approval,
portal reads, revocation/supersession workflows, and live operator action are
separate. No report or listener was activated in a real environment.
