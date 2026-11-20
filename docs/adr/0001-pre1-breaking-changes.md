# ADR-0001: Breaking contracts before 1.0.0; canonical schema first

- **Status:** Accepted — binding; final-cutover policy now clarified by [ADR-0017](0017-pre-v1-single-final-cutover-no-compatibility.md)
- **Date:** 2026-11-07; policy clarification 2026-11-18
- **Scope:** ChessCoachPal pre-v1 APIs, database, UX, configuration, and CogNote inheritance

> **2026-11-18 controlling clarification:** ADR-0017 requires one final cutover or clean export/reimport, not repeated per-feature live migrations. Historic ADR-0015 evidence remains recorded below; do not read it as authorization for compatibility code or real database changes.

## Context

ChessCoachPal is a chess-first, MCP/Plugin-first product based on CogNote source, not a compatible extension. Its pre-1.0 public contracts are not stable. However, the private-beta deployment **already contains real teacher/student information**. A lack of compatibility guarantees does not permit destroying that data or leaving a running deployment with an un-upgraded schema.

## Decision

1. **No CogNote compatibility.** No old CogNote routes, tables, aliases, workflows, or data-conversion support are retained solely for backward compatibility. Preserve upstream licensing notices.
2. **No contract compatibility promises between ChessCoachPal releases before v1.0.0.** Rename/remove outdated APIs and physical models freely when this clarifies the product. Update browser and MCP together under ADR-0003. A client may need to refresh its tool catalogue after a version update.
3. **One complete, authoritative current-schema baseline:** `supabase/migrations/20261107000000_chesscoachpal_baseline.sql`. Every schema-changing implementation MUST modify the baseline, bootstrap/seed fixtures, database types, grants and fresh-install tests to describe the **final** structure. Do not build new installations by replaying historical application upgrades or by retaining obsolete models.
4. **One-time transitions for real deployed records are mandatory when needed.** A reviewed, deployment-specific, versioned, forward-only SQL transition SHALL bring a running private-beta database to the same effective target structure without losing real teacher/student, lesson, finance, consent, access or historical records. It is an operational transition artifact, **not a second canonical schema or a promise of generic pre-v1 upgrade compatibility**. Follow [ADR-0015](0015-baseline-first-and-one-time-live-transitions.md), which takes precedence over any original "no migrations" wording.
5. **Disposable development environments** MAY reset and reseed explicitly. A database with real or uncertain data MUST NOT be reset or destructively overwritten absent informed operator authorization, tested recovery and a data-preservation plan. Never silently reset a deployment.
6. **Remove inherited clutter, not useful responsibilities.** Contacts, billing rights and external sharing must survive the retirement of the family/studio naming where needed. Do not retain legacy family-as-household semantics merely because they existed in CogNote.
7. **Before v1.0.0**, decide stable versioning and migration policy separately; this ADR does not promise automatic upgrades for any pre-1.0 checkout.

## Acceptance

- Current baseline can bootstrap an empty Supabase/Compose environment, including RLS, owner grants, foreign keys and actual app/MCP reads and writes.
- Any live transition passes a representative restored-copy test, migration/replay tests, record/relationship/permission reconciliation and an independently recoverable backup before authorized rollout.
- Website/MCP parity, tenant isolation, history/audit preservation, deterministic billing and external-portal access checks remain mandatory.
- Documentation, CI schema guards, OpenSpec changes and status/release notes use the same distinction between **canonical baseline** and **one-time live transition**.

## Relationship to previous wording

The original 2026-11-07 "no migrations or backward-compatibility acceptance work" rule applied to disposable, pre-release development schemas. It is **superseded for databases containing real private-beta records**. The original November 15 note that exactly one SQL migration file was permitted was later invalidated by actual deployment transitions and is not a permanent migration-count limit. See historical [ADR-0013](ADR-0013-forward-only-live-schema-repair.md) and binding [ADR-0015](0015-baseline-first-and-one-time-live-transitions.md).
