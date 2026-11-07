# Coaching records and website workflows

## ADDED Requirements

### Requirement: Configurable teacher-owned workplaces and students
The system SHALL let each authenticated teacher maintain independent workplaces (name, timezone, locale and currency) and one canonical student identity that can enroll in multiple workplaces or groups, without exposing another teacher's data.

#### Scenario: A student joins two workplaces
- **WHEN** a teacher enrolls an existing student in a new workplace and class group
- **THEN** the original student ID SHALL be reused
- **AND** session and note views SHALL only show information authorized in the selected workplace.

### Requirement: Private and group sessions
A teacher SHALL create, inspect and correct private and group sessions independently of the number of participants, with unambiguous starts, IANA timezones and a duration measured once per session.

#### Scenario: Instructor works with four learners
- **WHEN** four students attend one 60-minute group session
- **THEN** four participant records SHALL exist
- **AND** teacher time SHALL be 60 minutes, not 240 minutes.

#### Scenario: Reschedule across a DST transition
- **WHEN** the teacher changes a session date at a workplace with a DST transition
- **THEN** the app SHALL display and persist the intended unambiguous local instant
- **AND** invalid/nonexistent times SHALL be rejected or explicitly resolved, not silently moved.

### Requirement: Attendance and durable historical snapshots
For every group lesson the system SHALL store an expected-participant snapshot and support independent attendance statuses and student-specific notes. Historical rosters SHALL remain stable when group membership later changes.

#### Scenario: A student is absent
- **WHEN** a group learner is marked absent while classmates are present
- **THEN** only that student's attendance state SHALL change
- **AND** the group session SHALL remain scheduled and the teacher's duration SHALL remain unchanged.

### Requirement: Website read/write parity without an AI provider
The web UI SHALL support create, edit, view and correction of students, workplaces, groups, sessions, notes and attendance through shared authenticated domain commands, without requiring an AI subscription.

#### Scenario: Correct and reload
- **WHEN** a teacher corrects a session note and student attendance from the website and reloads
- **THEN** the corrected, scoped records SHALL be displayed from the database
- **AND** the UI SHALL not depend on ChatGPT or Claude availability.

### Requirement: Scoped validated writes
All commands SHALL resolve the teacher on the server, validate workplace and group relationships, and reject unauthorized participant IDs. Retried create operations SHALL not create duplicate sessions.

#### Scenario: Unrelated teacher sends a known session ID
- **WHEN** teacher B requests or mutates teacher A's session by UUID
- **THEN** the server SHALL deny access without disclosing teacher A's notes or student identity.

