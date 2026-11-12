# Canonical lesson and attendance specification

## ADDED Requirements

### Requirement: One authoritative actual lesson
The system SHALL persist all private, group, ad-hoc, make-up and recurring actual lessons only as `teaching_sessions`, with per-student occurrence roster in `session_participants`. Recurrence rules SHALL NOT act as a second actual lesson record.

#### Scenario: Group lesson duration
- **WHEN** one 60-minute session has three participants
- **THEN** instructor workload records 60 minutes and attendance records up to three independent participant decisions.

### Requirement: Independent attendance and lifecycle
The system SHALL represent unmarked, present, late, absent, student-cancelled and teacher-cancelled per participant, preserve cancellation notice and initiator, and SHALL NOT conflate session completion with attendance.

#### Scenario: Mixed group attendance
- **WHEN** a group session is completed with one present, one late and one absent student
- **THEN** the session is completed once, each student retains their distinct status and billing policies apply independently.

#### Scenario: Family cancellation
- **WHEN** a guardian cancels one participant with an explicit notice timestamp
- **THEN** the authorized transaction records the single notice and policy outcome, does not delete the session, and retries do not duplicate cancellation messages.

### Requirement: Shared safe mutations
All website and delegated MCP lesson/attendance actions SHALL call the same tenant-authorized domain service and transactional writer with expected revisions and idempotency semantics.

#### Scenario: Stale correction
- **WHEN** a website update races with an MCP correction using an old revision
- **THEN** one authoritative change wins and the stale request receives a conflict without corrupting attendance, invoice or audit history.

### Requirement: No previous-schema compatibility
The fresh-install schema and runtime SHALL NOT contain the inherited `lessons`, `attendance`, `lesson_notes` models, old calendar RPCs, duplicate writers or legacy-ID compatibility bridges.

#### Scenario: Fresh installation
- **WHEN** a fresh database is initialized and all supported lesson workflows execute
- **THEN** all actual lessons and attendance use canonical tables and all retained finance, portal, reporting, notes and calendar functions operate without legacy physical objects.

### Requirement: Preserve professional evidence
Invoice lines, prepaid credits, guardian communications, learning materials, reports and historical corrections SHALL reference the canonical occurrence and, where student-specific, participant; a recurring edit SHALL NOT silently alter protected historical evidence.

#### Scenario: Reschedule invoiced occurrence
- **WHEN** a recurring slot changes after an occurrence was invoiced
- **THEN** the invoiced occurrence remains auditable with its financial references and is not overwritten or deleted.
