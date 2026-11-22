# Structural source-to-target comparison — freeze gate (draft)

This is an implementation aid for OpenSpec `2026-11-21-consolidate-final-preproduction-saas-schema`, not a freeze certificate.

## Safety boundary

- No direct connections, credentials or write operations are embedded in the comparator.
- `scripts/schema-freeze-metadata.sql` reads **structural metadata only**. It must be run under an explicitly authorized **read-only** role/transaction against each identified database. The script does not read teacher, student, financial or token rows.
- Do not run this script against a populated deployment until its identity and scope have been confirmed. Do not commit private snapshots.
- The actual source-of-truth for the candidate is the **freshly bootstrapped canonical baseline** on the exact PR SHA, not the current demo schema. The demo database is a *possible legacy source* for a separate ADR-0017 cutover, not evidence that the final candidate is wrong.
- A byte-for-byte metadata match between independently provisioned instances does not by itself establish authorization, financial integrity, website/MCP parity or operator cutover approval.

## Procedure after implementation is complete

1. Freeze a candidate commit and create a disposable database solely from its canonical baseline. Export a source structural snapshot with `scripts/schema-freeze-metadata.sql` using `psql -X -t -A` inside a read-only transaction; capture the single JSON result without psql headers or diagnostic text.
2. Independently provision a **second disposable target** using the same approved bootstrap. Export its structural snapshot under a separate read-only transaction.
3. Run `node scripts/compare-schema-freeze.mjs source.json target.json`. Any missing, unexpected or mismatched table, column, constraint, index, trigger, RLS policy, function, grant, sequence, enum/domain or extension is a hard failure. A comparison error is not a pass. Version 2 requires fresh exports from both instances and rejects empty core sections or missing ChessCoachPal reference tables.
4. Separately inspect a *read-only* legacy/private-beta source inventory and record the explicit source-to-target transformation/reimport decisions. **Do not require the legacy schema to equal the new baseline.** No live mutation follows from this comparison.
5. Complete the exhaustive tenant/definer, financial, recurrence, subscription and website/MCP acceptance matrix with linked evidence. Only then run the final exact-head test suite, record the results, approve source freeze, archive the schema OpenSpec and merge according to repository policy.
6. Treat populated-data cutover, off-host restore and live payment activation as separate operator-authorized gates under ADR-0017/0019.

## Snapshot limitations

The exporter covers public relations (including view definitions), columns, constraints, indexes, triggers, policies, routine definitions and owners, public schema/relation/routine/sequence/column ACLs, public and global default ACLs (including grantor identity), public sequences and enum/domain types, and installed extensions. It does not cover every cluster-wide role setting, Auth/Storage content, object data, external integrations, or dynamic behavior. Differences in owner names, extension versions or function bodies are intentionally reported and must be reconciled, not ignored.

**Status:** the synthetic comparison below passed. Source freeze and operational cutover are not approved.

## Independent synthetic run, 2026-11-22

