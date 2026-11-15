# Applied specification — teacher website and MCP functional parity

**Scope:** Teacher-owned business features in the ChessCoachPal website and delegated `/mcp` gateway. This specification establishes the enforced parity contract; actual ChatGPT/Claude client publication acceptance remains a separate release gate. See [ADR-0003](../../../docs/adr/0003-mcp-website-business-parity.md), the [93-case matrix](../../../docs/MCP_WEBSITE_PARITY_CHECKLIST.md), the [chess-first scenarios](../../../docs/MCP_NEW_PARITY_SCENARIOS.md), and [canonical lesson attendance](../canonical-lesson-attendance/spec.md).

## Requirement: Teacher business operations SHALL have authenticated MCP equivalents

Every ordinary teacher-owned website business read, editable field, correction, status transition, history view, report, bounded export/import and create/update/delete operation SHALL have a typed authenticated MCP counterpart using the same domain service and validation. This applies to students (aliases, handles, source-specific ratings, strength and archive), workplaces, groups, calendars, frozen lesson rosters, attendance, learning materials and assignments, guardians and events, reports, settings, payments, invoices, credits and data transfer.

### Scenarios
- **WHEN** the teacher reads or edits a field through website or MCP **THEN** the other surface SHALL observe the same persisted owner-scoped record, clear/null semantics, revision, and local-date interpretation.
- **WHEN** a new website business route, operation or editable field is added **THEN** its MCP tool, shared domain implementation, route inventory entry and authenticated web↔MCP acceptance test SHALL be added in the same change.
- **WHEN** a teacher archives, reactivates, corrects or reviews historical data **THEN** website and MCP SHALL use the same identity, quota, authorization and historical-preservation rules.

## Requirement: Shared domain writes SHALL preserve security and audit semantics

Each adapter SHALL authorize the delegated teacher, enforce `coach:read` / `coach:write`, preserve tenant and workplace boundaries, validate typed inputs, and reuse the domain's atomic revision and idempotency rules. Sensitive business writes SHALL demand explicit confirmation and return a bounded, auditable receipt instead of an unsafe hidden side effect.

### Scenarios
- **WHEN** a grant is read-only, expired or revoked, a record is foreign, a field unknown, a revision stale, or a replay payload inconsistent **THEN** the operation SHALL deny without secret disclosure or partial mutation.
- **WHEN** an authenticated browser and delegated MCP client make the same approved operation **THEN** they SHALL invoke equivalent domain logic and preserve the same business invariants and historical evidence.

## Requirement: Canonical attendance SHALL use one actual lesson model

Private, group, calendar and other actual teaching occurrences SHALL use canonical `teaching_sessions`, `session_participants` and `session_attendance`; independent legacy `lessons`/`attendance` writers and compatibility adapters SHALL NOT be reintroduced. Notes, cancellations, credit/invoice references, notifications, recurrence and history SHALL remain associated with canonical occurrences under the separately applied canonical attendance specification.

### Scenarios
- **WHEN** a session is completed or corrected **THEN** frozen participant attendance, notes, audit revisions and protected financial history SHALL be committed through tenant-authorized, retry-safe canonical operations.
- **WHEN** a group lesson has several participants **THEN** teacher time SHALL be counted once while participant attendance and billable student identities remain individual.

## Requirement: Website and MCP workplace reports SHALL be identical

`/api/coaching/report` and `ccp_reports_workplace_summary` SHALL use the same bounded teacher-scoped calculations and sanitized JSON, CSV and text formatters, including validated workplace-local inclusive date ranges.

### Scenarios
- **WHEN** the teacher requests the same workplace/date interval from either interface **THEN** lesson counts, teaching minutes, attendance and student totals SHALL be identical.
- **WHEN** a foreign workplace, invalid date or unsafe export field is supplied **THEN** the request SHALL fail without leaking student information or spreadsheet formula injection.

## Requirement: Security-sensitive entry SHALL use explicit narrow browser handoffs

Passwords, MFA, OAuth/provider credentials, hosted checkout/card entry and a browser-only full private backup containing credentials MAY use an authenticated, documented browser handoff. MCP SHALL expose only approved initiation/status/redacted-export operations; ordinary teacher business fields SHALL NOT be hidden behind this exception.

### Scenarios
- **WHEN** MCP initiates credential or hosted-payment management **THEN** it SHALL return only an approved secure browser destination, never the credential or provider secret.
- **WHEN** the teacher requests a model-safe data export **THEN** sensitive tokens and portal credentials SHALL be excluded without silently narrowing ordinary history records.

## Requirement: Parity SHALL be an enforced development and release gate

The complete teacher-route registry, actual delegated OAuth `tools/list` catalogue, per-route shared imported service evidence, the independently named gateway actions and the browser↔MCP acceptance matrix SHALL be checked automatically. Regular CI SHALL enforce the strict parity audit, not only report gaps. A new mismatch SHALL fail the build.

