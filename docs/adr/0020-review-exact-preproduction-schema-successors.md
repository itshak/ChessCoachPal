# ADR-0020: Review exact successors to the preproduction schema lock

**Status:** Preproduction change-control mechanism. This decision alone does not permit any schema bytes to change. See [ADR-0017](0017-pre-v1-single-final-cutover-no-compatibility.md) and [ADR-0019](0019-single-final-schema-and-commercial-entitlements.md).

The schema freeze is a reviewed source baseline, not a ban on correcting product requirements before production. Ordinary feature changes still cannot edit the canonical SQL, its transition manifest, or their lock. Keep exactly one fresh-install baseline; this mechanism does not create an incremental migration path.

## Intentional revision

1. Agree which requirement justifies the revision. Work on an isolated branch. Test the exact candidate on fresh disposable instances, including declared SQL/TypeScript contracts, structural comparison, authenticated behavior and independent restore as applicable. Keep implementation and approvals separate.
2. Construct the next lock for the verified, distinct accepted source commit and both locked file digests. Preserve the prior accepted source in its history. Record the proposed checksums and evidence in the reviewed decision.
3. In a separate review, with the previous SQL and lock untouched, land `scripts/approved-schema-freeze-successor.json` on the target base. It has version 1, an ADR identifier, and the SHA-256 digests of the complete previous and exact successor lock files. This is permission for those two exact lock files only, not a release or authorization for live SQL.
4. Update the implementation to include the reviewed base. On this transition, the same protected CI guard reads the permit from the base commit, never from the proposed checkout. It requires exact digest and ancestry matches and verifies both final locked files and the one-migration rule. A same-PR permit cannot authorize itself. Do not squash or rewrite either accepted source out of history.
5. Merge only after the exact release verification passes. The old approval cannot be reused for a later change or reversion: its predecessor no longer matches. A later change must receive its own review and replace the expired permit in a separate base change.

Do not disable the guard, alter branch protections, hit a real database, deploy, activate billing, or infer operator authorization from these source steps. Production migration remains separate under ADR-0017.
