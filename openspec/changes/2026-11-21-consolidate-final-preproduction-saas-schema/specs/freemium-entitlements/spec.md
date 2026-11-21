# Commercial plan, Free/Pro entitlement and subscription schema

## ADDED Requirements

### Requirement: Commercial features and limits SHALL use versioned typed data
The system SHALL define immutable versioned plans and centrally registered typed capability keys with boolean or nonnegative finite/unlimited limits. Commercial pricing, feature packaging and student/workplace quotas SHALL be data/config decisions rather than schema or code changes. Unknown or malformed capabilities SHALL fail closed.

#### Scenario: A capacity threshold is changed
- **WHEN** the operator publishes a new versioned Free allowance or adjusts one teacher's authorized grant
- **THEN** all effective quota reads and writes SHALL reflect it without any ALTER TABLE and without rewriting previously published plan versions.

### Requirement: Founding, paid and temporary gifts SHALL be independent
The system SHALL allow additive, audited and optionally expiring individual grants alongside verified paid subscription access and a base Free plan. Permanent higher Free capacity SHALL persist after an independent temporary Pro grant expires. A founder marker SHALL NOT imply unlimited Pro or force cancellation of a legitimate active paid subscription.

#### Scenario: Gifted Pro ends for a founding coach
- **WHEN** the time-limited Pro benefit expires while a permanent higher Free cap remains
- **THEN** the higher Free cap SHALL continue, Pro-only new operations SHALL stop unless separately paid, and no student or workplace record SHALL be deleted.

### Requirement: Hosted capacity enforcement SHALL be database-atomic
Every student creation/reactivation (including import, restore, direct API and archived-lesson recovery) and professional workplace creation/reactivation SHALL derive limits from the **same effective account state** inside the transaction, serialize concurrent operations and use canonical deduplicated active counts. No teacher-controlled disabled flag or stale app environment constant SHALL bypass the guard.

#### Scenario: Two archived students compete for one available slot
- **WHEN** concurrent confirmed recovery requests race
- **THEN** at most one SHALL activate, the other SHALL receive a typed capacity conflict, both quota count and lesson receipt SHALL be correct, and unchanged request replay SHALL not double-allocate.

### Requirement: Downgrade SHALL be safe and non-destructive
The system SHALL retain students, archived history, lessons, credits, materials, reports, contacts and existing workplaces through trial expiration, subscription cancellation or a plan downgrade, and SHALL continue core capture, edits/correction, export and historical read. New growth and explicitly premium-only actions MAY be blocked while the account exceeds the current cap.

#### Scenario: Pro teacher has more active students than Free allows
- **WHEN** paid Pro ends
- **THEN** the current roster SHALL remain active and operational, new capacity-expanding actions SHALL be rejected with a clear explanation, and no automatic archive, deletion or hidden history SHALL occur.

### Requirement: Payment provider state SHALL be independent from teacher finance
The system SHALL use provider-neutral external customer/subscription/offer records and a unique, durable, verified webhook event journal. Provider events SHALL be authenticated, deduplicated and order-safe, and SHALL NOT overwrite newer valid subscription state or mix platform subscription receipts with invoices/payments issued by a coach to their students.

#### Scenario: Delayed cancellation of old subscription
- **WHEN** an event for a cancelled old subscription arrives after a replacement subscription has been verified
- **THEN** the teacher SHALL retain access from the valid replacement; the old event SHALL be recorded as stale or reconciled without demotion.

### Requirement: Entitlements SHALL be enforced equally through website, MCP and jobs
All plan and capability evaluations SHALL use common backend/SQL business rules; UI visibility and `tools/list` caching SHALL NOT be considered security. Errors SHALL distinguish `UPGRADE_REQUIRED`, `CAPACITY_EXCEEDED`, `FORBIDDEN` and `NOT_FOUND`; ordinary Free teacher history and data export SHALL remain available.

#### Scenario: Free user invokes a Pro-only operation directly
- **WHEN** a well-formed authenticated MCP or website request bypasses the premium UI control
- **THEN** the backend SHALL return a structured upgrade requirement without writing data or hiding the underlying historical record.

### Requirement: Fair-use accounting SHALL measure meaningful units
The system SHALL record bounded, idempotent domain work with durable period counters where a fair-use boundary is approved, not charge by individual MCP calls or inferred model tokens.

#### Scenario: One user request invokes multiple MCP helper tools
- **WHEN** the teacher completes one legitimate coaching workflow via several tool operations
- **THEN** mere tool-discovery or repeated read operations SHALL NOT consume a fabricated per-call subscription charge.
