# Workplace context and teacher settings

## Purpose

Persist one explicit, tenant-safe operational filter without changing canonical teaching history or commercial authority.

## Requirements

### Requirement: One persisted workplace context SHALL scope teacher views consistently
A teacher SHALL be able to select All Workplaces or one owned workplace, with the selection retained across dashboard, roster, schedule, lessons, materials and reports. The scope SHALL be an explicit filter, not a new tenant boundary or a rewrite of stored student/session IDs.

#### Scenario: Student attends school and private sessions
- **WHEN** a teacher selects the school workplace and opens the student's lesson history
- **THEN** only lessons originally recorded at that school SHALL appear in the scoped history; selecting All SHALL include school and private lessons once each.
- **AND** the student SHALL keep one canonical student identity and both memberships.

### Requirement: Groups SHALL not serve as organizational workplaces
Groups SHALL represent teaching rosters inside an authorized workplace. The default Personal Teaching workplace SHALL allow Free teachers to schedule individual and group lessons; group creation SHALL not provide workplace-level compensation or global context controls.

#### Scenario: Free teacher creates a sibling group
- **WHEN** a Free teacher creates a private group in Personal Teaching
- **THEN** group roster, attendance and shared materials SHALL function without creating a paid workspace or becoming a billing entity.

### Requirement: Teacher account and business settings SHALL stay separate from workplace-scoped rules
Teacher/global account preferences and secrets SHALL be separately managed from typed workplace-local timezone, currency and output locale, owned approved compensation agreements, and make-up policies, with explicit documented fallback and preserved historical values.

#### Scenario: Separate school and private policies
- **WHEN** one coach configures School in Asia/Jerusalem with organizational rules and Personal Teaching with private defaults
- **THEN** scheduling and displayed reports SHALL use their respective workplace context without changing teacher UI language or past lesson records.

### Requirement: Workplace context actions SHALL have MCP parity and safe entitlements
The selected workplace and settings SHALL be fully available through authenticated website and MCP shared services. Source classification SHALL not rewrite, hide or delete historic data merely because future paid gating is planned. Live transition or reconciliation SHALL require separate operator authorization.

#### Scenario: Agent selects School
- **WHEN** an authorized teacher selects School through MCP and requests a scoped lesson report
- **THEN** the website context and MCP report SHALL use the same workplace ID and timezone semantics, and another teacher's workplace SHALL be rejected.

### Requirement: Workplace navigation SHALL preserve scope without rewriting records
The teacher SHALL have distinct actionable Dashboard links for the scoped schedule and for managing workplaces. Current roster membership uses effective dates; recorded lessons, material use and reports SHALL use their original attribution. Teacher-global catalog entries and existing homework assignment identities SHALL not be rewritten by changing the filter.

#### Scenario: A selected workplace becomes unavailable
- **WHEN** an owned selection is deleted or is no longer selectable
- **THEN** GET SHALL resolve to All and SET SHALL reject an inaccessible ID; a tab which previously displayed the lost selection MAY signal its unavailability, without disclosing its cause.
- **AND** deliberate All and an initial NULL selection SHALL not imply a historic deletion.

#### Scenario: The teacher opens the schedule from a count
- **WHEN** the teacher activates the Dashboard workplace count with the keyboard
- **THEN** the schedule SHALL use the selected workplace, or All without auto-selecting a venue, and the separate Manage Workplaces link SHALL remain available.

### Requirement: Make-up policy SHALL preserve the decision’s historical terms
A typed workplace make-up notice in whole hours, including zero, SHALL override the teacher setting. Null SHALL inherit; missing teacher defaults SHALL resolve to 24 hours. A student cancellation SHALL use the session’s owned venue and stored start, not the current UI selection, and record the applicable rule and eligibility at the time.

#### Scenario: Cancellation terms are later edited or restored
- **WHEN** settings change after the decision, or a teacher-authored backup claims terms
- **THEN** observed terms SHALL remain authoritative and replayable; an unverified portable claim SHALL NOT authorize automatic make-up, invoice or credit, and a legacy record without terms SHALL keep its existing global behavior.
- **AND** a make-up decision SHALL NOT change posted charges, rates or other independently approved finance.
