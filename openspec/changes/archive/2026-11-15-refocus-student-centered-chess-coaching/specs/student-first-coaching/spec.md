# Student-first coaching and optional contacts — delta specification

## ADDED Requirements

### Requirement: Student is an independent coaching subject
The system SHALL create a student without any mandatory family, guardian, contact, payer, birthdate or portal record. Direct contact for an adult SHALL NOT manufacture a "family of one"; student ID/history SHALL be stable.

#### Scenario: Adult starts individual coaching
- **WHEN** a coach creates Daniel with a name and his own email
- **THEN** a standalone student SHALL exist, optionally linked to a self-contact
- **AND** no fictitious family or guardian SHALL be created
- **AND** the same fields SHALL be editable on the website and via authorized MCP.

#### Scenario: Student with only a name
- **WHEN** the coach creates an otherwise blank learner
- **THEN** creation SHALL succeed and unknown age/contact data SHALL remain unknown.

### Requirement: Contact, guardian and payer authority are separate
Contacts SHALL have explicit roles and revocable permissions for each linked student. The same authorized contact MAY serve sibling students without combining their teaching records. Billing responsibility SHALL NOT imply access to lessons, notes or reports. Applicable minor-consent and privacy safeguards SHALL remain enforced.

#### Scenario: Siblings share a guardian
- **WHEN** two juniors reference the same authorized guardian
- **THEN** they SHALL retain separate student IDs, lesson histories, materials and goals
- **AND** guardian access SHALL be restricted to the children and operations explicitly granted.

#### Scenario: Club pays for student
- **WHEN** a club/workplace is selected as payer but is not an authorized student contact
- **THEN** the payer SHALL NOT gain access to the student's coaching history.

#### Scenario: Foreign contact UUID
- **WHEN** teacher B links teacher A's contact to a student
- **THEN** the action SHALL fail without disclosure of teacher A's private contact.

### Requirement: Teacher experience is student-first and age-neutral
Primary navigation SHALL prioritize Today, Students, Lessons, Training & Materials, Calendar and Reports. Optional contacts/guardians, workplaces and business workflows SHALL remain accessible contextually without dominating adult onboarding.

#### Scenario: Coach only teaches adults
- **WHEN** a teacher with adult learners uses onboarding and the daily workspace
- **THEN** the teacher SHALL NOT have to configure a household or guardian before recording a lesson.

### Requirement: Archiving preserves the student's full teaching memory
Archived students SHALL retain their canonical UUID and authorized lessons, game/material coverage, goals, assignments and reviews; archived students SHALL NOT count against active-student capacity. Reactivation SHALL use transaction-safe capacity enforcement and future session/group-commitment checks.

#### Scenario: Returning student
- **WHEN** an archived learner is reactivated with available capacity
- **THEN** the same record and history SHALL be restored without duplicating student identity or lesson time
- **AND** concurrent requests SHALL NOT bypass the capacity limit.
