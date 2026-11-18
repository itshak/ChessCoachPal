# Archive decision — baseline-first schema and one-time live transitions

**Decision:** IMPLEMENTED, **SOURCE-ACCEPTED** and ARCHIVED on **2026-11-18**.
The P0 foundation in [PR #103](https://github.com/itshak/ChessCoachPal/pull/103)
was merged to main as [`b9c50a3f312309814d9203467af7446e0f2273d0`](https://github.com/itshak/ChessCoachPal/commit/b9c50a3f312309814d9203467af7446e0f2273d0).
`openspec archive` merged this change's three SHALL requirements into the
canonical [baseline-live-transition spec](../../../specs/baseline-live-transition/spec.md).

## Delivered

- **Single canonical fresh-install baseline:** the current app-owned structure
  remains in `supabase/migrations/20261107000000_chesscoachpal_baseline.sql`.
  This change updated its authoritative/operator warning only, not its data
  model. A fresh install needs that baseline alone; existing versions are not
  implicitly reapplied to populated databases.
- **Machine-checked ordered ledger:** `scripts/schema-transition-manifest.json`
  pins the baseline and five approved versioned SQL migrations with SHA-256
  checksums, review purpose, predecessor, baseline target objects, risk and
  required restore. `scripts/pre1-schema-guard.mjs` and seven new guard tests
  reject altered/unlisted/unsorted transitions, missing target objects and
  unreviewed changes to the baseline or transition SQL. Thirty combined
  schema guard tests passed.
- **Real convergence fix discovered by tests:** the oldest pinned
  pre-extension fixture upgraded through the earlier four migrations left
  two function definitions unequal to the fresh baseline.
  `20261118150000_live_baseline_function_alignment.sql` is a fifth,
  forward-only, **function-only** repair for
  `ccp_restore_canonical_chess_rows(jsonb)` and
  `ccp_student_capacity_guard()`. Its digest is reviewed in the manifest.
  It does not delete records, authorize expanded tenant access or perform
  a live rollout.
- **Actual isolated DB acceptance:** the existing `m5-restore.yml` smoke runs
  `verify-schema-transition-convergence.sh` with explicit synthetic-only
  guards. It installs current baseline-only, then a historical previous
  baseline plus synthetic teacher, guardian, archived student, workplace,
  invoice/credit, portal and rating data. It applies five migrations,
  compares tables, columns, privileges, RLS, policies, functions, triggers
  and indexes against the clean install, verifies rows/relationships and
  status, rejects unsafe state and foreign-owner access, checks failed-DDL
  rollback and migration replay. The pre-existing independent
  database-plus-Storage restore test follows and passed.
- **Operator discipline:** [ADR-0015](../../../../docs/adr/0015-baseline-first-and-one-time-live-transitions.md),
  [the migration runbook](../../../../docs/SCHEMA_TRANSITION_RUNBOOK.md),
  architecture, release/hosting documentation, STATUS and the new fix plan
  index require a versioned data-preserving update and **separate** private
  production operator authorization. No arbitrary pre-v1 backwards-compatibility
  guarantee or legacy dual writer was introduced.

## Exact acceptance evidence

| Gate | PR-head (`553f018`) | Merged main (`b9c50a3f`) | Status |
| --- | --- | --- | --- |
| CI (typecheck, unit, catalog, parity, build, Docker/Compose) | [44325023141](https://github.com/itshak/ChessCoachPal/actions/runs/44325023141) | [44326920655](https://github.com/itshak/ChessCoachPal/actions/runs/44326920655) | **PASS** |
| Security reachable-history | [44325023147](https://github.com/itshak/ChessCoachPal/actions/runs/44325023147) | [44326920678](https://github.com/itshak/ChessCoachPal/actions/runs/44326920678) | **PASS** |
| Self-host Compose fresh smoke | [44325023221](https://github.com/itshak/ChessCoachPal/actions/runs/44325023221) | [44326920807](https://github.com/itshak/ChessCoachPal/actions/runs/44326920807) | **PASS** |
| Canonical baseline/upgrade convergence + real local synthetic DB/Storage restore | [44325023374](https://github.com/itshak/ChessCoachPal/actions/runs/44325023374) | [44326920541](https://github.com/itshak/ChessCoachPal/actions/runs/44326920541) | **PASS** |
| Authenticated browser ↔ delegated OAuth MCP E2E | [44325023153](https://github.com/itshak/ChessCoachPal/actions/runs/44325023153) | [44326920966](https://github.com/itshak/ChessCoachPal/actions/runs/44326920966) | **PASS** |

On PR head: **296 browser/MCP scenarios passed**, five intentionally
skipped, and three additional distinct scheduling-isolation runs passed.
The convergence log printed `SCHEMA_CONVERGENCE_OK` and independent
`Synthetic second-DB restore ... mounted-file byte parity passed`.
The exact merged-main acceptance above was separately confirmed before
this archive, not inferred from the pull request.

## Not part of implementation acceptance

**No live migration was executed.** The actual Coolify deployment revision,
private teacher records, live Supabase migration table, off-host production
backup/restore and operator consent have **not** been independently inspected
or authorized in this change. Before applying the alignment SQL to any
data-bearing installation, privately inventory it, verify a real off-host
restore, reconcile affected records and Auth/Storage/portal permissions, and
obtain explicit operator approval under the runbook.

This archive does **not** complete the seven remaining fix proposals or the
separate live ChatGPT/Claude client certification and public release gates.
No production deployment, new tag or public marketing feature promise is
asserted by this record.

## OpenSpec validation boundary

The newly materialized `openspec/specs/baseline-live-transition/spec.md`
passes strict OpenSpec validation; all eight P0 source-delivery tasks were
checked and `openspec archive` completed. Repository-wide strict OpenSpec
validation still reports unrelated earlier/active legacy-spec formatting
issues and other unimplemented proposals (10 failures in the combined
`--all` invocation); those are **not** certified as passing or silently
rewritten as part of this first fix. The P0 code/CI gates listed above
passed on both the PR head and merged main.
