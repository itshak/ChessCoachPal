# Delta: Optional scoped student/contact portal

## ADDED Requirements

### Requirement: External sharing SHALL be optional, scoped and revocable
A coach SHALL explicitly grant a contact/student access to specific subjects and functions before a public capability link is valid. A contact, guardian, billing account, school or group relationship SHALL NOT itself create portal permission.

#### Scenario: Student with private and school lessons
- **WHEN** a school representative is granted calendar view for School only and a parent is granted approved private calendar and own billing view
- **THEN** the school link SHALL reveal no private session or family invoice, and parent access SHALL follow its own explicit scope.

### Requirement: Each portal read and mutation SHALL verify the exact resource scope
A portal link SHALL be checked at the resource level for original workplace, student frozen session roster, approved shared notes, invoice billing account, event invitation and requested action.

#### Scenario: Guess another session UUID
- **WHEN** a valid school-scoped guest token attempts to cancel a student's private lesson by guessed session ID
- **THEN** the backend SHALL deny the action without changing attendance and SHALL not expose existence or private details.

### Requirement: Existing guardian tokens SHALL not silently gain new rights
A live migration SHALL preserve records, explicitly review/reissue grants, and revoke superseded broad tokens; missing or ambiguous entitlement SHALL fail closed.

#### Scenario: Existing guardian linked to siblings in different workplaces
- **WHEN** the guardian model is transitioned to contacts
- **THEN** no blanket cross-workplace access SHALL be newly granted merely because both students previously had the same guardian ID.

### Requirement: Teacher portal controls SHALL have MCP parity without exposing secrets
The teacher MAY create, view grant metadata, revoke, renew and request secure rotation from website and MCP shared services; raw bearer secrets SHALL only be delivered through an approved secure-browser flow, never ordinary tool list or report output.

#### Scenario: MCP revokes a contact portal
- **WHEN** a teacher revokes an access grant via ccp_* MCP
- **THEN** the webpage and subscribed .ics link SHALL stop granting access immediately, and the teacher website SHALL show the revoked state.

### Requirement: First release SHALL preserve useful existing portal capabilities
Calendar, cancellation, teacher-approved notes, credits, invoicing/payment instructions and event RSVP SHALL remain available when specifically granted and authorized. Dedicated student accounts, AI chat and learning submissions remain deferred.

#### Scenario: Shared notes in a group
- **WHEN** the teacher shares a note containing information about another child
- **THEN** the portal SHALL refuse to expose another child's private information unless a safe explicitly approved per-student rendition exists.
