# Chess pedagogy and deterministic reports

## ADDED Requirements

### Requirement: Chess-specific learning records
Teachers SHALL define skill categories and record chess observations with a clear source. AI-generated suggestions SHALL be distinguished from teacher-verified assessments.

#### Scenario: An AI suggests a weakness
- **WHEN** an AI proposes that a student's endgame technique needs practice
- **THEN** the record SHALL be labeled as an unverified suggestion
- **AND** no teacher-verified skill rating SHALL change without confirmation.

### Requirement: External chess references
Lichess and Chess.com ratings SHALL be stored with platform, time control, variant, timestamp and provisional status. Selected study references SHALL have stable provider identifiers.

#### Scenario: Different rating pools
- **WHEN** a student has a Lichess blitz rating and a Chess.com rapid rating
- **THEN** the system SHALL present them as separate measurements
- **AND** SHALL not average them into a single rating without explicit teacher-approved calibration.

### Requirement: Reports
Reports SHALL be deterministic and scope by workplace, date range, timezone and verified student display names. RTL output SHALL be supported.

#### Scenario: Hebrew attendance summary
- **WHEN** a teacher exports a report configured for Hebrew
- **THEN** the report SHALL use correct dates, RTL display, student names and per-student minutes
- **AND** instructor minutes SHALL not be multiplied by class size.

### Requirement: No mandatory chessboard
The initial release SHALL support chess material links and progress without embedding an interactive chessboard or analysis engine.

#### Scenario: Viewing a linked study
- **WHEN** a teacher opens an assigned Lichess study
- **THEN** the app SHALL follow the permitted external resource link
- **AND** core records SHALL remain accessible if Lichess is unavailable.
