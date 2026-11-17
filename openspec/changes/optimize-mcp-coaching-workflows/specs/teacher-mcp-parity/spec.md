# Delta specification — preserve website↔MCP parity while optimizing workflows

**Status:** Proposed modification clarifying the existing **applied** `teacher-mcp-parity` requirements. This does not relax ADR-0003 or the 93+26 accepted checks.

## MODIFIED Requirements

### Requirement: Every ordinary teacher business capability SHALL remain reachable via one authenticated MCP connector

All teacher-owned website business reads, searchable fields, editable fields, history, student/material/session/group operations, reports, schedule, finance, communications and data transfer SHALL retain a named authorized MCP counterpart through the existing `/mcp` connector. A task-oriented composite MAY be the preferred way to complete an entire teacher request; it SHALL NOT remove exact record-level create/edit/correct/clear functionality. Sensitive credentials, card entry, MFA and a narrowly reviewed class of high-risk operations MAY continue through secure browser handoffs initiated by MCP where appropriate.

#### Scenario: Composite operation replaces a repetitive low-level sequence
- **WHEN** a new workflow tool creates or links multiple teaching records in one validated operation
- **THEN** the corresponding ordinary website operations and independent granular MCP editing/inspection capabilities SHALL still be available to the same appropriately authorized teacher
- **AND** shared domain contracts, owner scope, revision and audit SHALL produce equivalent final records across surfaces.

#### Scenario: Optimizing tool count would hide a website capability
- **WHEN** an MCP tool is considered for retirement or consolidation
- **THEN** a reviewed inventory SHALL identify all affected website fields/actions and their remaining named authorized MCP operations, with strict parity cases updated to prove full reachability
- **AND** any missing capability SHALL block implementation acceptance, regardless of reduced catalog size.

#### Scenario: Subscription entitlement changes advertised operations
- **WHEN** the authenticated teacher has different plan entitlements or OAuth scopes
- **THEN** server-side `tools/call` authorization SHALL enforce the actual scope and plan regardless of tool-list caching
- **AND** filtering tools MAY reflect stable authenticated capabilities but SHALL NOT make ordinary Free functionality disappear or conflate subscription billing administration with coach-to-student invoice features.

### Requirement: Workflow and granular MCP operations SHALL use one canonical domain service

Both website routes and MCP tools SHALL execute shared owner-scoped typed domain services. Composite commands MAY coordinate multiple existing domain primitives, but SHALL NOT duplicate business rules, expose raw SQL, bypass confirmation, or silently omit optional fields. New capabilities SHALL update the parity registry and authenticated E2E in the same implementation PR.

#### Scenario: Teacher corrects part of a composite-created lesson
- **WHEN** an authorized teacher edits one participant's attendance or one material evidence record via the website or granular MCP tool after a composite lesson capture
- **THEN** both surfaces SHALL observe the same canonical record, preserved revision and audit trail
- **AND** other participants, teaching minutes and unrelated evidence SHALL remain correct.

#### Scenario: Composite commit fails midway
- **WHEN** one local sub-operation in an otherwise approved combined lesson/material workflow fails
- **THEN** the application SHALL roll back the entire local unit of work without a ghost lesson or orphaned association
- **AND** an independently retried, correctly authorized request SHALL use immutable idempotency semantics and disclose pending external-provider reconciliation when relevant.

### Requirement: Parity remains a strict implementation and release gate

The source inventory, full route/tool field mappings, strict 93 original + 26 chess/canonical scenarios, additional workflow-specific authenticated browser↔MCP E2E and current security/backup/recovery gates SHALL continue to apply. Tool-description or name-only presence SHALL never count as full behavior verification.

#### Scenario: Workflow-first refactor submitted for acceptance
- **WHEN** an implementation changes one or more MCP tools or their shared services
- **THEN** same-PR parity inventory/guards, canonical field propagation, tenant isolation, idempotency, independent read-back and required GitHub workflows SHALL be green on exact tested source and merged main
- **AND** a smaller advertised catalog or simulated model sequence SHALL NOT waive any previous business parity assertion.
