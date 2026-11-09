# Typed reusable chess learning materials — delta specification

## ADDED Requirements

### Requirement: One materials registry supports distinct native chess content types
The system SHALL have one teacher-owned material identity, search, history and assignment reference. Game, puzzle, drill, study chapter and external link kinds SHALL use correct native validation and type-specific data, not a single games table or unrestricted JSON payload.

#### Scenario: Coach creates four different chess resources
- **WHEN** a coach imports one PGN game, creates a FEN puzzle, defines a repeatable calculation drill and saves one Lichess Study chapter
- **THEN** each SHALL have its own stable material ID and type-validated payload where applicable
- **AND** all SHALL appear in a common teacher-scoped material search
- **AND** a drill SHALL NOT be stored as a chess game or a completed puzzle.

#### Scenario: Invalid chess content
- **WHEN** a material includes malformed PGN/FEN or a payload incompatible with its kind
- **THEN** it SHALL be rejected with a typed error and no orphan root or subtype record.

### Requirement: Related resources retain separate meaning
Explicit material relationships SHALL connect a puzzle to the game it was extracted from or a drill to the puzzles it uses; they SHALL NOT imply that the linked items are the same material or event.

#### Scenario: Tactical puzzle extracted from a game
- **WHEN** a teacher extracts a puzzle from Daniel's annotated game
- **THEN** the puzzle SHALL have distinct starting position/solution details and a link to the source game
- **AND** the game SHALL retain its own original PGN/player metadata
- **AND** solving the puzzle SHALL NOT mean that Daniel played or won the source game.

### Requirement: Material lifecycle stages are factual and distinct
Material linked, taught, assigned, attempted, completed, reviewed and mastered/assessed SHALL be independent factual states/events with author, source, time and student/session association where relevant. A linked study URL alone SHALL NOT be counted as taught, and a completion marker SHALL NOT automatically establish mastery.

#### Scenario: Coach bookmarks an unused chapter
- **WHEN** a chapter is linked to a student but never covered in a lesson
- **THEN** history SHALL show it as linked, not taught, attempted or completed.

#### Scenario: Remote source unavailable
- **WHEN** Lichess is unreachable or a private chapter cannot be fetched
- **THEN** authorized local links and history SHALL remain accessible
- **AND** unverified title, ordinal, solution or contents SHALL be shown as unknown or stale, not invented.

### Requirement: Materials are private, consistent and MCP-accessible
Every ordinary material create/read/update/link/correct/export action and editable field SHALL be available through authenticated shared website/MCP services with teacher ownership, bounded inputs, revision and replay safeguards.

#### Scenario: Foreign tenant material
- **WHEN** one teacher references another's material UUID or tries to link it to a local drill
- **THEN** the operation SHALL fail without disclosing the foreign material.

#### Scenario: Duplicate material creation retry
- **WHEN** a teacher retries the same material creation using one idempotency key
- **THEN** the same root ID SHALL be returned with exactly one matching subtype row.
