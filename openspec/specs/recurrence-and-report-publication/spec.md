# Professional persistence and evidence — schema contract

## Requirements

### Requirement: Recurrence SHALL preserve original slot occurrence identity
The schema SHALL reuse `lesson_slots` as recurring intent and `teaching_sessions` as materialized canonical occurrences. If a future unmaterialized occurrence requires cancellation/rescheduling, a durable teacher-owned exception keyed by original local date SHALL be recorded without creating duplicate lessons.

#### Scenario: This and future occurrences
- **WHEN** a teacher changes the future recurrence with explicit scope
- **THEN** completed/history remains immutable, future exception intent survives retries and each slot/original date maps to at most one approved occurrence or cancellation state.

### Requirement: Published reports SHALL be approved, snapshotted and revocable
Advanced report publication SHALL be represented by a frozen, teacher-approved evidence-linked revision with an explicit audience and revoke/supersede state, and SHALL reuse existing scoped portal permissions where safe. Draft reports SHALL NOT automatically become public.

#### Scenario: Parent may see only one student's review
- **WHEN** a teacher publishes a progress review for one student and workplace
- **THEN** the stored publication scope and the recipient's explicit portal grant SHALL both be verified; unrelated students and private teacher notes SHALL remain inaccessible.

### Requirement: Learning history SHALL distinguish recorded exposure from demonstrated proficiency
The schema SHALL preserve source-attributed and correctable individual learning evidence, distinguishing material assignment/coverage from explicit teacher observations of practice, independent demonstration or need for review. The system SHALL NOT infer mastery merely from a lesson/material row.

#### Scenario: One member of a group struggled with a topic
- **WHEN** the teacher records an observation about one identified learner in a group session
- **THEN** the record SHALL reference only that learner and source session and SHALL NOT attribute the assessment to other participants.

### Requirement: Provider ratings SHALL remain source-specific and extensible
The target SHALL retain one immutable evidence stream for provider/category ratings and separate identity/consent/job/receipt structures, allowing approved additional federation categories without a new column per category, with explicit timestamps, source handles and no guessed missing values.

#### Scenario: Student lacks a national rapid rating
- **WHEN** a provider returns no valid observation in that category
- **THEN** the absence SHALL remain unknown, not zero or synthetic rating, and previously verified history SHALL not be overwritten.
