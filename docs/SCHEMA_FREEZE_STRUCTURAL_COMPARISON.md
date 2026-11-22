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
3. Run `node scripts/compare-schema-freeze.mjs source.json target.json`. Any missing, unexpected or mismatched table, column, constraint, index, trigger, RLS policy, function, grant, sequence, enum/domain or extension is a hard failure. A comparison error is not a pass.
4. Separately inspect a *read-only* legacy/private-beta source inventory and record the explicit source-to-target transformation/reimport decisions. **Do not require the legacy schema to equal the new baseline.** No live mutation follows from this comparison.
5. Complete the exhaustive tenant/definer, financial, recurrence, subscription and website/MCP acceptance matrix with linked evidence. Only then run the final exact-head test suite, record the results, approve source freeze, archive the schema OpenSpec and merge according to repository policy.
6. Treat populated-data cutover, off-host restore and live payment activation as separate operator-authorized gates under ADR-0017/0019.

## Snapshot limitations

The exporter covers public relations/columns/constraints/indexes/triggers/policies/functions/ACLs, public sequences and enum/domain types, and installed extensions. It does not cover every cluster-wide role setting, Auth/Storage content, object data, external integrations, or dynamic behavior. Differences in owner names, extension versions or function bodies are intentionally reported and must be reconciled, not ignored.

**Status:** tool implementation only. The exporter/comparator have not been executed or accepted as part of the requested implementation-first workflow.
