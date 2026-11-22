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
