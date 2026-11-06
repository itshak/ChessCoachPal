# Attribution, branding and safe publication

## ADDED Requirements

### Requirement: MIT provenance
ChessCoachPal SHALL preserve the MIT license and original CogNote copyright attribution, with a pinned upstream source reference.

#### Scenario: Reviewing copyright
- **WHEN** a reader opens LICENSE and source provenance documentation
- **THEN** they SHALL see original author Andres Jaime Morales and the source repository
- **AND** the ChessCoachPal contributions SHALL not imply upstream endorsement.

### Requirement: Brand separation
The website SHALL present ChessCoachPal consistently in its title, metadata, navigation, icons, PWA, notifications and onboarding. Obsolete music-focused pages SHALL be removed from primary navigation until adapted.

#### Scenario: Installable web app
- **WHEN** a user installs the PWA
- **THEN** the launcher SHALL show a ChessCoachPal-branded name and icon
- **AND** metadata SHALL describe a chess-coaching assistant rather than a music practice app.

### Requirement: Privacy before publication
The publication checklist SHALL examine branch history, cached commit references, releases, workflows, artifacts, screenshots, fixtures and third-party licenses. Replacing a branch root alone SHALL NOT be considered proof that old commit objects have been purged.

#### Scenario: History scan finds prior references
- **WHEN** an old SHA remains retrievable from GitHub
- **THEN** release approval SHALL remain blocked
- **AND** the repository SHALL stay private until old exposure is addressed.

### Requirement: Reproducible baseline
A clean CogNote snapshot SHALL be imported with its lockfile, tests, CI and migrations at an exact SHA. Tests SHALL be run and reported honestly.

#### Scenario: Build failure
- **WHEN** the imported baseline fails typecheck or tests
- **THEN** docs/STATUS.md SHALL report the failure and reproduction details
- **AND** the project SHALL not describe the baseline as passing.
