# Unified schema candidate — acceptance and OpenSpec handoff (2026-11-19)

**Status: DRAFT / NOT ARCHIVED / NOT MERGED / NOT APPROVED FOR PRODUCTION.** This technical record documents source-branch integration and acceptance gaps. It is not a migration runbook and authorizes no live data modifications. Current proposals remain active until every acceptance case is independently demonstrated.

## Integration stack

1. [PR #104](https://github.com/itshak/ChessCoachPal/pull/104) — pending Contacts, payment, ratings and canonical schema foundation.
2. [PR #107](https://github.com/itshak/ChessCoachPal/pull/107) — safer teacher spreadsheet import, owner-confirmed workplace choice, database atomicity, client localization and website/MCP parity. Exact-head `da9958156390cfc3115c45c34ef3dedd3e4da753` was green in CI, authenticated E2E, security, Compose and backup/restore on 2026-11-19.
3. [PR #108](https://github.com/itshak/ChessCoachPal/pull/108) — this draft pre-v1 schema-only candidate, stacked on #107. Never merge independently of its reviewed base.

## Schema amendments staged on this branch

- `workplace_enrollments`: multiple dated, non-overlapping periods per owner/student/workplace, revision/provenance, cancellation and unknown legacy starts, indexes and range exclusion.
- Preserve canonical student and completed lesson identity when a workplace period ends; direct lessons and group memberships require an applicable interval, with a separate tenant-safe student FK.
- `credit_adjustment_events`: append-only, owner-bound proposed entitlement adjustment evidence for refunds, transfers, grants, forfeitures and expiry exceptions. This is **not** a refund, payment, ledger writer, authorization to issue refunds or automatic archive policy.
- Update canonical baseline checksum, generated schema type declarations, synthetic fixtures, static schema guards and a database-backed temporal-period test.
- Add an OpenSpec delta for the intended requirements; the proposal is still active.

## Gaps blocking OpenSpec archival and schema freeze

- Run the **exact PR #108 head** fresh-install, SQL/test manifests, typecheck, RLS/tenant abuse, full authenticated website/MCP E2E, security, Compose, and backup-restore; confirm no regressions or bypasses. The first candidate failed on a redundant FK drop and the second exposed undated synthetic membership; both need exact-head rerun.
- Update all enrollment-aware application, MCP, import, scheduling, archive, group and finance readers/writers to honor dates, revision/confirmation, cancelled and unknown periods. The current website/MCP *workflow* implementation does not yet satisfy this.
- Remove or reconcile existing destructive unenroll/archive assumptions before a source freeze. A completed historical lesson must remain linked and viewable when a period is closed. Check future commitments, recurring schedules, overlapping workplace arrangements and correct group teacher minutes.
- Implement authorized, transactional, replay-safe credit adjustment, funded versus invoiced distinction, cross-workplace transfers and reversal/refund constraints. A schema-only event table is not enough to claim a safe operational credit lifecycle.
- Finish field-by-field schema inventories, forward-only populated-DB transition plan, actual target environment assessment, off-host backup, restored-instance audit and operator sign-off. The fresh-only baseline must NEVER be run to reset a database with real teacher records.
- Reconcile all remaining active OpenSpec proposals, merge order and current public specs, then archive **only** actually completed changes with test evidence. Do not silently mark unchecked tasks complete.

## Policy

An OpenSpec archive or merge to `main` is an acceptance record, not a documentation convenience. Failed/pending checks, incomplete website/MCP parity, unknown live data state or unreviewed credit operations prohibit archival. A signed-off source freeze also does not grant permission for a production migration, which remains operator-only under the existing release/transition ADRs.
