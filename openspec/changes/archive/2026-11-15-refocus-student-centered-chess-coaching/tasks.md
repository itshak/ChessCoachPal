# Implementation tasks — student-centered chess coaching

**Proposed only. All tasks unchecked.** Do not claim these features implemented, accepted or archived based on proposal-only commits. Implement in small feature PRs; every teacher website business change needs matching MCP, registry and authenticated integration tests in the same PR.

## A. Reconcile source of truth and scope
- [ ] A1. Review current source, schema, parity inventory and existing active OpenSpec changes. Assign single owners for alias resolution, group lesson capture, chapter lookup and material history; eliminate duplicate implementations.
- [ ] A2. Define one canonical fresh-install schema and documented operator reset/backup precautions under ADR-0001. Never reset a possibly real-data database without authorization.
- [ ] A3. Inventory every affected website field/action and map corresponding typed MCP commands and website↔MCP tests. Retain existing 93-case strict release gate.

## B. Student first and contacts (slice 1)
- [ ] B1. Add tenant-safe contacts + student-contact role/permission model; adult self contact without family, siblings sharing one guardian, payer separate from portal permissions.
- [ ] B2. Update student creation, profile/edit, guardian access and portal workflow. Remove synthetic family-of-one and unnecessary adult birthdate/guardian requirements. Preserve privacy, authorized minors' access and revocation.
- [ ] B3. Revise navigation, onboarding, Today and terminology; relocate Family/Studio/Billing emphasis without orphaning required features.
- [ ] B4. Add full MCP student/contact read/write/link/unlink and parity tests, including foreign IDs, guardian scopes and student/household separation.
- [ ] B5. Verify archived-student history/search/export and safe reactivation with transaction-level quota check and future *group* commitment handling.

## C. Canonical lesson history and conversational capture (slice 2)
- [ ] C1. Consolidate lesson occurrence/recurrence models; remove independently writable duplicate history in the fresh baseline; reconcile reports, attendance and financial totals.
- [ ] C2. Implement ad-hoc multi-student frozen roster, one teacher duration, per-student attendance/material references, timezone/DST and history corrections.
- [ ] C3. Reuse alias resolution and capture preview/confirmed atomic idempotent commit from existing conversational OpenSpec; unknown names/time/attendance/grades require explicit resolution.
- [ ] C4. Add website and MCP read/write/correct/report parity tests: one 90-minute lesson with three students; retries, stale revision, double counting, cross-tenant, archive implications.

## D. Unified typed material catalog (slice 3)
- [ ] D1. Add shared `learning_materials` (kind/provenance/source/revision), validated subtype tables for games, puzzles, drills and study chapters; external_link for unstructured references. Add owner-keyed FKs/RLS, limits and atomic root+payload writes.
- [ ] D2. Validate bounded PGN game metadata, puzzle FEN and optional solutions, drill items/repetition goals, exact study/chapter provider identity. Unknown metadata remains unknown.
- [ ] D3. Add collections and relations: puzzle extracted_from game; drill contains/reuses puzzles; prohibit foreign/self/cyclic dependencies where relevant.
- [ ] D4. Reconcile existing `chess_learning_resources` and `chess_material_progress` into one durable reference/history model. Separate linked, taught and assigned facts; no dual writes/false mastery.
- [ ] D5. Add website catalog/search/type-specific editors and full matching MCP create/read/edit/link/correction/export operations.
- [ ] D6. Test malformed PGN/FEN, mismatched subtype, same-name different games, external outage, link-only puzzles, duplicate create, foreign material relation, archived student material histories.

## E. Plans, homework and review (slice 4)
- [ ] E1. Add training plans/goals with student-scoped focus, optional target, author, revision and status; preserve distinction between verified teacher and AI-suggested facts.
- [ ] E2. Add per-student assignments of any material kind, optional due date, instructions and optional group-batch origin; no implicit group enrollment.
- [ ] E3. Add attempts/submissions and separate coach review, with correction audit and exact statuses; completion is NOT equivalent to mastery.
- [ ] E4. Add instructor website/MCP plan, assignment, attempt and review CRUD/query/export with full field parity; student portal deferred.
- [ ] E5. Test group fan-out, attempts with unknown outcomes, game analysis homework, puzzle solution checks only when evidence exists, drill practice, duplicate retries, foreign teacher denial.

## F. Coach briefings, end-to-end and acceptance
- [ ] F1. Build deterministic briefing service: recent sessions, taught/assigned/completed materials, pending reviews, goals, verified observations and explicit unknowns with source IDs.
- [ ] F2. Add student/Today/lesson UI and `ccp_v1_coach_briefing_get` MCP; tests for local-provider outage, source fidelity, missing/ambiguous data and no AI-invented grades.
- [ ] F3. Run synthetic full journey: Daniel + Yael share one 90-minute chapter lesson, two distinct teacher observations, Daniel-only assignment, next-lesson follow-up. Re-run with same idempotency keys and verify exact once.
- [ ] F4. Extend versioned parity registry, CI PR guard, existing 93-case checklist and new scenario tests; verify RLS, OAuth scopes, archived-history export and correction paths in fresh GitHub synthetic integration.
- [ ] F5. Run all applicable GitHub CI, E2E, security and fresh-db/Compose tests per implementation PR; repair failures. Record merged-main SHA and exact passing Actions evidence in docs/STATUS.md.
- [ ] F6. Archive only when all in-scope tasks and accepted parity evidence are on merged main. Do not infer real ChatGPT/Claude acceptance before the separate final local v0.1.0 publication check.

## Deferred — not acceptance blockers

Chess engine/game evaluation, automatic Lichess/Chess.com ratings/imports, remote Study writes/FEN publishing, student portal submissions, live board/video, official invoice/tax-provider work, multi-coach academy, advanced AI-generated lesson plans and automatic mastery/ratings.
