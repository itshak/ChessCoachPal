# ChessCoachPal implementation status

**Pre-1.0 release, not production ready.** Source based on CogNote by Andres Jaime Morales (MIT), pinned upstream SHA `fff723ea0374df8f07a20e90e44c725499ec680a`; there is **no compatibility commitment to CogNote or to any ChessCoachPal pre-1.0 release**. See [ADR-0001](adr/0001-pre1-breaking-changes.md).

## Implemented on feature branch `feat/first-coaching-workflow` (2026-11-07)

- [x] ADR-0001 accepted and committed. All future development targets a current clean install; pre-1.0 development data may need explicit reset.
- [x] Teacher-owned workplaces and class groups, enrollments and session rosters are defined **inside the initial database schema**, with owner-composite foreign keys and RLS in the canonical policy file.
- [x] Group and private teaching sessions, one teacher-duration per session, lesson notes and per-student attendance tables; immutable enrollment snapshot is created on session insert.
- [x] Shared server command functions and `POST /api/agent/v1` with Supabase teacher-session authentication, narrow validated commands, capped lists and teacher ownership checks.
- [x] Web `/coaching` page uses that same API to create workplaces/classes, enroll students, schedule sessions and record attendance. Main navigation now exposes Coaching instead of the music-lesson screen.
- [x] New compatibility-style migration deleted; definitions moved into canonical schema.
- [ ] Integration verification of **fresh** Supabase schema, end-to-end workflow and tenant isolation.
- [ ] Running authenticated ChatGPT and Claude connectors: OAuth delegation, MCP transport, tool manifests, proper confirmation flows and agent integration tests are not implemented.
- [ ] Consolidate/delete inherited CogNote migration history and remove unused music-centric tables, UI routes, assets, dependencies and code. Imported upstream features are not automatically accepted ChessCoachPal features.
- [ ] Production readiness, all tests, license audit and history/privacy publication audit.

## Testing and publication status

GitHub source has been made **public** by the repository owner. This does **not** establish that the historical secret/privacy audit is complete. Review old commits, tags, Actions artifacts and caches, and rotate any potentially exposed credentials. Do not put real student details in public issues or fixtures.

No data was imported from external student/customer systems. No external agent was connected and no production deployment was verified in this work. The local execution environment cannot fetch the public GitHub repository to run the install; GitHub CI evidence will be recorded separately when available.

## Developer reset rule

The active `supabase/migrations/` hierarchy still contains **inherited CogNote installation SQL** pending consolidation. The current coaching schema is edited directly in `20260302000000_initial_schema.sql` and RLS in `20260302000001_rls_policies.sql`. Do not add sequential pre-1.0 migration files. Use a brand-new disposable database or deliberately reset it and rerun the **current** baseline; do not attempt an upgrade from a prior version. Back up before any operator-initiated destructive reset.
