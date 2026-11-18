# Delta: Workplace context and teacher settings

## ADDED Requirements

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

### Requirement: Teacher-level Studio defaults SHALL be disentangled from workplaces
Teacher/global account preferences and secrets SHALL be separately managed from workplace-local timezone, currency, compensation and cancellation policies, with explicit documented fallback and preserved historical values.

#### Scenario: Separate school and private policies
- **WHEN** one coach configures School in Asia/Jerusalem with organizational rules and Personal Teaching with private defaults
- **THEN** scheduling and displayed reports SHALL use their respective workplace context without changing teacher UI language or past lesson records.

### Requirement: Workplace context actions SHALL have MCP parity and safe entitlements
The selected workplace and settings SHALL be fully available through authenticated website and MCP shared services. Beta data SHALL not be hidden or deleted merely because a future hosted Pro gate is planned.

#### Scenario: Agent selects School
- **WHEN** an authorized teacher selects School through MCP and requests a scoped lesson report
- **THEN** the website context and MCP report SHALL use the same workplace ID and timezone semantics, and another teacher's workplace SHALL be rejected.
