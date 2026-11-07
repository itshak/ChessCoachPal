# Change: remove-cognote-legacy-and-secure-data

- **Status:** Archived 2026-11-08 — chess-only implementation CI-verified on main; publication safety review remains blocked by the explicitly tracked history/artifacts release gate
- **Target:** ChessCoachPal v0.1.0
- **Dependencies:** Coordinate the canonical schema with [complete-coaching-workflows](../2026-11-07-complete-coaching-workflows/proposal.md); security acceptance also gates the agent interface.
- **Roadmap:** [v0.1.0](../../../ROADMAP-v0.1.0.md)

## Why

The public repository still contains music/practice features, unnecessary dependencies/assets and approximately 47 inherited SQL migration files. The historical privacy, credential-exposure and third-party license reviews are not complete. Passing TypeScript tests alone cannot make these safe or appropriate for an open-source chess product.

## Change

Remove obsolete music-only pages, API endpoints, dependencies, assets, schemas and test expectations outright. Keep independently useful pieces only when intentionally accepted. Consolidate the current database into a reproducible **fresh-install-only** schema and current RLS policies, not an old-version upgrade chain. Complete consistent ChessCoachPal branding, PWA manifest/icons and basic accessible/mobile behavior.

Add real two-teacher isolation tests against Supabase RLS, service-role route review and cross-workplace authorization checks. Audit **current and old GitHub history**, refs, PR refs, CI logs/artifacts, previous private references, secrets, student data and redistribution licenses. Record findings and actual remediation; rotate any compromised credentials. The repository is already public, but that does **not** establish publication safety.

## Non-goals

No CogNote data conversion, no backward-compatible aliases/flags, no database migration from pre-1.0 installs, and no proof claim that force-pushing a rewritten branch purges old GitHub objects.

## Acceptance

Fresh database initializes with only current chess-coaching schema. Music-only endpoints/assets are gone, new RLS tests prove teachers are isolated, current branding/PWA checks pass, and a documented privacy/history/third-party licensing review is approved. The first release remains blocked while any unresolved finding could expose real student data or credentials.

## Development verification boundary
All implementation and acceptance evidence for this development change SHALL come from merged GitHub commits and passing GitHub Actions tests/automated scans with synthetic data. No manual local deployment, live Lichess/ChatGPT/Claude login or actual vendor-client session is required to check tasks or archive this change. Record test URLs/findings in docs/STATUS.md (and docs/SECURITY.md for audits). The only real ChatGPT/Claude client exercise takes place at the **final local v0.1.0 prepublication release gate**; it does not waive security/privacy review requirements that can be completed in GitHub.

## Merged implementation and evidence

[PR #9](https://github.com/itshak/ChessCoachPal/pull/9) was squash-merged as [af9f4c6](https://github.com/itshak/ChessCoachPal/commit/af9f4c64de70e6b96674c5eb46fcaad35381548a). [Feature CI 42421265827](https://github.com/itshak/ChessCoachPal/actions/runs/42421265827), [E2E 42421265817](https://github.com/itshak/ChessCoachPal/actions/runs/42421265817) (25 passed, 5 skipped), and [reachable-history audit 42421265798](https://github.com/itshak/ChessCoachPal/actions/runs/42421265798) passed. On merged main, [CI 42421647203](https://github.com/itshak/ChessCoachPal/actions/runs/42421647203), [E2E 42421647198](https://github.com/itshak/ChessCoachPal/actions/runs/42421647198) (25 passed, 5 skipped) and [history audit 42421647204](https://github.com/itshak/ChessCoachPal/actions/runs/42421647204) also passed.

The release gate is **not approved**. The automated reachable-Git scan checks current and accessible old branch/PR refs and redacts its output; it does not prove deletion of cached old SHAs or full historical log/artifact/PII coverage. Remaining audit and remediation obligations are carried to Milestone 5 task 5.9, not falsely marked as complete here.
