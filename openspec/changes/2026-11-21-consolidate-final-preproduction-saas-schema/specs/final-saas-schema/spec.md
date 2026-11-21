# Final pre-production SaaS schema — consolidated requirements

## ADDED Requirements

### Requirement: Exactly one authoritative pre-v1 schema owner
The system SHALL integrate all currently planned persisted requirements from active OpenSpec proposals into a single audited canonical fresh-install baseline and SHALL NOT ship per-feature pre-v1 production migrations, duplicate domain ledgers or runtime compatibility tables.

#### Scenario: Downstream feature requests a new table
- **WHEN** a still-active feature design needs persisted information absent from the reviewed baseline
- **THEN** the schema owner SHALL explicitly resolve it before freeze, with a field-level design, ownership, authorization and regression test, rather than permitting an independent feature migration.

### Requirement: Stable tenant ownership and full typed contract
Every teacher-owned source, relation and stored report SHALL have teacher-tenant ownership or an explicitly justified protected system scope; composite tenant FKs, RLS, grants, row-level write safety, owner-leading indexes and generated types SHALL be independently verified.

#### Scenario: Cross-tenant reference passed through a privileged RPC
- **WHEN** an authenticated teacher attempts to associate a foreign student, provider consent, billing account, workplace, grant or paid subscription
- **THEN** PostgreSQL and shared domain services SHALL reject it without altering any account.

### Requirement: One durable canonical model per coaching domain
The target SHALL preserve single-source students, dated workplace enrollment, canonical group/lesson/attendance, material and rating evidence, contact/payer identities, scoped portal grants and the native immutable finance ledger. Historical records SHALL NOT depend on mutable current group membership or paid-plan status.

#### Scenario: Student archived and Pro expired
- **WHEN** a former Pro teacher inspects archived history or a dated lesson associated with an earlier workplace
- **THEN** the same stable IDs and historical original source attribution SHALL remain readable/correctable/exportable without creating a new student or silently changing a financial document.

### Requirement: All anticipated durable professional workflows have a schema contract
The final baseline SHALL represent the necessary immutable occurrence/exception provenance, approved report publication and revoke/revision state, applicable signed-off workplace policy hierarchy, consented provider jobs and evidence, and teacher-verifiable educational observations; no independent shadow queue or duplicate report/rating truth SHALL be introduced.

#### Scenario: Recurring class skips a future unmaterialized occurrence
- **WHEN** a teacher approves an exception for one slot's local date
- **THEN** the intent and exception SHALL survive restart/retry without materializing an unwanted lesson or rewriting completed teaching/finance history.

#### Scenario: Report publication after teacher review
- **WHEN** a teacher explicitly approves a snapshot for a scoped recipient
- **THEN** the publication SHALL have revision, evidence provenance, intended scope and revocation; unpublished private notes SHALL never become visible by inference.

### Requirement: Cutover is separate from schema acceptance
A source-only schema merge SHALL NOT authorize a deployment, reset or live data transition. The populated-data cutover SHALL follow ADR-0017 with an off-host tested restore, operator-approved exact target, Auth/Storage/finance/portal/history reconciliation and independent verification.

#### Scenario: Fresh baseline passes CI
- **WHEN** a disposable database, E2E and synthetic restore tests pass
- **THEN** the schema OpenSpec MAY record source acceptance only after all review criteria pass, but SHALL NOT assert live schema migration or customer-data safety without separate operational proof.
