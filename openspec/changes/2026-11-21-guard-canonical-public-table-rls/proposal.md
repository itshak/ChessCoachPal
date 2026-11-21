# Guard canonical public-table RLS coverage

**Status:** Implementing as a narrow, independently verifiable slice of the active `2026-11-19-freeze-unified-saas-schema-and-regressions` P0 change.

## Why

The 2026-11-20 source inventory counted 87 public app tables with 87 RLS enables, but that observation was manual/static, not a continuous regression gate. A new canonical table could otherwise be added without an explicit RLS enable and pass unrelated source checks.

## Scope

Add a fail-closed source guard that compares every declared public table with explicit RLS enablement, rejects disabling RLS, duplicate declarations and stray toggles, and runs as part of the existing pre-v1 canonical schema guard and its negative tests. This creates **no new tables, migrations, MCP actions, website behavior or deployment**.

## Acceptance

- Existing canonical baseline passes and synthetic unprotected-table, disabled-RLS, commented-out-guard and duplicate-table inputs fail.
- Existing schema:canonical:guard and schema:canonical:guard-test run the check.
- Exact PR-head and merged-main GitHub CI, authenticated E2E, security, Compose and backup/restore complete successfully before source acceptance/archive.
- Document that RLS syntax coverage does **not** prove tenant isolation, policy correctness, grant safety, existing populated database state or permission to perform a live cutover.

## Relationship to larger OpenSpec

This closes only the static public-table RLS coverage **sub-slice** of unified schema freeze. The broader P0 change and other 12 active changes remain open, including SQL-backed tenant A/B testing, historical-data transition and full type coverage.
