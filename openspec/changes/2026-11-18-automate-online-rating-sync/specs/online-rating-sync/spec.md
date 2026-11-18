# Delta: Automatic public online rating snapshots

## ADDED Requirements

### Requirement: Consented public handles SHALL refresh without a second confirmation click
The teacher SHALL be able to authorize official-public-username rating lookups for each provider. Once permitted, saving a new/changed handle SHALL enqueue the first refresh without making provider availability a blocker for student editing.

#### Scenario: New Lichess handle with permission
- **WHEN** a teacher saves a student's Lichess handle and explicitly enables its public rating lookup
- **THEN** an asynchronous job SHALL query only approved official endpoints, persist source-attributed immutable observations after validation, and show pending/succeeded/error state in website and MCP.
- **AND** it SHALL NOT alter teacher strength, historical lesson mastery or unrelated accounts.

### Requirement: Recurring sync SHALL be bounded to active eligible learners
Scheduled jobs SHALL not poll archived students; manual authorized refresh for an archived profile MAY be possible. Rate limits, caching and retries SHALL prevent provider abuse.

#### Scenario: Archived learner with former ratings
- **WHEN** a student is archived and the scheduler runs
- **THEN** no recurring provider request SHALL be issued for that student and previous rating history SHALL remain available.

### Requirement: Unavailable provider data SHALL not become false evidence
A failed, rate-limited, missing or unauthorized external lookup SHALL preserve last known observations and show explicit freshness. Derived historical ratings SHALL never be passed off as official daily provider history.

#### Scenario: Chess.com error after last successful rapid snapshot
- **WHEN** the provider times out during a scheduled check
- **THEN** prior rapid rating SHALL remain unchanged, its last observation date SHALL remain visible, and a bounded retry SHALL be scheduled.

### Requirement: Website and MCP SHALL have identical rating controls
All teacher-visible consent, refresh, history, sync status and handle edits SHALL exist as authenticated MCP operations through the same domain code and share owner-scoped data.

#### Scenario: MCP handle update, web history
- **WHEN** an authorized MCP tool updates a saved username with consent
- **THEN** the website SHALL show the same account and queued status, and only the matching revised handle SHALL be used in subsequent provider snapshots.
