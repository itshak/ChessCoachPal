# Student training plans, homework, attempts and teacher review — delta specification

## ADDED Requirements

### Requirement: A training plan contains student-specific goals
A teacher SHALL set, read, revise and review student-specific training plans/goals with focus areas, optional target dates and provenance. AI-suggested goals or assessments SHALL NOT silently become teacher-approved facts.

#### Scenario: Rook-endgame goal
- **WHEN** a coach adds a rook-endgame objective to Daniel's plan
- **THEN** the goal SHALL reference Daniel, its author and review status
- **AND** all its editable business fields SHALL be available via both website and MCP.

### Requirement: Homework assignments reference any material type
Assignments SHALL reference one student and one common material ID (game, puzzle, drill, chapter or link), instructions and optional due date. A group assignment SHALL create separately trackable work for each selected student without duplicating teacher session duration.

#### Scenario: Same puzzle assigned to three pupils
- **WHEN** the teacher assigns one puzzle to Daniel, Yael and Noa
- **THEN** three student-specific assignments SHALL be created referencing the same puzzle
- **AND** independent statuses SHALL be tracked
- **AND** no new lesson or group enrollment SHALL be created.

#### Scenario: Annotate a game for homework
- **WHEN** the teacher assigns Daniel an existing game's analysis
- **THEN** the assignment SHALL reference the game material and not copy it into an assignment-specific game record.

### Requirement: Completion, attempt and teacher review are separate
The system SHALL record evidence or manual claims of work, attempts and independent teacher review. A completed item SHALL NOT automatically be marked mastered, graded, teacher-verified or understood.

#### Scenario: Puzzle completed but not reviewed
- **WHEN** Daniel's puzzle assignment is marked completed
- **THEN** the completion source/date MAY be recorded
- **AND** teacher-reviewed and mastered status SHALL remain pending or unknown until an explicit review/assessment.

#### Scenario: Incorrect attempt corrected
- **WHEN** the teacher corrects an attempt result
- **THEN** a revision or auditable correction SHALL be required
- **AND** earlier meaningful history SHALL not silently disappear.

### Requirement: Assignment history remains tenant-safe and archive-safe
A teacher SHALL see historical assignments after the student is archived, subject to retention and privacy controls. Foreign teacher, stale revision and replay requests SHALL be denied or safely resolved without duplicate side effects.

#### Scenario: Foreign review request
- **WHEN** teacher B submits teacher A's assignment or attempt ID
- **THEN** the write SHALL fail without revealing private data.

#### Scenario: Repeated bulk assignment commit
- **WHEN** a confirmed group assignment is retried with the same idempotency key
- **THEN** no duplicated student assignments or notifications SHALL be created.
