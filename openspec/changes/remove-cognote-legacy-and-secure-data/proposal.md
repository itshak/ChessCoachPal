# Change: remove-cognote-legacy-and-secure-data

- **Status:** Proposed — milestone 4 of 5
- **Target:** ChessCoachPal v0.1.0
- **Dependencies:** Coordinate the canonical schema with [complete-coaching-workflows](../archive/2026-11-07-complete-coaching-workflows/proposal.md); security acceptance also gates the agent interface.
- **Roadmap:** [v0.1.0](../../ROADMAP-v0.1.0.md)

## Why

The public repository still contains music/practice features, unnecessary dependencies/assets and approximately 47 inherited SQL migration files. The historical privacy, credential-exposure and third-party license reviews are not complete. Passing TypeScript tests alone cannot make these safe or appropriate for an open-source chess product.

## Change

Remove obsolete music-only pages, API endpoints, dependencies, assets, schemas and test expectations outright. Keep independently useful pieces only when intentionally accepted. Consolidate the current database into a reproducible **fresh-install-only** schema and current RLS policies, not an old-version upgrade chain. Complete consistent ChessCoachPal branding, PWA manifest/icons and basic accessible/mobile behavior.

Add real two-teacher isolation tests against Supabase RLS, service-role route review and cross-workplace authorization checks. Audit **current and old GitHub history**, refs, PR refs, CI logs/artifacts, previous private references, secrets, student data and redistribution licenses. Record findings and actual remediation; rotate any compromised credentials. The repository is already public, but that does **not** establish publication safety.

## Non-goals

No CogNote data conversion, no backward-compatible aliases/flags, no database migration from pre-1.0 installs, and no proof claim that force-pushing a rewritten branch purges old GitHub objects.

## Acceptance

Fresh database initializes with only current chess-coaching schema. Music-only endpoints/assets are gone, new RLS tests prove teachers are isolated, current branding/PWA checks pass, and a documented privacy/history/third-party licensing review is approved. The first release remains blocked while any unresolved finding could expose real student data or credentials.

