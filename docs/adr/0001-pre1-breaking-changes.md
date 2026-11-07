# ADR-0001: Breaking changes are the default before 1.0.0

- **Status:** Accepted — binding project policy
- **Date:** 2026-11-07
- **Decision scope:** All ChessCoachPal code, API contracts, database schema, configuration, assets, and documentation while the project is prelaunch and below version `1.0.0`
- **Supersedes:** Compatibility, dual-read/dual-write, migration/backfill and deprecation requirements in existing OpenSpec proposals and docs where they conflict with this ADR

## Context

ChessCoachPal is still prelaunch and has no stable released data format, API, database schema, installation, or users to support. The CogNote source is a starting point, not a backward-compatible integration contract. Maintaining compatibility would add avoidable code, schema and testing complexity, and preserve music-studio assumptions in a chess-coaching product.

## Decision

**Two equally binding incompatibility rules:** (a) ChessCoachPal owes **zero compatibility to CogNote** (its data model, route names, settings, UI or upgrade path); and (b) **ChessCoachPal pre-1.0 versions owe zero compatibility to one another**. Existing source may be reused if useful, but never kept solely for compatibility. This covers the entire system, not just databases.

**Until the first `1.0.0` release, all internal and external contracts may change incompatibly without migrations or deprecation periods.** Prefer the clearest correct architecture to compatibility with any earlier checkout, development database or inherited CogNote behavior.

1. **Schema-first replacement, not incremental upgrade migrations.** Modify the canonical baseline schema and setup/seed files directly. Do **not** add sequential `ALTER TABLE` migrations, backfill jobs, compatibility views, dual reads/writes or adapters to keep older development databases working. Existing legacy CogNote migration files may be consolidated, rewritten or removed as part of the clean pre-1.0 bootstrap. If Supabase CLI still uses a `migrations/` directory as its installation mechanism, treat its consolidated baseline SQL as an **installation snapshot**, not an upgrade history.
2. **Reset disposable development data.** A new checkout initializes from the current canonical schema; an existing pre-1.0 development installation must drop/reset and reseed its database on breaking changes. Document the required destructive reset prominently. Never silently reset a database or wipe real data without the operator explicitly choosing to do so.
3. **Remove inherited baggage outright.** Rename, redesign or delete CogNote-specific tables, routes, components, assets, integrations and semantics rather than keep compatibility layers solely for upstream behavior. Retain upstream copyright and applicable open-source license notices.
4. **APIs/configurations are also unstable.** Freely change endpoints, tool schemas, events, env vars and component interfaces; delete obsolete names and contracts instead of offering aliases or deprecation paths. Mark pre-1.0 interfaces experimental.
5. **No migrations or backward compatibility acceptance work.** Do not invest in tests or code for data migration from earlier development schemas, maintaining old routes, retaining old PWA identity, or legacy account import. Tests target fresh setup and current contract only.
6. **Make breaking changes visible.** Update README, setup guide, OpenSpec, tests, CI and release notes for current requirements. On each change, state clearly when a full database reset is needed.

## Non-negotiable safeguards

- **Privacy and security still apply.** Pre-1.0 freedom does not permit exposure of student details, secrets, third-party data, or tenant boundaries. Keep authenticated access, RLS and ownership checks in the new schema.
- **No automatic destructive changes to real data.** If any instance might contain actual user/teacher information, require an explicit operator decision and backup/export before destroying it. The lack of a compatibility promise does not authorize deleting someone else's information.
- **License obligations still apply.** Keep CogNote's MIT attribution and third-party notices as required.
- **A future compatibility policy begins at `1.0.0`.** Before the stable release, decide, document and test versioned migrations/deprecation commitments appropriate to supported users.

## Consequences

- Faster simplification and a smaller, coherent chess-specific codebase.
- Old pre-1.0 deployments and development databases may be incompatible and require manual reset/reinstall.
- PRs should edit the authoritative schema/source in place and avoid new incremental upgrade migrations. A fresh-install integration test becomes the minimum database validation gate.
- This ADR takes precedence over conflicting requirements in `openspec/changes/adopt-cognote-chesscoachpal` and `docs/ARCHITECTURE.md` until those documents are revised.

## Implementation direction

The recently introduced `20261107000000_chess_coaching_core.sql` additive migration is contrary to this decision. Remove it and fold its definitions into the canonical initial schema and RLS bootstrap in the active implementation branch. Consolidate or replace inherited CogNote migration history into a single installation-only baseline as the port progresses. No backward compatibility with CogNote or any ChessCoachPal pre-1.0 version may be required by acceptance criteria.

**Acceptance evidence:** ADR in version control, implementation uses current schema on fresh database, and no compatibility layer is required by new features.
