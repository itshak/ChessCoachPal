# Delta: FIDE and national federation ratings

## ADDED Requirements

### Requirement: International and national identities SHALL be optional and independent
Each student MAY have an optional FIDE ID and federation label, and zero or more national federation memberships with provider-scoped player IDs. A teacher MAY set a suggested national federation without making it a verified student membership.

#### Scenario: Online-only student
- **WHEN** a student has no FIDE or national account
- **THEN** student creation and coaching workflows SHALL succeed without placeholders or fabricated zero ratings.

#### Scenario: International student with FIDE and Israeli ID
- **WHEN** one student has a valid FIDE ID and an Israeli national player ID
- **THEN** FIDE and Israeli memberships and rating series SHALL remain separately attributed, regardless of the teacher's default federation.

### Requirement: FIDE official ratings SHALL use three independent categories
The system SHALL import current official FIDE Standard, Rapid and Blitz rating observations with the official list effective date and retrieval provenance. Missing/unrated categories SHALL remain unknown, never zero.

#### Scenario: Monthly list is unchanged
- **WHEN** the same official FIDE list is checked again on another day
- **THEN** no duplicate rating-history point SHALL be fabricated and the teacher's strength SHALL remain unchanged.

### Requirement: National rating providers SHALL be extensible without schema rewrites
Rating categories SHALL be provider-scoped. Israeli current national rating MAY use one category initially; future US Chess regular/quick/blitz categories SHALL be representable without new student rating columns.

#### Scenario: Israeli lookup unavailable
- **WHEN** official automated Israeli lookup is unsupported, unavailable or disallowed
- **THEN** the UI and MCP SHALL show an honest unavailable/stale state and allow clearly labeled manual evidence without claiming a fresh official sync.

### Requirement: External identities and ratings SHALL preserve provenance and parity
Website and authenticated MCP SHALL allow the same optional federation identity edits and authorized rating reads/refreshes, with immutable historical evidence, explicit public-account consent and tenant isolation.

#### Scenario: MCP correction of FIDE ID
- **WHEN** a teacher corrects an optional FIDE ID in MCP
- **THEN** website read-back SHALL show the new ID, retain historical snapshots and their previous identity provenance, and queue no unapproved external lookup.
