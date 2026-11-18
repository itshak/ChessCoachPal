# ADR-0015: Baseline-first schema evolution with one-time live data transitions

- **Date:** 2026-11-18
- **Status:** Accepted — binding
- **Supersedes:** The absolute prohibition on pre-v1 migration scripts in ADR-0001 and the "exactly one exceptional migration" generalization in ADR-0013; does **not** authorize resetting existing databases.
- **Related:** ADR-0001, ADR-0003, ADR-0005, ADR-0007, ADR-0013

## Context

The canonical schema is a consolidated installation snapshot at `supabase/migrations/20261107000000_chesscoachpal_baseline.sql`. A running OVH/Coolify private-beta deployment has real teacher/student records; Supabase's migrator will not rerun an edited, already-recorded baseline. Historical exceptions already exist:

- `20261117000000_live_historical_lifecycle_extension.sql`
- `20261117190000_mcp_workflow_composition.sql`
- `20261117231554_family_communication_locale.sql`
- `20261118000000_multilingual_teacher_and_family_locale.sql`

These are **existing operational transitions**, not the schema for a clean installation. Future changes need both a correct new-install baseline and an intentional safe step for an already-populated deployment.

## Decision

1. **Always edit the baseline first.** Every new or changed table/column/check/index/trigger/RPC/RLS/grant/seed/storage policy SHALL be represented in the single authoritative fresh-install SQL snapshot and its generated types/specs/tests. The fresh installation SHALL NOT depend on an upgrade from an older baseline.
2. **Provide one reviewed forward-only transition per deployment change set whenever real data exists.** Such a script MAY be stored under `supabase/migrations/` for the deployment runner; it SHALL apply only to an already-existing target revision. It SHALL be explicitly versioned and audited, safe against partial rollout, idempotent where feasible, with preconditions and postconditions. In that sense "one-time" means **one recorded execution for each existing installation per transition**, not a perpetual single-file limit.
3. **The transition converges to the baseline's current effective schema.** No long-term legacy tables, compatibility views, dual writers, old API aliases, or permanently divergent installed schema are permitted just to support pre-v1 upgrades. New installation may pass through no additional SQL beyond baseline. Existing records shall be transformed or losslessly preserved until the new canonical representation is verified.
4. **No unauthorized destructive operation.** Existing real data (including student histories, payments, billing obligations, guardian communication preferences, portal grants, external identity and ratings) SHALL be inventoried, backed up and restore-tested. For structurally destructive migrations, use explicit dependency mapping, reversible rollout steps or independently restorable backups, per-record reconciliation and staged authorization. Do not automatically drop, wipe, or recreate live Supabase tables.
5. **Gated release order.** First prove fresh baseline on a clean ephemeral database. Test live transition against a representative isolated restored copy, before/after counts, sampled relationships, RLS/service-role isolation, RPC grants, idempotency/replay and read/write parity. Take and verify the actual production backup/restore, then apply the authorized transition **before** deploying code that depends on it. Document rollback/recovery; never declare deployment complete from a migration exit code alone.
6. **Govern the migration allowlist in CI.** Update `scripts/pre1-schema-guard.mjs` and its tests in the **same implementation change** to enumerate explicitly reviewed ordered transitions and verify baseline/transition compatibility. No arbitrary migration chain, hidden manual SQL, or ad hoc production hotfix outside this rule.
7. **Separate proposal from execution.** Proposing a schema or migration does not authorize a production write, reset, deployment or data exposure. An OpenSpec task becomes complete only with exact-source CI, parity, schema/restore evidence and documented operator approval where appropriate.

## Consequences

- Pre-v1 remains free to make clean breaking product/API choices **without promising older clients backward compatibility**.
- Real private-beta data is protected through targeted one-time transitions rather than an unsafe reset.
- Baseline SQL remains the single source of truth. Transitions are installation-specific operational history, not a second schema definition.
- Update AGENTS.md, OpenSpec, architecture docs, schema-guard comments and older ADR cross-references when changing this policy.

## Implemented source enforcement — 2026-11-18

The P0 contract was implemented in [PR #103](https://github.com/itshak/ChessCoachPal/pull/103),
merged to main at `b9c50a3f312309814d9203467af7446e0f2273d0`.
`scripts/schema-transition-manifest.json` pins the SHA-256 of the canonical
baseline and every approved live SQL file, including the new
`20261118150000_live_baseline_function_alignment.sql`. The last repair was
required because isolated pre-extension-upgrade verification exposed two
historically divergent function bodies:
`ccp_restore_canonical_chess_rows(jsonb)` and
`ccp_student_capacity_guard()`. It updates those function definitions and
reasserts existing permissions; it does not reset any data.

The source guard validates hashes, allowed order, target baseline objects and
risk/predecessor/restore metadata. The existing GitHub Actions M5 restore
workflow invokes a local-only synthetic convergence smoke: current baseline
alone versus a pinned pre-extension installation plus the five versioned
transitions, comparing full public structure, roles/RLS, data identity and
replay/rollback. The operator checklist is in
[the transition runbook](../SCHEMA_TRANSITION_RUNBOOK.md).

**Not authorized or verified:** No code merge, passing synthetic check or
OpenSpec archive establishes the actual production database revision or
approves applying migrations to live teacher data. Record private backup,
restore, inventory and operator approval before an eventual deployment.

**Exact merged-main acceptance:** [CI 44326920655](https://github.com/itshak/ChessCoachPal/actions/runs/44326920655),
[security 44326920678](https://github.com/itshak/ChessCoachPal/actions/runs/44326920678),
[Compose 44326920807](https://github.com/itshak/ChessCoachPal/actions/runs/44326920807),
[isolated database convergence and backup/restore 44326920541](https://github.com/itshak/ChessCoachPal/actions/runs/44326920541)
and [authenticated browser/delegated MCP E2E 44326920966](https://github.com/itshak/ChessCoachPal/actions/runs/44326920966)
all passed on `b9c50a3f` before archival. The actual production database
was neither accessed nor migrated.