The canonical SQL at [`eca027dda79286ec3635b573aa4a098c3c1744fc`](https://github.com/itshak/ChessCoachPal/commit/eca027dda79286ec3635b573aa4a098c3c1744fc), SHA-256 `89f1fcca34419e79e1a55a1c1d45d9710d4edf19981fc72fa7c773bfba8a34ab`, was applied separately to two newly initialized Compose projects with synthetic credentials, internal networks, and no exposed ports. Each used the repository migration service and recorded exactly one migration. The test used Supabase PostgreSQL `17.12.0.000` for both projects, not the example configuration's `17.6.1.136`. See steps 1–3 above for collection and comparison.

Each v2 structural snapshot contained 105 relations, 1,078 columns, 809 constraints, 386 indexes, 78 triggers, 96 policies, 137 routines, 3,132 ACL entries, six extensions, one type, and no sequences. Both snapshots had SHA-256 `a89cbe7bc98e5c21134448c48255acb318a492e352fcf5f192b77cc14f4b3b57`; the comparator returned zero differences. Both test projects and their volumes were removed.

This is a passing **synthetic structural comparison for that SQL and PostgreSQL version**. It does not certify exact final-head behavior, parity, approval of the field crosswalk, or any deployment or populated-data cutover. Re-run on the final acceptance candidate and record its result separately.

The same canonical SQL also matched on the published verification candidate [`54e84452ef1a11cdcf58c9a50e3e48c862677bf2`](https://github.com/itshak/ChessCoachPal/commit/54e84452ef1a11cdcf58c9a50e3e48c862677bf2). In separate disposable stacks, 15 targeted entitlement, subscription, billing and boundary API tests passed. Six capacity scenarios passed with the portable Playwright base URL, including an authenticated Chromium roster, OAuth PKCE delegated MCP and independent database rejection and counter readback for a zero-cap tenant. These tests cover the named scenarios, not the entire Phase 2 matrix.


## Post-freeze drift protection (inactive until source acceptance)

Do not add `scripts/schema-freeze-lock.json` until the P0 source acceptance review is complete. At approval, record the exact accepted source commit and SHA-256 of the canonical SQL and transition manifest. The lock is a JSON object with `version: 1`, `acceptedSourceCommit` (the full Git commit ID), and `sha256` (an object keyed by `supabase/migrations/20261107000000_chesscoachpal_baseline.sql` and `scripts/schema-transition-manifest.json`). Calculate the hashes from the accepted commit, not an uncommitted worktree. Use a commit already retained in the target branch history (after the coordinated merge or with a merge that preserves that commit), so squashing or deleting a short-lived branch cannot orphan the lock evidence.

On ordinary later changes, the CI guard reads the already accepted lock from the **base commit**, verifies the checked-out inputs against it, and runs the base guard as well when a lock exists. Editing the SQL and its same-branch manifest together, or deleting or replacing the lock in an ordinary feature PR, is not an escape hatch. The guard does not replace required CI protection or review of CI policy changes. If unexpected DDL is later unavoidable, use the separately reviewed ADR-0019 change-control process rather than weakening this check in a feature PR.

## Rating provenance and worker boundary checkpoint

Both independent disposable PostgreSQL `17.12.0.000` stacks bootstrapped the combined provenance/worker SQL (SHA-256 `2cb9fb08378eac4f6771de5c011a06d10bf5555a79923329f4baeb9e05f4df28`) with one canonical migration. Their v2 metadata snapshots were identical (SHA-256 `c9d183fed04b4451a3a183bcafcb6ea0e9b55879c2cb0bbf18591c9ec62d1ada`; 105 relations, 1,078 columns, 386 indexes, 96 policies, 81 triggers, 142 routines, 3,140 ACL entries, 808 constraints, six extensions). The comparator reported zero differences and both isolated projects were removed. This is evidence for those exact SQL bytes and the stated image, not a production cutover or complete source acceptance.

## Cancellation and historical evidence checkpoint

The selected canonical SQL (SHA-256 `ff643a093ed2712fc52397ac530081fa2f569bf39271e6ce9d5f9dc4460734f7`) was independently bootstrapped twice on disposable PostgreSQL 17.12. Both instances applied only migration `20261107000000`; read-only structural snapshots matched at SHA-256 `b3150fb30ceacdb8dc8d91d4c409a3fb5a63db73d3b87fb5d9c7922db3ac6a98` with 105 tables, 1,078 columns, 142 routines, 807 constraints and zero differences. Both projects were removed. This checkpoint does not accept the full recurrence scope, portable restore, or a populated deployment.

## Report entitlement and material restore checkpoint

The combined canonical SQL SHA-256 `cae29c652091daaacff32130d1790122476c3d98e69b9abc62c9961e1db35d00` bootstrapped independently twice on disposable PostgreSQL 17.12; both applied the single canonical migration and their read-only structural snapshots matched byte-for-byte at SHA-256 `d8212b7c535e6198b1282ee7b009371410a7c37cf8a356e0ee8ac2c7c2697065` (105 relations, 1,078 columns, 807 constraints, 386 indexes, 96 policies, 83 triggers, 143 routines, 3,141 ACLs, zero differences). Seeded portable material restoration and three focused report boundary cases passed. Both independent databases and all isolated test resources were removed. This is not a production import or all-scope acceptance.

## Durable series identity checkpoint

Combined canonical SQL SHA-256 `0cd3c2a5beb2c67b053b928a029074d2e2fa60c8de51960c41ae9e91e3c0fd5e` bootstrapped twice on separate disposable PostgreSQL 17.12 instances with only the canonical migration. Read-only v2 snapshots matched byte-for-byte at SHA-256 `f9a4626076b67e549c88730fe63bd17016ab38f73ebeec886c288ab6f12bd085` (105 tables, 1,080 columns, 812 constraints, 389 indexes, 85 triggers, 96 policies, 145 routines, 3,145 ACLs). The seeded baseline and material restore SQL tests passed independently on both instances. The exact materialized Row audit found zero issues across 60 declared table contracts and 730 columns. Test resources were removed. This verifies lineage storage and restore, not the not-yet-complete scoped write operations.

## Secure single-date cancellation and linked materialization checkpoint

The combined canonical SQL SHA-256 `a48ff24a28c7b882f29534e9a849b08537a08a5189952013bd9c614e8f82eb1c` bootstrapped independently twice on disposable PostgreSQL 17.12. Both read-only v2 snapshots matched byte-for-byte at SHA-256 `7d1f669b53a0545e7e95a1ab016c2c2e22f6c006a720b3bbffa9b7557108a94e` (105 tables, 1,080 columns, 146 routines, zero differences). Seeded lineage and portable-material restoration passed. Authenticated API tests checked exact one-date cancellation, retirement protection and regeneration. No later-scope recurrence writer, populated-data cutover or matrix acceptance is implied.

## Future-safe revocation and terminal split checkpoint

The combined canonical SQL SHA-256 `c5189b6c8df9a5259896927388557455f8b22c78fc79691f594477eaba33f50a` applied once per instance to two disposable PostgreSQL 17.12 databases. Both read-only v2 snapshots matched at SHA-256 `3541ac2a29a22c4c894709ef8e8697da2867a15b4a0c09713cbb5838e7a927ca` with zero differences (105 tables, 1,080 columns, 812 constraints, 389 indexes, 85 triggers, 96 policies, 149 routines, 3,153 ACLs). The projects and volumes were removed. This is not complete recurring-edit, full-CI or operational cutover acceptance.

## Bounded multi-segment recurrence checkpoint

Canonical SQL SHA-256 `26c6dacc778911e805d3eae81ac7dcc38aa2edac5e6dad41c15531718527f422` bootstrapped independently twice on disposable PostgreSQL 17.12. Each applied the only canonical migration, and snapshots matched byte-for-byte at SHA-256 `a3decd78298281c5e05b27cf4897178c19acf30979b74d8c7f1f0f9dc3aacb74` (105 tables, 1,080 columns, 150 routines, zero differences). The seeded canonical baseline and material restore checks passed. Three actual scoped Auth/PostgREST cases passed on the exact code tree. Disposable assets were removed; no freeze or operational cutover is implied.

## Reviewed single-date move checkpoint

The canonical SQL SHA-256 `e7e13bdc0fe57ffadefb1421b62f555deeee1420a2ace22c39aae0b86944d7a9` bootstrapped independently on two disposable PostgreSQL 17.12 stacks. Their structural fingerprint SHA-256 matched at `28a252991cf75bdfa25038e2052ea6b5e8a502891b00048882e285e372721de1` and the full read-only metadata comparator returned zero differences. All 13 combined recurrence API tests passed on the checked code. Disposable projects/volumes were removed. This is source verification only; UI parity, complete acceptance, and populated-data cutover are separate.

## Effective database roles checkpoint

Canonically migrated disposable PostgreSQL 17.12 databases were independently bootstrapped on SQL SHA-256 `4e96039318252e35cd3648dfe7d625addc13b29777c93218dbef73bbeb552c2a`. Both read-only structural metadata snapshots matched at SHA-256 `6fc7346c16c2d1edcff249dd4c7fef2b5859c0df48c8819e853c16a93dbe52a3` with zero differences and one ledger migration. Actual PostgreSQL grants for 11 signatures and six tables plus three signed-user permission checks passed. Both test instances and volumes were removed. No acceptance waiver or production change is implied.

## Same-day scope and effective roles checkpoint

Canonical SQL SHA-256 `64d6f7cffb4616c3efea7fdd6e2a50b4b62b7f96c9a2f9b3d6eaf23c1e247457` applied once to each of two independently bootstrapped disposable PostgreSQL 17.12 instances. Both read-only structural snapshots matched byte-for-byte at SHA-256 `62fd4c6568589d84736a5b2eb6973d2c3a325238901c1cee7a31ab47c5518711` with zero differences. Actual role assertions and six authenticated scoped scheduling checks passed, including a naturally expired review. Isolated resources were removed. This does not certify live deployment or the entire acceptance matrix.

## Bounded weekday, lesson history and downgrade checkpoint

Canonical SQL SHA-256 `59185e1ab2301abed722429420c4531831ee6b8a2c4c961cb0f82b0ff9dc10d7` applied once to each independently bootstrapped disposable PostgreSQL 17.12 database. Both read-only snapshots had SHA-256 `3062271667cd9f7f7cd8e0326dcc774b028ae230b386458e2fb8a07a2da52d82` with zero differences: 105 public relations, 1,080 columns, 152 routines, 85 triggers, 96 policies, and 3,157 grants. The materialized contract audit checked 60 declared row types and 730 columns with zero issues on each database. Six SQL fixtures passed on both instances, including the effective-role check; 23 Auth/PostgREST cases passed on the combined code tree. Both disposable projects were removed. These checks neither replace exact hosted CI nor certify the full source matrix or a live deployment.
