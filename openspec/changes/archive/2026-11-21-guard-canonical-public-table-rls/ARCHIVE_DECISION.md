# Archive decision — canonical public-table RLS coverage guard

**Disposition:** Source-only guard accepted and archived. This is an independently scoped sub-slice of active P0 `2026-11-19-freeze-unified-saas-schema-and-regressions`, not the full freeze.

## Change and evidence

- Implementation [PR #110](https://github.com/itshak/ChessCoachPal/pull/110), exact tested head `986fa3671451f874a3e1e461b8d814cf526f7a1f`, merge commit `35a8526e6b0fa18b64f71ad979c03f36e5aee2c5`.
- All five exact implementation PR-head workflows passed: [CI](https://github.com/itshak/ChessCoachPal/actions/runs/44920956731), [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/44920956770), [security](https://github.com/itshak/ChessCoachPal/actions/runs/44920956726), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/44920956769) and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/44920956806).
- Archive merge gate: verify those five families also completed successfully on implementation merge `35a8526e` and exact archive PR head, then merge archive to main. Public GitHub Actions execution records, not this document alone, are authoritative for acceptance.

## Delivered and limits

- A static parser validates `CREATE TABLE public.*` against RLS `ENABLE`, rejects `DISABLE`, duplicate public-table declarations and orphan RLS toggles; synthetic negative tests are executed as part of existing canonical schema guard tests.
- No new baseline SQL, application migration, auth/MCP/business operations, student data processing or production deployment.
- **Does not certify:** policy predicate correctness, grants, privileged SQL functions, multi-tenant A/B isolation, actual populated Coolify schema, data preservation, backup integrity for a real host or operator authorization for the one final cutover.
- The 13 pre-existing OpenSpec changes remain active, especially unified schema freeze, type generation, tenant/RLS SQL integration testing and historical transition.

Archiving is documentation of this guard's limited source acceptance only.
