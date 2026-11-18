# Delta: Everyday chess-coaching workflow

## ADDED Requirements

### Requirement: The daily coaching view SHALL show actionable verified status
For a teacher-local date and optional selected workplace, the system SHALL return upcoming sessions, participants and evidence-derived tasks such as missing attendance, due reviewed homework or stale rating lookup. It SHALL never infer past attendance, homework completion or chess mastery from scheduled intent.

#### Scenario: First school class Monday
- **WHEN** the coach selects School on Monday morning
- **THEN** upcoming group sessions and one instructor duration per session SHALL be shown, with Prepare/Record actions and per-participant progress that does not duplicate teaching hours.

### Requirement: Lesson preparation SHALL reuse teacher-controlled evidence
An authorized teacher SHALL receive a deterministic per-session briefing with recent teacher-verified observations, previous materials, assignments and explicitly unknown information. No unreviewed AI-generated claim SHALL become a stored fact.

#### Scenario: Student has no recorded recent material
- **WHEN** the coach requests preparation for a learner with no previous material evidence
- **THEN** the briefing SHALL say that evidence is unavailable, not fabricate topics or mastery.

### Requirement: Lesson closing SHALL be previewed, approved and atomic
A completed occurrence SHALL preserve its original workplace and frozen participant roster. Each student's attendance and notes SHALL be independently confirmed, exact learning materials linked with appropriate stage, and idempotent retries prevented from creating duplicate sessions or evidence.

#### Scenario: Four-person completed lesson
- **WHEN** a teacher records distinct present/absent statuses and one taught chapter for a four-student frozen group
- **THEN** the backend SHALL commit one session with four explicit attendance records, only authorized per-student material claims, and no inferred proficiency.

### Requirement: Import review SHALL not fabricate historical lessons
The teacher SHALL see ambiguous student matches, unmatched rows and aggregate historical evidence with source labels; corrections SHALL require approved review and preserve archived student history.

#### Scenario: Two aliases resolve to one student
- **WHEN** a historical spreadsheet references the same student twice under Hebrew and English aliases
- **THEN** preview SHALL flag the duplicate for review, never create two learners or two attendance entries.

### Requirement: Website and MCP SHALL share a compact coaching workflow contract
Daily queue, prepare, preview and commit SHALL be accessible via typed authenticated website and ccp_* MCP services, with exact field propagation, authorization, revisions and independent read-back.

#### Scenario: Conversational lesson close
- **WHEN** a coach closes a lesson through MCP after reviewing the proposed roster and attendance
- **THEN** the website SHALL show the same persisted lesson and outstanding tasks, with no unacknowledged or extra writes.
