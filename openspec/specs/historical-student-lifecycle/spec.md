# historical-student-lifecycle Specification

## Purpose
Define the source-accurate, teacher-owned lifecycle of former chess students and imported school-year attendance: safe active-quota handling, reviewed atomic transitions, private short-lived spreadsheet staging, factual dated versus aggregate history, and equal website/MCP access without inventing lessons or deleting past records.

## Requirements

### Requirement: Former learners SHALL retain their history without consuming active quota
Teachers SHALL be able to create a student directly in archived state through shared website and MCP workflows. Spreadsheet imports SHALL accept an explicit archived flag, refuse invalid values, and preserve existing historical learner identities without silently duplicating names or aliases. Archived students SHALL remain discoverable through explicit historical roster filters and SHALL not consume the hosted active-student allowance.

#### Scenario: Onboard a former pupil with no active enrollment
- **WHEN** a teacher imports an archived former student or creates one directly archived with approved details
- **THEN** the student SHALL be visible in the historical roster, absent from the active roster, and shall not temporarily consume an active slot
- **AND** identical website/MCP request keys SHALL replay the original receipt, not create a duplicate.

### Requirement: Bulk archive/reactivate SHALL be atomic and revision checked
Teachers SHALL have a shared preview and confirmed write workflow for up to 100 stable student IDs. The preview SHALL enumerate current workplace enrollment, group membership, recurring slots, future private/group commitments, stale revisions and hosted quota effect. The confirmed SQL operation SHALL independently recheck owner scope, revision, commitments and quota under a teacher lock and SHALL commit all student transitions or none. Inactive students SHALL be safe to reactivate only within the hosted limit. Archiving SHALL preserve all historical records and SHALL NOT automatically unenroll or archive someone active at another workplace.

#### Scenario: One pupil still studies at another school
- **WHEN** a former group pupil is still enrolled at a different active workplace
- **THEN** global archival SHALL be blocked until that specific enrollment and its future commitments have been explicitly resolved, without erasing past lesson history.

#### Scenario: Concurrent edits or hosted-cap swaps
- **WHEN** any student in a reviewed batch has a stale revision or a new future commitment
- **THEN** no pupil in the batch SHALL change state and the request key SHALL remain reusable for a freshly reviewed operation.
- **WHEN** an approved batch archives one student and reactivates another while at the hosted limit
- **THEN** the transaction SHALL archive first and activate second without oversubscription or transient quota failure.

### Requirement: Historical attendance SHALL preserve source precision and provenance
The app SHALL import source-attested historical attendance as a separate, owner-scoped evidence domain rather than fabricating canonical teaching sessions. Records SHALL capture student, workplace, original source row, digest, school-year bounds, timezone and batch ID. A dated record requires one real ISO date and one explicit status; an aggregate-only record requires an explicit source date range, status and lesson count but SHALL NOT imply a date for each lesson. Missing dates, duplicate evidence, invalid counts or unsupported attendance status, ambiguous names and aliases, unknown or foreign students/workplaces SHALL block a confirmed import pending explicit review or resolution.

#### Scenario: Two years across different workplaces
- **WHEN** one teacher imports a dated 2024 school record, a 2025 aggregate and a 2026 dated school record
- **THEN** each record SHALL retain its source precision and correct workplace, without creating phantom teaching_sessions, attendance, invoice lines, or skill mastery.

#### Scenario: Duplicate or ambiguous alias
- **WHEN** two pupils share an alias or the source lacks a legitimate date or explicit aggregate period
- **THEN** the importer SHALL offer owner-scoped review and resolution with stable UUIDs; no guess, fuzzy merge or partial commit is permitted.

### Requirement: Approved historical batches SHALL use durable atomic receipts and separate reporting
The website and MCP SHALL use a deterministic preview, explicit confirmation, exact digest and idempotency UUID for each approved historical evidence batch. SQL SHALL enforce teacher/student/workplace ownership and reject duplicate persisted entries. Every failed row SHALL roll back all inserts and the receipt. Identical retries across website/MCP SHALL return the same stored result without double counting; changed replays SHALL conflict. Teacher history reports and the student's progress summary SHALL distinguish dated observations, aggregate-only declared lesson counts and ordinary canonical calendar sessions. Portable export and restore SHALL preserve the evidence immutably.

#### Scenario: Replay a multi-school import
- **WHEN** a successful browser import is retried through a delegated chat tool with the same digest and request ID
- **THEN** the original source rows remain exactly once and both reports show identical separated totals.

### Requirement: Large historical spreadsheets SHALL cross a private, expiring browser boundary
The application SHALL support authenticated browser uploads of bounded CSV/XLS/XLSX data into private teacher-scoped Supabase Storage. Model clients SHALL receive short-lived owner-checked random reference IDs and metadata, never raw large child-data payloads, arbitrary fetch URLs, or storage credentials. Reads SHALL fail after expiry, across teacher accounts or on hash/size mismatch; explicit deletion SHALL remove staged bytes without deleting committed evidence. Expired bytes require a documented server-side retention cleanup policy.

#### Scenario: Teacher uses ChatGPT for a large spreadsheet
- **WHEN** a teacher uploads a source file in the signed-in website and shares the resulting reference ID with a delegated MCP assistant
- **THEN** MCP SHALL be able to inspect metadata, preview and commit the same reviewed records without transferring the file over the model or seeing another teacher's staged data.

### Requirement: Schema installation SHALL never destroy an active beta database
The codebase SHALL retain a single current fresh-install schema for disposable CI/new installations, while live Coolify data requires a separate, explicitly reviewed, non-destructive rollout plan, recoverable backup and restore verification. A successful GitHub merge SHALL NOT be represented as having applied new SQL to live deployments.

#### Scenario: Existing real teacher records on Coolify
- **WHEN** the new feature reaches the default branch
- **THEN** operators SHALL apply only reviewed additive schema/storage changes to the existing database without running a destructive reset, and the feature SHALL be accepted against that running data before teacher use.

### Requirement: Simple teacher-approved dated attendance SHALL be source-neutral across website and MCP

A teacher or delegated assistant SHALL be able to submit a batch with one
verified workplace UUID, inclusive date range, IANA timezone, optional source
label, and a list of existing student identities with explicit ISO attendance
dates. This format SHALL have dedicated preview and reviewed commit operations
on both website and MCP. The application SHALL never require knowledge of
third-party marks such as V or X, transpose date-column spreadsheets on behalf
of the teacher, or infer presence/absence from empty spreadsheet cells. Former
and archived pupils SHALL remain eligible. The preview and atomic write SHALL
share the existing historical evidence store and duplicate/idempotency rules.

#### Scenario: Import actual dates extracted from a teacher's sheet
- **WHEN** a coach verifies that one pupil was present on two real dates and
  approves a preview applying an existing workplace to both observations
- **THEN** one historical dated-presence evidence record per exact date SHALL
  be created with a durable receipt and read back identically from MCP and
  website, without creating canonical calendar sessions or invented duration.
- **AND** an ambiguous, unauthorized or unknown student, duplicate date,
  out-of-range date or invalid calendar date SHALL block the batch.

#### Scenario: Provider notation and transport size
- **WHEN** a source uses V/X/blank or year headings with an apparent typo
- **THEN** agents SHALL normalize only source-attested presence dates after
  teacher review, and the server SHALL reject non-ISO or ambiguous values;
  it SHALL NOT embed that provider's notation in the public import schema.
- **AND** a direct request of up to 250 dated observations/256 KiB of input
  data SHALL fit within the separately bounded 320-KiB JSON-RPC gateway
  envelope; oversized bodies SHALL be refused without incomplete writes.
