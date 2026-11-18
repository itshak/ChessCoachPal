# Tasks: enforce baseline-first/live-transition contract

- [x] Inventory the canonical baseline, four pre-existing live SQL files and newly reviewed P0 alignment transition; pin their hashes, baseline-owned objects and semantic target. Privately inspecting the **actual deployed revision** is an operator-only predeployment obligation (see the runbook) and was intentionally NOT performed in this source change.
- [x] Define ordered, code-reviewed transition manifest and update scripts/pre1-schema-guard.mjs plus positive/negative unit tests; preserve explicit allowlist and existing tests.
- [x] Add CI clean-baseline smoke and representative previous-state-plus-transitions schema/privilege/RLS equivalence checks; verify storage/auth exceptions deliberately.
- [x] Add synthetic preservation fixtures: archived students, historic sessions/attendance, guardians, invoices, linked credits, emails/events, multiple workplaces, portal credentials and current rating snapshots.
- [x] Test first apply, already-applied, failed/partial execution, conflicting precondition, foreign tenant access and recovery from backup.
- [x] Update production operator runbook, release gate, architecture/README and ADR references to require per-change live transition with explicit approval.
- [x] Run npm tests, lint/typecheck, schema guard, strict MCP parity, authenticated website↔MCP E2E, security, Compose and backup/restore; record exact CI evidence.
- [x] Merge exact verified source to main (`b9c50a3f`), verify all five main workflow families green, then update STATUS and archive the accepted source contract. Actual live migration remains operator-gated.

**Post-archive operational hold (not a source implementation task):** This change does
not establish the actual Coolify deployed SHA, live migration ledger, off-host
production restore proof or human approval for applying the alignment SQL.
The authorized operator must complete those private checks before any real
data-bearing rollout; CI synthetic fixture acceptance is not production
migration authorization.
