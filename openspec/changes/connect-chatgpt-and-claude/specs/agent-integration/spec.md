# ChatGPT and Claude agent integration

## ADDED Requirements

### Requirement: Usable authenticated tools in both AI ecosystems
ChessCoachPal SHALL expose an authenticated MCP-compatible interface and machine-readable schema for allowed teacher operations. At least one actual ChatGPT-compatible client and one actual Claude-compatible client SHALL be demonstrated against the same self-hosted app before release.

#### Scenario: Conversation records attendance
- **WHEN** a delegated teacher asks a connected client to mark a known group's attendance and session topic
- **THEN** the client SHALL discover and invoke authorized tools with verified IDs
- **AND** the updated attendance and note SHALL appear in the teacher's web interface.

### Requirement: Delegated least-privilege teacher authentication
Each tool request MUST bind to a real teacher and revocable scoped authorization. Clients MUST NOT receive elevated Supabase service-role secrets or access student data outside authorized teacher/workplace scope.

#### Scenario: Teacher disconnects an AI client
- **WHEN** the teacher revokes the client authorization
- **THEN** subsequent calls with its tokens SHALL fail with UNAUTHENTICATED or FORBIDDEN
- **AND** no record SHALL be returned or changed.

### Requirement: No guessing and safe retries
The tool contract SHALL reject unresolved entities, apply idempotent writes and protect newer revisions.

#### Scenario: Two students share a name
- **WHEN** a spoken name matches multiple authorized student records
- **THEN** the tool SHALL return NEEDS_RESOLUTION with minimal candidate IDs
- **AND** it SHALL not write until the teacher disambiguates.

#### Scenario: Tool call is retried
- **WHEN** an identical write request and idempotency key are repeated
- **THEN** exactly one mutation SHALL be stored
- **AND** retry responses SHALL refer to the same persistent record.

#### Scenario: Stale editor
- **WHEN** an AI update targets an old record revision
- **THEN** the server SHALL report CONFLICT and SHALL NOT overwrite a newer website edit.

### Requirement: Confirmation and private audit
Bulk, destructive, financial or outbound side effects MUST require explicit payload-bound confirmation or be omitted from the exposed tools. Every accepted write SHALL have a privacy-minimized receipt.

#### Scenario: Bulk attendance is proposed
- **WHEN** an AI asks to mark the entire class
- **THEN** it SHALL preview actual resolved students/statuses and ask for confirmation before commit
- **AND** a stale/modified confirmation SHALL be rejected.

### Requirement: Website remains fully operable
All core data-entry and correction actions SHALL remain possible in the website when providers are unavailable or the teacher has no AI subscription.

#### Scenario: Claude fails after partial planning
- **WHEN** the client disconnects before confirming a write
- **THEN** no unconfirmed mutation SHALL occur
- **AND** the teacher SHALL be able to inspect and complete the work manually.

