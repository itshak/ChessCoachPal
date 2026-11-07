# First functional self-hosted release

## ADDED Requirements

### Requirement: Self-host core coaching without external AI accounts
A new teacher SHALL install ChessCoachPal with an empty local database, sign in and complete all core website operations without a mandatory external AI, Notion, Google or Lichess account.

#### Scenario: AI services are unavailable
- **WHEN** ChatGPT and Claude are unavailable or not configured
- **THEN** the instructor SHALL still add/edit student, workplace, group, lesson, attendance, notes and resource references through the website.

### Requirement: Complete current-schema backup and restore
An operator SHALL explicitly back up and restore the current database and uploaded files into a fresh installation and verify completeness.

#### Scenario: Restore synthetic coaching activity
- **WHEN** a backup containing students, sessions, individual attendance and an uploaded file is restored into a second instance
- **THEN** expected rows, relationships and file contents SHALL match
- **AND** no migration from older ChessCoachPal versions SHALL be required.

### Requirement: Deterministic workplace summary
The app SHALL compute an authorized workplace/date-range activity summary from stored session and attendance data, counting teacher minutes once per group session and preserving individual attendance counts.

#### Scenario: Four-person group
- **WHEN** the teacher reports a 60-minute group with four participants
- **THEN** the report SHALL show 60 teaching minutes, not 240
- **AND** attendance SHALL reflect four participant statuses.

### Requirement: Release readiness gates
Publishing v0.1.0 MUST be prevented until the website, two real AI clients, security/tenant checks, fresh setup, backup/restore and privacy/license review have passed with evidence.

#### Scenario: Required Playwright check fails
- **WHEN** any release-critical E2E test fails for a candidate commit
- **THEN** the workflow SHALL NOT publish a v0.1.0 tag or GitHub Release.

### Requirement: Traceable version, changelog and source
Every public version SHALL be tagged at the exact tested commit, with human-readable changes and automatic ZIP/tar.gz source archives. The first *functional* version SHALL be v0.1.0.

#### Scenario: Verified bump reaches main
- **WHEN** a reviewed v0.1.0 package/lock/changelog bump reaches main and the release gate succeeds
- **THEN** an annotated v0.1.0 tag and GitHub Release SHALL exist
- **AND** changelog notes, tested commit and downloadable sources SHALL be consistent.

