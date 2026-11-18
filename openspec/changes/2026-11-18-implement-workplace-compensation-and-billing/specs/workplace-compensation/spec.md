# Delta: Workplace compensation and payment reconciliation

## ADDED Requirements

### Requirement: Financial agreements SHALL be scoped and effective-dated
The teacher SHALL configure an applicable workplace/schedule/group or session agreement with an explicit debtor and a typed rate/period basis. Later rate changes SHALL NOT rewrite the historical basis of committed obligations or settled invoices.

#### Scenario: School raises rate next semester
- **WHEN** the hourly agreement changes from 120 ILS to 140 ILS effective next term
- **THEN** old sessions' committed earnings SHALL retain their original agreement amount and new eligible sessions SHALL use 140 ILS/hour.

### Requirement: One group occurrence SHALL count once toward instructor hourly earnings
The same frozen canonical session SHALL be one instructor teaching interval independent of number of students; per-participant charges may arise only under an explicit agreement and SHALL not duplicate teacher earnings.

#### Scenario: Eight students, 90-minute school lesson
- **WHEN** eight students attend a 90-minute group paid by the school at 120 ILS/hour
- **THEN** expected coach earnings SHALL equal 180 ILS once, NOT 1,440 ILS, with eight distinct attendance records.

### Requirement: Earnings and invoiced amounts SHALL not imply money received
Expected compensation, debtor obligation, generated invoice and received payment SHALL be distinct states, with auditable reconciliation and no automatic payment receipt upon lesson completion.

#### Scenario: School bank transfer after four lessons
- **WHEN** four qualifying 180 ILS sessions have finished but the school has not paid
- **THEN** expected unpaid amount SHALL show 720 ILS and received amount zero until a real 720 ILS payment is recorded and allocated.

### Requirement: Financial payer SHALL be chosen for the applicable lesson/agreement
A student's school, private and federation-sponsored lessons SHALL resolve separate legitimate billing accounts. The default initial product SHALL allow only one debtor per charge and shall not require split billing.

#### Scenario: Federation-sponsored Friday lesson
- **WHEN** one private Friday lesson has an explicit federation sponsorship
- **THEN** that lesson's charge SHALL accrue only to the federation billing account, without rerouting the student's other school or family obligations.

### Requirement: Finance operations SHALL be website/MCP equivalent and safe
The website and MCP SHALL call one owner-scoped calculation and approval service with stable replay, revision checks, source snapshots and true cash-allocation history.

#### Scenario: MCP approval fails before money is received
- **WHEN** a stale MCP obligation preview is committed after rate/payer revision
- **THEN** the operation SHALL conflict with no new charge or payment and the website SHALL show unchanged finances.
