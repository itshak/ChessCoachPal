# Chess-specific student learning

## ADDED Requirements

### Requirement: Configurable chess skill observations
The app SHALL let a teacher define chess skill areas and record teacher-scoped observations about a student, optionally linked to a session.

#### Scenario: Record an endgame finding
- **WHEN** a teacher notes a student's difficulty with opposition in a lesson
- **THEN** the observation SHALL persist with student, skill, author, date and optional session
- **AND** the teacher SHALL be able to correct it in the website.

### Requirement: Verified and suggested entries remain distinct
AI-generated suggestions SHALL be marked unverified and MUST NOT overwrite teacher-verified evaluations without a separate explicit approval.

#### Scenario: AI suggests a tactics weakness
- **WHEN** a connected agent proposes a weak skill
- **THEN** the record SHALL be flagged as suggested
- **AND** no teacher-verified assessment SHALL change until the teacher approves.

### Requirement: Curated chess study links
The teacher SHALL be able to link selected permitted HTTPS Lichess Studies and other resources without copying private study content into public source or logs.

#### Scenario: Provider outage
- **WHEN** Lichess cannot be reached
- **THEN** the saved study reference and student notes SHALL remain accessible
- **AND** core coaching operations SHALL still work.

### Requirement: Private learning history
Observations and resource links SHALL be restricted to their owning teacher and authorized workplace scopes.

#### Scenario: Foreign resource ID
- **WHEN** teacher B requests teacher A's student resource by UUID
- **THEN** the server SHALL deny the request without revealing its details.

## Development verification boundary
All implementation and acceptance evidence for this development change SHALL come from merged GitHub commits and passing GitHub Actions tests/automated scans with synthetic data. No manual local deployment, live Lichess/ChatGPT/Claude login or actual vendor-client session is required to check tasks or archive this change. Record test URLs/findings in docs/STATUS.md (and docs/SECURITY.md for audits). The only real ChatGPT/Claude client exercise takes place at the **final local v0.1.0 prepublication release gate**; it does not waive security/privacy review requirements that can be completed in GitHub.
