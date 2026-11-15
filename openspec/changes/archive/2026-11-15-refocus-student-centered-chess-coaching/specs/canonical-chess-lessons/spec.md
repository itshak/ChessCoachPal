# One canonical chess lesson and group-history model — delta specification

## ADDED Requirements

### Requirement: One actual lesson has one authoritative teacher duration
The system SHALL keep one canonical session record per actual lesson with a frozen roster, regardless of private, registered-group or ad-hoc multi-student composition. Recurring timetable rules SHALL NOT create an independently countable completed lesson history.

#### Scenario: One club group session
- **WHEN** a teacher confirms a 13:00–14:30 session for Daniel, Yael and Noa
- **THEN** the system SHALL count exactly 90 teacher minutes, not 270
- **AND** each student SHALL have independent attendance, materials and observations
- **AND** website and MCP history/report totals SHALL agree.

#### Scenario: Correct one student's attendance
- **WHEN** the teacher corrects Yael's attendance after a lesson
- **THEN** other participants, original frozen roster and one-session duration SHALL remain unchanged
- **AND** the correction SHALL be revision-checked and auditable.

### Requirement: Natural-language capture requires preview and idempotent confirmed commit
A capture preview SHALL resolve student aliases, teacher local day, time/workplace and material references, identify unknowns and conflicts, and make no state changes. Confirmed commit SHALL use one atomic transaction/receipt to avoid duplicate sessions, attendance or materials.

#### Scenario: Shared Hebrew-English alias
- **WHEN** a nickname matches two different students
- **THEN** preview SHALL return an explicit ambiguity and no automatic identity choice
- **AND** no session SHALL be written before teacher resolution.

#### Scenario: A request is retried
- **WHEN** the same confirmed lesson capture is retried with an identical idempotency key
- **THEN** the prior result SHALL be returned without a second lesson or a second assignment.

#### Scenario: Time cannot be inferred
- **WHEN** no time is supplied and the schedule has zero or multiple possible matches
- **THEN** the system SHALL ask for the time instead of fabricating a duration.

### Requirement: Historical lessons remain durable across lifecycle changes
Group unenrollment, household editing and student archival SHALL NOT erase completed lessons. Archiving SHALL account for outstanding individual and group scheduled participation.

#### Scenario: Student leaves an ongoing group
- **WHEN** a student is archived but future group sessions include the student
- **THEN** the archive operation SHALL report unresolved commitments for explicit treatment
- **AND** the original completed roster/learning history SHALL remain available.
