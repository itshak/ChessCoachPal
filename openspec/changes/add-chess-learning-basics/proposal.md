# Change: add-chess-learning-basics

- **Status:** Proposed — milestone 3 of 5
- **Target:** ChessCoachPal v0.1.0
- **Depends on:** [complete-coaching-workflows](../archive/2026-11-07-complete-coaching-workflows/proposal.md) student and lesson records.
- **Roadmap:** [v0.1.0](../../ROADMAP-v0.1.0.md)

## Why

ChessCoachPal should offer chess-specific value, not only a generic class manager renamed from CogNote. The first functional release needs student learning observations and curated chess resources, but not an embedded board, engine or synchronized ratings.

## Change

Introduce configurable chess skill categories (tactics, calculation, endgames, strategy, opening principles, time management), student/session observations and teacher versus AI-suggested provenance. Require teacher confirmation before an AI suggestion becomes a verified assessment.

Support selected Lichess Study and general HTTPS learning-resource links on student and session pages; retain stable provider identifiers where available, without copying private or copyrighted study content. Make these records readable/editable in the website, reusable via approved agent commands and independent of a Lichess login.

## Non-goals

No automatic Lichess/Chess.com ratings synchronization, chessboard, engine, PGN analysis, full lesson generator, third-party report adapters or compensation calculations. Ratings integrations can be a later OpenSpec change.

## Acceptance

A teacher records a verified endgame observation and links a selected Lichess Study to a student or lesson; the data survives reload, and a separate AI suggestion remains unverified until explicitly accepted. Another teacher cannot view it, and Lichess unavailability does not block internal records. All relevant unit, RLS and browser tests pass.

## Development verification boundary
All implementation and acceptance evidence for this development change SHALL come from merged GitHub commits and passing GitHub Actions tests/automated scans with synthetic data. No manual local deployment, live Lichess/ChatGPT/Claude login or actual vendor-client session is required to check tasks or archive this change. Record test URLs/findings in docs/STATUS.md (and docs/SECURITY.md for audits). The only real ChatGPT/Claude client exercise takes place at the **final local v0.1.0 prepublication release gate**; it does not waive security/privacy review requirements that can be completed in GitHub.