### Scenarios
- **WHEN** any teacher route has a missing or partial MCP counterpart, an unverified required scenario, or a website-only domain operation **THEN** `npm run mcp:parity:strict` or the same-PR guard SHALL fail.
- **WHEN** a parity change is accepted **THEN** its 93 historical and 26 additional chess/canonical cases SHALL have named authenticated evidence and the exact merged-main source SHALL pass CI, E2E, security, Compose and restore workflows.
- **WHEN** version v0.1.0 is prepared for publication **THEN** real ChatGPT and Claude client acceptance remains a distinct local prepublication sign-off; automated parity evidence SHALL NOT be misrepresented as live-vendor certification.

## Requirement: Manual payments on saved draft invoices SHALL retain private and reconciled financial history

An authenticated coach may record a partial or full real-world manual payment on either a saved draft or a sent invoice through the existing website and MCP operations. Recording the payment SHALL NOT email, publish, or silently send an unsent draft. Both surfaces SHALL require review and confirmation, reject duplicate/conflicting idempotency replays, and use the same owner-scoped transactional payment writer. The website SHALL save current on-screen line edits successfully before recording money; MCP SHALL offer the corresponding draft edit first when needed.

### Scenarios
- **WHEN** a coach records partial manual funds on a draft **THEN** the invoice remains draft and private, with its payment ledger and remaining balance available to the teacher through both surfaces.
- **WHEN** a draft edit, regeneration, or deletion would lower its total below the amount collected or destroy a payment/prepaid-credit record **THEN** the database SHALL reject the whole transaction and leave the original data unchanged.
- **WHEN** a paid never-sent invoice has an erroneous payment reversed **THEN** it SHALL reopen as an unsent draft. A previously sent invoice SHALL reopen as sent; redeemed prepaid credits SHALL prevent an unsafe reversal.
- **WHEN** a coach sends a partially paid draft **THEN** one server-side lock SHALL confirm that the PDF, email and payment link refer to the unchanged remaining balance. Stale snapshots, active incompatible Stripe sessions and competing sends SHALL be rejected.

## Requirement: Published MCP schema, actual dispatch and client discovery SHALL agree

All named `ccp_<domain>_<action>` operations SHALL expose a client-discoverable **root-object** JSON Schema derived from the same typed core as website input. A website or MCP route SHALL NOT introduce a parallel schema adapter or silently drop any optional field. Every supported field (including `assessedOn`, duration, notes, links, explicit nulls, revisions, idempotency UUIDs) SHALL be forwarded to the owner-scoped service and verified by persisted read-back, not just accepted by validation.

### Scenario: Tool advertised but not loaded in a real Claude conversation

- **WHEN** connector settings show a named write tool but the actual conversation's deferred ToolSearch cannot load it
- **THEN** the failure SHALL be reported as client-discovery/contract acceptance, not conflated with server registration or data storage; the exact current `tools/list`, root schema, deployed SHA, fresh client conversation and `tools/call` SHALL be checked.
- **AND** the current shared input schema SHALL be corrected rather than adding an MCP-only compatibility adapter, as in the resolved `ccp_learning_materials_create` incident.

### Scenario: Optional date disappears in MCP dispatcher

- **WHEN** an authorized client records a 1–5 skill assessment with explicit historical `assessedOn`
- **THEN** website and MCP SHALL store and independently read the exact same teacher-local date, even across retry, not silently default to today.
- **AND** the E2E test SHALL invoke the **real delegated MCP dispatcher** and compare the result to the website on the same record.

### Scenario: Actual client acceptance has honest boundaries

- **WHEN** Claude Desktop passes the material create/link/record/void workflow
- **THEN** the result SHALL certify only that concrete client's tested tools; registered count, green CI and a different client's behavior SHALL NOT imply ChatGPT interoperability.

## Requirement: Semantic parity SHALL preserve identity, evidence and source distinctions

The student resolver SHALL distinguish duplicate *roster references to one student ID* from different students with an ambiguous shared alias. A proposed roster including full name and alias of the same student SHALL fail closed without creating duplicate attendance while preserving explicit per-input matches and a safe deduplicated matched-ID view. A platform rating snapshot SHALL remain independent of teacher strength, skill grades and manually edited profile ratings. Student progress SHALL expose latest time-control/provider/source/observed-at snapshots and bounded dated skill trend, with no automatic mastery inference.

### Scenario: Reconcile name and alias without duplicating a student
- **WHEN** the teacher resolves "Full reporting name" and its saved alias together
- **THEN** both entries SHALL identify one stable UUID and a clear duplicate-*roster-reference* issue SHALL prevent a double-counted lesson; the system SHALL NOT assert two student records exist.

### Scenario: Provider rating snapshots exist but profile scalar is unset
- **WHEN** two historical Lichess rapid snapshots exist and the teacher's explicit profile rating is absent
- **THEN** the latest rapid snapshot MAY fill a clearly sourced display scalar, while the snapshot list/history still records provider, time control, source and observation dates, and strength stays unchanged.

### Scenario: Material evidence correction
- **WHEN** teacher-approved `assigned` material evidence is voided
- **THEN** history with voids included SHALL retain correction metadata, while default progress excludes the assigned count; a separately recorded `taught` claim SHALL remain and SHALL NOT imply mastery.

