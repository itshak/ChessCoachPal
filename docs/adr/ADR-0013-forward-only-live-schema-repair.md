# ADR-0013: Explicit forward-only schema repair for live pre-v1 data

- **Date:** 2026-11-17
- **Status:** Accepted historical incident and first transition; **general policy superseded by ADR-0015 (2026-11-18)**

## Context

ChessCoachPal keeps one current canonical SQL baseline for disposable fresh installations. During live private-beta development, new archive and historical-attendance functions/tables were appended to that baseline. A running Coolify database already recorded its migration version as applied, so the one-shot migrator correctly skipped the revised SQL. Application routes deployed after the change returned database errors because their SQL dependencies did not exist. The live database contains real teacher records, so dropping/resetting the schema is unacceptable.

## Decision

At the time of this 2026-11-17 incident, retain the single current full baseline for new installs and allow the first independently versioned, **additive, idempotent** migration: `20261117000000_live_historical_lifecycle_extension.sql`. It creates missing historical evidence tables, storage policies and archive/history RPCs, reuses current functions unchanged, avoids destructive DDL and reloads PostgREST schema. It is deliberately safe when installed after the complete baseline, too. The migration runner records its version and never replays it after a successful application. CI at that point specifically allowlisted this transition. Later authorized operational transitions were added; ADR-0015 now governs their review, one-time execution and explicit ordered CI allowlisting. This historical case is not a standing one-file cap.

Before applying an operator-initiated live repair: confirm a verified database backup and a successful restore into an isolated database; test both first application and repeat application there; check privileges/tenant boundaries; record before/after object and student counts. Deploy application code only after required database objects are available. Never apply the full fresh-install baseline to a running database or delete teacher history.

## Consequences

Future pre-v1 schema evolution may remain breaking for disposable environments but **must not destroy existing private-beta records**. Subsequent live changes require an explicit, reviewed migration decision and safe rollout gate; follow [ADR-0015](0015-baseline-first-and-one-time-live-transitions.md). This exception is not a blanket permission to add arbitrary migration chains. Reproduce existing-feature failures with synthetic data, and keep private teacher/student information out of public CI artifacts and documents.
