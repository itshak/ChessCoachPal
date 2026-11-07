# Tasks — add-chess-learning-basics

Mark complete only after merged code and passing evidence is recorded in docs/STATUS.md.

- [x] 3.1 Define configurable teacher-owned chess skill categories with safe defaults in the canonical schema.
- [x] 3.2 Add student/session observations with date, skill dimension, author and teacher-verified versus AI-suggested provenance.
- [x] 3.3 Require explicit teacher approval before AI suggestions affect verified skills.
- [x] 3.4 Add selected Lichess Study and general HTTPS resource links with validation and optional stable provider identifiers.
- [x] 3.5 Implement website observation/resource history, creation, editing and post-reload persistence.
- [x] 3.6 Expose only authenticated and authorized implemented agent tool operations for read/propose/link via milestone 2.
- [x] 3.7 Test ownership isolation, correct provenance, link validation, error handling and unavailable-resource fallback with synthetic fixtures.
- [x] 3.8 Document supported chess basics and deliberately deferred rating sync/engine work; capture evidence.

## Acceptance evidence (all eight tasks complete)

**Accepted GitHub evidence:** [feature PR #7](https://github.com/itshak/ChessCoachPal/pull/7) merged into main commit [822a33f](https://github.com/itshak/ChessCoachPal/commit/822a33f0881821c1de479629bf15d39264d2dcc1). On its merged source revision, [CI 42415536708](https://github.com/itshak/ChessCoachPal/actions/runs/42415536708) passed typecheck, 441 unit tests, Docker and Compose; [E2E 42415536816](https://github.com/itshak/ChessCoachPal/actions/runs/42415536816) passed fresh synthetic Supabase reset, production build, OAuth/MCP/browser/RLS checks (**28 passed, 5 skipped, 0 failed**). No live ChatGPT, Claude or Lichess account was required; final local provider acceptance remains exclusively Milestone 5.

## Verification policy — GitHub only
All implementation and acceptance evidence for this development change SHALL come from merged GitHub commits and passing GitHub Actions tests/automated scans with synthetic data. No manual local deployment, live Lichess/ChatGPT/Claude login or actual vendor-client session is required to check tasks or archive this change. Record test URLs/findings in docs/STATUS.md (and docs/SECURITY.md for audits). The only real ChatGPT/Claude client exercise takes place at the **final local v0.1.0 prepublication release gate**; it does not waive security/privacy review requirements that can be completed in GitHub.
