# Change: enforce baseline-first schema and one-time live transitions

**Status:** Proposed implementation; architecture already accepted in ADR-0015. **Not implemented or deployed.**
**Depends on:** ADR-0001, ADR-0013 and ADR-0015; no other proposed change.
**Priority:** P0 foundation for subsequent schema work.

## Why
The current single canonical SQL snapshot and actual operational transition files coexist with an allowlisted hardcoded schema guard and older documentation implying that live migrations are forbidden. A baseline edit alone does not reach a populated Coolify database, but an upgrade-only migration risks leaving fresh installations incomplete. Both installation paths must converge on one effective schema without compromising real student records.

## Outcome
Create repeatable CI and release controls enforcing: (1) a complete current baseline for clean installs, (2) explicitly approved one-time transitions for deployed private-beta data, (3) matched effective schema/privilege results, (4) tested backup/restore and a human authorization gate for production mutation.

## Scope
- Inventory the existing baseline and four current operational transitions; enumerate migration-runner version behavior, order, scope and overlap.
- Add a machine-checkable transition manifest/allowlist to scripts/pre1-schema-guard.mjs and its tests, with no blanket exemption for new SQL files.
- Establish baseline-vs-transition structural diff tests for app-owned tables, indexes, triggers, routines, grants and RLS, plus representative-data reconciliation on restored synthetic fixtures.
- Define a review template for data-sensitive transitions, rollback/recovery, operator approval and post-deploy verification; update setup/release runbooks.
- Require every later schema proposal to update this check as part of implementation.

## Out of scope
No application schema mutation, live rollout, restore of real user data or automatic reset in this planning change. This change does not promise pre-1.0 compatibility with arbitrary older installations.

## Acceptance
A CI job rejects a transition without a corresponding baseline edit/manifest entry, accepts the existing explicitly reviewed ordered transitions, and proves clean-install and restored-instance convergence. Repeating a completed transition is safely handled by the runner. Record exact PR and merged-main evidence before archiving; no production action without separate authorization.
