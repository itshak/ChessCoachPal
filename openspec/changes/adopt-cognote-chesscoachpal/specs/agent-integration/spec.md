# Agent-integrated teaching operations

## ADDED Requirements

### Requirement: Agent tools are the primary input surface

ChessCoachPal SHALL provide versioned, machine-readable authenticated commands and queries consumable from ChatGPT and Claude. Each accepted write SHALL operate through the same domain service used by the website.

#### Scenario: Record group attendance conversationally
- **WHEN** an authenticated teacher asks an AI client to mark a specified group lesson's attendees and absentees
- **THEN** the tool SHALL resolve the class, occurrence, workplace and student IDs
- **AND** it SHALL return a preview and accept an idempotent commit
- **AND** the website SHALL display the resulting attendance and an audit trail immediately.

#### Scenario: Non-AI operation
- **WHEN** an instructor has no ChatGPT or Claude subscription or either provider is unavailable
- **THEN** the same attendance, note, schedule and student updates SHALL remain possible through the website.

### Requirement: Tool authentication and authorization

Every tool call MUST verify a delegated teacher identity and the permitted operation. The server SHALL enforce teacher/workplace authorization on every object and use PostgreSQL row-level security as defense in depth.

#### Scenario: Unauthorized workplace
- **WHEN** a tool is called with a student or session ID belonging to another teacher or outside the authorized scope
- **THEN** it SHALL return FORBIDDEN or a privacy-preserving NOT_FOUND
- **AND** no protected record SHALL be read or changed.

#### Scenario: Expired credentials
- **WHEN** an AI-client authorization has expired or been revoked
- **THEN** the tool SHALL fail with UNAUTHENTICATED and no data access.

### Requirement: Safe and deterministic input

Writes SHALL have a typed schema, explicit units and timezone handling, a stable idempotency key and a revision-aware result. The assistant SHALL never generate arbitrary SQL or invent missing database identifiers.

#### Scenario: Ambiguous student
- **WHEN** an utterance refers to a name matching multiple students
- **THEN** the tool SHALL return NEEDS_RESOLUTION and a minimal authorized candidate list
- **AND** it SHALL make no write until a teacher selects a stable ID.

#### Scenario: Retry after timeout
- **WHEN** the same idempotency key and payload are received twice
- **THEN** exactly one domain mutation SHALL exist
- **AND** both responses SHALL identify the same saved record and revision.

#### Scenario: Conflicting updates
- **WHEN** an edit uses an outdated expected revision
- **THEN** the server SHALL return CONFLICT with fresh authorized state for resolution
- **AND** it SHALL not silently overwrite the newer edit.

### Requirement: Confirmation and audit

Destructive actions, bulk corrections, financial changes and external notifications MUST require preview and explicit confirmation. All accepted mutations SHALL create privacy-minimized audit records.

#### Scenario: Message to a family
- **WHEN** an agent drafts an outward notification
- **THEN** it SHALL display recipients and content for review
- **AND** sending SHALL require a fresh confirmed action rather than executing the draft.

#### Scenario: Tool receipt
- **WHEN** a mutation succeeds
- **THEN** the tool SHALL return action, affected IDs, timestamps, changed-field summary and revision
- **AND** avoid exposing unrelated family data or credentials.

### Requirement: Client interoperability and fallback

The service SHALL publish machine-readable tool schemas and client setup instructions without relying on a proprietary in-app chatbot. At least one ChatGPT-compatible and one Claude-compatible end-to-end flow MUST be tested before claiming support.

#### Scenario: AI provider unavailable
- **WHEN** a provider rejects a request or an MCP transport fails
- **THEN** no partial write SHALL be attributed to a completed action
- **AND** the teacher SHALL be able to inspect or finish via the website.
