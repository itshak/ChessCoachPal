# ChessCoachPal development and release status

**Updated:** 2026-11-07 · **Branch of record:** main · **Version:** 0.0.0 (unreleased) · **Target:** first functional v0.1.0

## OpenSpec source of truth

The original omnibus change was **superseded, not completed**: only verifiable implementation history remains in [its archive](../openspec/changes/archive/2026-11-07-adopt-cognote-chesscoachpal/proposal.md). The old unchecked requirements and compatibility-era design were removed. The five **active** changes and their dependencies are in the [v0.1.0 roadmap](../openspec/ROADMAP-v0.1.0.md):

1. [complete-coaching-workflows](../openspec/changes/complete-coaching-workflows/proposal.md) — **Proposed / PR #1 draft, not merged**.
2. [connect-chatgpt-and-claude](../openspec/changes/connect-chatgpt-and-claude/proposal.md) — **Proposed / real MCP and delegated OAuth not implemented**.
3. [add-chess-learning-basics](../openspec/changes/add-chess-learning-basics/proposal.md) — **Proposed / not accepted**.
4. [remove-cognote-legacy-and-secure-data](../openspec/changes/remove-cognote-legacy-and-secure-data/proposal.md) — **Proposed / unresolved security and legacy cleanup**.
5. [verify-self-hosting-and-release-v0-1-0](../openspec/changes/verify-self-hosting-and-release-v0-1-0/proposal.md) — **Proposed / release blocked by upstream milestones**.

No new milestone tasks are checked until **main-merged code, passing tests and evidence** justify them. This file is the central evidence ledger; a proposed change or an open draft PR is not "done".

## Accepted on main

- CogNote-derived source foundation imported and MIT attribution retained (upstream author Andres Jaime Morales, pinned SHA fff723ea0374df8f07a20e90e44c725499ec680a). This **does not** prove file-by-file manifest verification or full removal of CogNote baggage.
- Initial ChessCoachPal identity and documentation (partial rebrand).
- [ADR-0001](adr/0001-pre1-breaking-changes.md), main commit d325ae330acfac9172b1d76540c17839362738ac: **zero compatibility** with CogNote or earlier ChessCoachPal versions until 1.0.0. All current schemas are fresh-install snapshots, not upgrade chains.
- GitHub release/version automation, CHANGELOG.md and release instructions, main commit 8638077ea58fee5638779f0dbf3c9d95673fb9d5. GitHub Actions run [42394424109](https://github.com/itshak/ChessCoachPal/actions/runs/42394424109) succeeded and correctly **did not** publish a release for the development version 0.0.0.
- **Main CI passed** on commit 8638077: [run 42394424081](https://github.com/itshak/ChessCoachPal/actions/runs/42394424081) (typecheck, unit tests, Docker build and Compose).

## In draft PR, not accepted

[PR #1 — first coaching workflow](https://github.com/itshak/ChessCoachPal/pull/1), head 528d2165227c194e49410d30a5c8afceb9fdef2a, proposes teacher-owned workplaces, groups, per-student attendance, session roster snapshots, shared service, experimental /api/agent/v1 and /coaching page. **It has not been merged.** Its old omnibus OpenSpec edits must be dropped/reconciled before merge so archived requirements do not reappear.

PR #1 CI [42392868345](https://github.com/itshak/ChessCoachPal/actions/runs/42392868345) succeeded for typecheck/unit/Docker/Compose; E2E [42392868328](https://github.com/itshak/ChessCoachPal/actions/runs/42392868328) **failed**: 23 passed, 5 skipped, 1 failed because the coaching scenario timed out locating the Workplace selection control. Database initialization and production build succeeded in that E2E run, but the full teacher workflow is not verified.

## Existing main regression

[Main E2E run 42394424153](https://github.com/itshak/ChessCoachPal/actions/runs/42394424153) **failed**: 22 passed, 5 skipped, 1 failed. The PWA manifest includes one icon but the installability test expects at least two. This is assigned to the legacy/branding/security change. Successful main CI does **not** imply passing browser acceptance.

## Security/publication and self-hosting

The GitHub repository is **already public**. The historical privacy/secret scan, upstream/third-party asset license review and old GitHub refs/artifacts investigation are **not signed off**. This is an urgent release blocker: do not assert repo history was fully purged or that real-world student data is safe without evidence.

No real external student data has been imported in the recorded work. No real ChatGPT or Claude client, production installation, complete backup/restore or cross-teacher RLS integration acceptance has been verified. The inherited Supabase migration chain still includes CogNote artifacts and requires consolidation.

## Developer and release rules

- A development database may need an **explicit** destructive reset onto the current fresh-install schema; always back up any actual records first. Never silently delete user data.
- Keep changes in the five new OpenSpec folders; require code+test evidence to close tasks.
- Update this document after each milestone; only mark release checkboxes in [RELEASING.md](RELEASING.md) with observed verification.
- Do not bump package version to 0.1.0 or publish a release until all milestone acceptance gates and six release checkboxes pass.
