## ADDED Requirements

### Requirement: One canonical dated workplace membership history
The system SHALL store a teacher-owned student's relationship to each workplace as zero or more non-overlapping, auditable dated periods with immutable membership identity and a monotonic revision. Ending a period SHALL preserve the student's canonical ID and historical lessons, group membership evidence, attendance, payer history, notes and receipts. A period boundary SHALL use the teacher's configured calendar timezone and SHALL treat both start and end dates as inclusive.

#### Scenario: Student returns to the same workplace
**WHEN** a student ends a membership and later re-enrolls **THEN** a new interval with the same student ID MAY be created without overwriting the ended interval, and overlapping noncancelled intervals for the same student/workplace SHALL be rejected atomically.

#### Scenario: Historic start unknown
**WHEN** trusted operator reconciliation encounters a genuine legacy enrollment with no defensible start date **THEN** the schema SHALL record an explicit unknown-start marker and source provenance, rather than inventing a date based on the earliest lesson.

#### Scenario: Older lesson preserved
**WHEN** a membership ends or is cancelled **THEN** previously recorded lessons, frozen rosters and financial/learning history SHALL not be deleted as an enrollment cascade.

### Requirement: Explicit workplace ownership and date-aware assignment
All website, MCP, import, group and lesson writes SHALL resolve the exact owned workplace and appropriate membership period in the shared backend. Ambiguous workplace selection SHALL return a structured clarification instead of guessing.

#### Scenario: Direct lesson outside the approved interval
**WHEN** a teacher attempts to create a new private lesson at a date not covered by an effective membership **THEN** the operation SHALL fail safely without an incomplete lesson or extra teaching hours.

#### Scenario: Another tenant's student
**WHEN** a teacher supplies a student or workplace UUID belonging to another teacher **THEN** tenant-safe keys and business authorization SHALL reject the operation and SHALL not reveal private record data.

### Requirement: Credit changes are explicitly authorized entitlement events
The system SHALL preserve purchased packages and redemptions separately from received payments, invoice obligations and credit adjustment events. Credit refunds, transfers, grants, forfeitures and expiry exceptions SHALL be explicit and audited, with at-most-once requests, valid balances and financial reconciliation. Archiving a student SHALL NOT automatically refund, transfer, forfeit, pause or extend existing credits.

#### Scenario: Credit transfer after archive
**WHEN** a teacher requests a credit transfer or refund **THEN** a separate reviewed transaction SHALL check the package, remaining balance, payment/funding provenance and destination, and commit a deduplicated audit trail. No status toggle alone SHALL create the adjustment.

#### Scenario: Unfunded package
**WHEN** an invoice or package has not been paid **THEN** the app SHALL distinguish invoiced, paid and entitled credits and SHALL NOT fabricate a payment or refund to authorize spending.

### Requirement: Release and production migration are independent gates
The source schema SHALL be accepted only after exact-head fresh-install, RLS/tenant, website/MCP parity, longitudinal data, E2E, Compose, security and backup/restore verification. Existing populated databases SHALL be migrated only through a separately approved operator-run transition with backups and independent reconciliation; no baseline reset is permissible.
