# Teacher workplaces and class records

## ADDED Requirements

### Requirement: Configurable workplaces
A teacher SHALL manage independently named workplaces with timezone, locale and policies; workplace names SHALL be data, never fixed application types.

#### Scenario: Multiple contexts
- **WHEN** one teacher schedules lessons at two workplaces
- **THEN** the calendar SHALL aggregate both
- **AND** filters and reports SHALL respect each workplace's settings.

### Requirement: Shared student identity
The system SHALL keep one canonical student per teacher and separate enrollments for each workplace and class group.

#### Scenario: Student in two groups
- **WHEN** a student joins a second workplace
- **THEN** the existing identity SHALL be reused
- **AND** workplace-private notes SHALL not cross report boundaries.

### Requirement: Group attendance
A session SHALL support many enrolled students; attendance SHALL be per student. Teaching time SHALL be counted once per session.

#### Scenario: Group with an absent student
- **WHEN** four students are enrolled in a 60-minute lesson and one is absent
- **THEN** the instructor SHALL be credited with 60 minutes
- **AND** four independent participation records SHALL exist.

### Requirement: Reversible migration
Legacy CogNote lesson, attendance and billing references SHALL be mapped and reconciled before a cutover.

#### Scenario: Migration validation fails
- **WHEN** counts or invoice totals differ from the legacy baseline
- **THEN** the migration SHALL stop and preserve existing records and a documented rollback.
