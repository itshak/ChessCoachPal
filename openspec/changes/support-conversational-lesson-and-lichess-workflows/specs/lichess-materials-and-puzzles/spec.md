# Proposed specification delta: Lichess material management and puzzles

**Status: PROPOSED.** Current ChessCoachPal persists sanitized URLs only; it does not fetch remote studies or publish chapters.

## Requirements and scenarios

### Requirement: Teacher connects Lichess safely on website
- **WHEN** teacher visits Materials → Lichess
- **THEN** they SHALL connect OAuth PKCE `study:read` or deliberately select an encrypted token alternative, see account/scopes and disconnect without exposing provider secrets via MCP/browser logs.
- **WHEN** teacher requests first external write
- **THEN** `study:write` permission and explicit approval SHALL be obtained separately from ChessCoachPal `coach:write`.

### Requirement: Scope-aware study selection and exact chapter matching
- **WHEN** teacher selects different default lesson/puzzle studies at teacher, Marshal workplace and a specific student's profile
- **THEN** system SHALL show precedence and use the most specific authorized selection, with teacher override.
- **WHEN** teacher explicitly names an accessible nonselected study
- **THEN** it SHALL still be linkable to the chosen session and named students without silently changing default preferences.
- **WHEN** teacher refers to “Classic Games 2 game 32” or “Steinitz vs Chigorin”
- **THEN** search SHALL return the authorized provider study ID, chapter ordinal, immutable chapter ID, title and PGN White/Black/Event metadata; ambiguous matches SHALL request selection.
- **WHEN** Lichess API denies access, rate-limits, goes offline or returns unverified data
- **THEN** old local references remain viewable as stale/unverified, no guessed material ID or private PGN leaks, and a safe retry policy is enforced.

### Requirement: Puzzle image requires valid full FEN and review
- **WHEN** a teacher pastes a position image into a vision-capable chat
- **THEN** client MAY infer candidate pieces, but server SHALL use `chess_fen_validate`, show an editable position preview and obtain missing side to move, castling and en passant state before publication.
- **WHEN** MCP client cannot transmit image bytes or vision interpretation is uncertain
- **THEN** website manual-FEN/board editor SHALL provide a complete fallback; no automatic "image converted" claim is allowed.
- **WHEN** FEN violates chess rules/structure
- **THEN** publisher SHALL reject with a meaningful validation error rather than sending malformed PGN to Lichess.

### Requirement: Permissioned chapter import and 64-chapter rollover
- **WHEN** the teacher confirms valid FEN in a selected study with room
- **THEN** service SHALL serialize SetUp/FEN PGN, use Lichess chapter-import API with `study:write`, verify provider study/chapter IDs and return durable material reference.
- **WHEN** no puzzle study is selected
- **THEN** with teacher approval it SHALL create a private/unlisted Puzzles study and account for any automatically created starter chapter in capacity.
- **WHEN** the current puzzle study has reached Lichess maximum 64 chapters
- **THEN** the system SHALL choose a collision-safe owned successor Puzzles 2, Puzzles 3, etc., with confirmation, without deleting unrelated material.
- **WHEN** provider study creation quota (up to 30/day), 429 or permission failure blocks rollover
- **THEN** it SHALL preserve a local pending draft and report why publication didn't occur.
- **WHEN** remote write timed out after provider acceptance or two callers publish concurrently near capacity
- **THEN** persisted intents and chapter fingerprint reconciliation SHALL prevent duplicate chapters/studies or false success.
- **WHEN** another teacher tries to access someone else's material credentials/studies/drafts
- **THEN** tenant RLS/owner checks SHALL deny all such reads and writes.
