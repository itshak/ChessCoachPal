# Tasks: enforce baseline-first/live-transition contract

- [ ] Inventory all five current SQL files and actual migrated production revision, without exposing credentials or student records; document semantic target state and ownership.
- [ ] Define ordered, code-reviewed transition manifest and update scripts/pre1-schema-guard.mjs plus positive/negative unit tests; preserve explicit allowlist and existing tests.
- [ ] Add CI clean-baseline smoke and representative previous-state-plus-transitions schema/privilege/RLS equivalence checks; verify storage/auth exceptions deliberately.
- [ ] Add synthetic preservation fixtures: archived students, historic sessions/attendance, guardians, invoices, linked credits, emails/events, multiple workplaces, portal credentials and current rating snapshots.
- [ ] Test first apply, already-applied, failed/partial execution, conflicting precondition, foreign tenant access and recovery from backup.
- [ ] Update production operator runbook, release gate, architecture/README and ADR references to require per-change live transition with explicit approval.
- [ ] Run npm tests, lint/typecheck, schema guard, strict MCP parity, authenticated website↔MCP E2E, security, Compose and backup/restore; record exact CI evidence.
- [ ] Merge exact verified implementation to main, verify main checks, update STATUS and archive only after acceptance.
