# Evidence-linked coach briefing and MCP parity — delta specification

## ADDED Requirements

### Requirement: Coach briefing reports source-linked facts, not inferred ability
The system SHALL offer a deterministic, tenant-scoped lesson-preparation briefing with recent sessions, attendance, taught vs assigned materials, pending homework and reviews, current goals, teacher-verified observations and explicit unknowns. Every substantive fact SHALL be traceable to a record ID/time/source.

#### Scenario: Prepare Daniel's next lesson
- **WHEN** a teacher requests Daniel's briefing
- **THEN** the response SHALL distinguish studied material, assigned-but-unreviewed practice and verified observations
- **AND** missing comprehension, ratings and homework outcomes SHALL be marked unknown, not filled by AI inference.

#### Scenario: Provider outage
- **WHEN** Lichess or an optional AI summarizer is unavailable
- **THEN** a factual local briefing SHALL still be accessible on the website and through authenticated MCP.

### Requirement: Every new teacher-owned website action has tested MCP parity
Ordinary student, contact, lesson, material, training plan, assignment, attempt, review and briefing fields and operations introduced here SHALL have equivalent authenticated /mcp operations, invoking the same validated domain service with matching revisions, scopes, pagination and results. Sensitive portal credential grant steps MAY use narrow approved browser handoff, not a broad CRUD exemption.

#### Scenario: Cross-interface homework review
- **WHEN** a teacher creates an assignment on the website and reviews the recorded attempt via MCP, or vice versa
- **THEN** material, status, timestamps, review/source and persisted records SHALL match in both views
- **AND** read-only MCP scope SHALL reject the review mutation.

#### Scenario: Revoked or cross-tenant request
- **WHEN** an MCP client has revoked authorization, an outdated revision or another teacher's resource ID
- **THEN** mutation SHALL be denied with no side effect or private detail disclosure.

### Requirement: Strict parity and release gates remain binding
New fields/features SHALL update the existing versioned parity inventory, PR safeguards and automated acceptance scenarios. The existing 93-case browser/MCP release gate SHALL remain mandatory; new scenarios extend, not replace, it.

#### Scenario: New puzzle edit without MCP support
- **WHEN** a PR adds a website-editable puzzle solution field without a corresponding MCP operation and behavior/security test
- **THEN** the parity PR/release check SHALL fail until corrected.

### Requirement: One complete chess coaching journey is verified
The system SHALL support evidence-safe conversational capture, training follow-up and review as a coherent teacher-owned record.

#### Scenario: Daniel and Yael lesson with individual homework
- **WHEN** a teacher confirms a 90-minute lesson for Daniel and Yael with one exact chapter, separate observations and Daniel-only homework
- **THEN** there SHALL be one 90-minute session with two participants and no doubled teacher time
- **AND** only Daniel SHALL receive the homework
- **AND** the next-lesson briefing SHALL link the taught chapter, individual observations and Daniel's pending assignment, keeping unassessed understanding unknown
- **AND** repeated commits SHALL not duplicate records, while foreign tenant reads/writes SHALL be rejected.
