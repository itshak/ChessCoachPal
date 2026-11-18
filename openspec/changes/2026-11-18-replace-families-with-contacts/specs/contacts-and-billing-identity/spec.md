# Delta: Contacts and billing identity

## ADDED Requirements

### Requirement: A student SHALL support zero-to-many contacts
Contacts SHALL be independent teacher-owned records, linkable to multiple students without implying shared lessons, groups, workplace or payments. A relationship SHALL declare communication/guardian roles separately from financial responsibility.

#### Scenario: School plus private coaching
- **WHEN** a student is enrolled in a school group and has private lessons, with mother and school representative contacts
- **THEN** both contacts MAY be linked but neither SHALL automatically see another contact's messages, private notes, invoices or workplace activity.
- **AND** a contact-less adult student SHALL still be creatable, schedulable and reportable.

### Requirement: Billing identity SHALL not equal guardian identity
An invoice SHALL identify one canonical billing account representing the responsible person or organization; the student's other contacts SHALL not become liable merely by being linked.

#### Scenario: Siblings share one payer
- **WHEN** two students have one common billing contact
- **THEN** one billing account MAY receive their appropriate charge lines without merging students or duplicating instructor teaching time.

### Requirement: Family-to-contacts transition SHALL preserve existing obligations
The new baseline SHALL contain the final contact/billing schema. A reviewed one-time live transition SHALL preserve guardians' person/contact details, historical invoices/payments, event RSVPs and valid scoped communication rights without silently broadening access.

#### Scenario: Existing secondary guardian and paid invoice
- **WHEN** an existing real-data-shaped fixture with a primary and secondary guardian and paid invoice is transitioned
- **THEN** both contact details and original payment attribution SHALL be recoverable and reconciled, the family-centric primary UI SHALL be retired, and no portal privilege SHALL be inferred by default.

### Requirement: Teacher-contact operations SHALL have website/MCP parity
Every contact and billing-account create/edit/link/read operation SHALL use common tenant-scoped business services with authenticated web and named MCP counterparts, non-default field read-back, revision/replay and denial tests.

#### Scenario: Agent adds a grandmother contact
- **WHEN** an authorized teacher links a grandmother to one student by MCP
- **THEN** the website SHALL show that specific link and roles, while unrelated students and payment assignments remain unchanged.
