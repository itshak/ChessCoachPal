# Archived — adopt-cognote-chesscoachpal

- **Original change ID:** adopt-cognote-chesscoachpal
- **Archived:** 2026-11-07
- **Disposition:** Superseded and closed as a planning artifact; **NOT implemented or accepted in full**
- **Replacement plan:** [v0.1.0 roadmap](../../../ROADMAP-v0.1.0.md)
- **Upstream:** [CogNote](https://github.com/andresjmorales/cognote), MIT, pinned source SHA fff723ea0374df8f07a20e90e44c725499ec680a

## Why it was archived

The original proposal combined the entire product vision, porting, historical clean-up, AI clients, compensation, chess features and production release into one non-actionable change. Its original checklist had **zero formally completed tasks**. This archive retains only implementation facts actually supported by repository state or GitHub CI, instead of treating unverified or in-flight work as complete. The old design, requirements and outstanding task list have been removed from the active OpenSpec changes, not preserved as a parallel backlog.

## Retained, evidenced implementation history

- CogNote source is present in ChessCoachPal, with MIT attribution in LICENSE and docs/UPSTREAM.md. **This does not establish that every upstream file was checksum-verified.**
- The repository and initial app entry points were renamed for ChessCoachPal. This is **partial branding**, not a clean elimination of inherited music UI/assets.
- ADR-0001 was accepted on main: **no backward compatibility with CogNote and none between ChessCoachPal versions below 1.0.0** (main commit d325ae330acfac9172b1d76540c17839362738ac).
- GitHub CI on main successfully completed typecheck, unit, Docker and Compose jobs (run 42394424081). **Browser E2E failed** (run 42394424153) due to the PWA manifest icon count.
- Version metadata 0.0.0, CHANGELOG.md, release preparation, and automated GitHub Releases were merged on main (commit 8638077ea58fee5638779f0dbf3c9d95673fb9d5). The first release workflow run 42394424109 correctly skipped publication for 0.0.0.
- A separate [draft coaching PR #1](https://github.com/itshak/ChessCoachPal/pull/1) has proposed workplaces, groups, lessons, per-student attendance, web UI and experimental API. **These are not accepted on main.** Its coaching E2E failed (run 42392868328), so this archive does not mark them delivered.

## Outstanding work

All unmet product requirements are restated, narrowed and assigned to **five new active changes** in [the roadmap](../../../ROADMAP-v0.1.0.md). The original sprawling P0–P5 backlog, compatibility-era design and old requirement files are intentionally removed, not archived as a second set of active acceptance criteria.

The repository is **already public**, while historic privacy, license and secret exposure review is incomplete. Publishing a GitHub Release remains blocked until the separate security and release acceptance criteria are actually satisfied.

