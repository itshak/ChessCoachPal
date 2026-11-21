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

### Requirement: Conversational new-lesson creation SHALL provide a safe archived-learner recovery choice
When a new individual or group lesson references a teacher-owned archived learner, the shared website and MCP preview SHALL return a typed reactivation-required clarification, rather than treating the learner as nonexistent. The coach SHALL be shown exactly whom the system found, which workplace and date are proposed, and the effects of the action. Reactivation SHALL only happen after the coach explicitly confirms the student identity, relevant workplace membership and lesson details. The temporal lifecycle domain service SHALL enforce an atomic all-or-nothing commit.

#### Scenario: Coach records the next lesson for an archived pupil
- **WHEN** a coach says “Add a 60-minute lesson for Daniel tomorrow” and exactly one owned Daniel is archived
- **THEN** website and MCP SHALL present the same archived-student review with **Reactivate and create**, **Keep archived / cancel** and **Choose another student** as meaningful choices, and no write before approval
- **AND** a confirmed valid action SHALL preserve Daniel's stable student ID and history while adding exactly one session, with a replay-safe receipt.

#### Scenario: Name conflicts with an active pupil
- **WHEN** an active and an archived pupil share Daniel's name or alias
- **THEN** both owned candidates SHALL be disambiguated by stable ID before a lesson or lifecycle mutation, without silently preferring the active pupil.

#### Scenario: Coach declines or asks about the past
- **WHEN** the coach declines reactivation or corrects an already completed historical lesson for an archived learner
- **THEN** a declined new lesson SHALL not reactivate or create anything; a historical correction or verified date-evidence workflow SHALL remain separate and require no reactivation.

#### Scenario: Partial group recovery, capacity and stale replay
- **WHEN** the planned group contains archived and active pupils, quota is insufficient, a selected workplace is invalid, or a reviewed preview has become stale
- **THEN** both clients SHALL show a deterministic reason and a revised-review path; no group session, lesson hours or partial lifecycle changes SHALL be committed.
