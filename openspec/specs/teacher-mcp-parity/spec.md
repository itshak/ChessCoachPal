# Applied specification — teacher website and MCP functional parity

## Purpose

**Scope:** Teacher-owned business features in the ChessCoachPal website and delegated `/mcp` gateway. This specification establishes the enforced parity contract; actual ChatGPT/Claude client publication acceptance remains a separate release gate. See [ADR-0003](../../../docs/adr/0003-mcp-website-business-parity.md), the [93-case matrix](../../../docs/MCP_WEBSITE_PARITY_CHECKLIST.md), the [chess-first scenarios](../../../docs/MCP_NEW_PARITY_SCENARIOS.md), and [canonical lesson attendance](../canonical-lesson-attendance/spec.md).

## Requirements

### Requirement: Teacher business operations SHALL have authenticated MCP equivalents

Every ordinary teacher-owned website business read, editable field, correction, status transition, history view, report, bounded export/import and create/update/delete operation SHALL have a typed authenticated MCP counterpart using the same domain service and validation. This applies to students (aliases, handles, source-specific ratings, strength and archive), workplaces, groups, calendars, frozen lesson rosters, attendance, learning materials and assignments, guardians and events, reports, settings, payments, invoices, credits and data transfer.

#### Scenario: Existing scenario 1
- **WHEN** the teacher reads or edits a field through website or MCP
- **THEN** the other surface SHALL observe the same persisted owner-scoped record, clear/null semantics, revision, and local-date interpretation.
#### Scenario: Existing scenario 2
- **WHEN** a new website business route, operation or editable field is added
- **THEN** its MCP tool, shared domain implementation, route inventory entry and authenticated web↔MCP acceptance test SHALL be added in the same change.
#### Scenario: Existing scenario 3
- **WHEN** a teacher archives, reactivates, corrects or reviews historical data
- **THEN** website and MCP SHALL use the same identity, quota, authorization and historical-preservation rules.

### Requirement: Shared domain writes SHALL preserve security and audit semantics

Each adapter SHALL authorize the delegated teacher, enforce `coach:read` / `coach:write`, preserve tenant and workplace boundaries, validate typed inputs, and reuse the domain's atomic revision and idempotency rules. Sensitive business writes SHALL demand explicit confirmation and return a bounded, auditable receipt instead of an unsafe hidden side effect.

#### Scenario: Existing scenario 1
- **WHEN** a grant is read-only, expired or revoked, a record is foreign, a field unknown, a revision stale, or a replay payload inconsistent
- **THEN** the operation SHALL deny without secret disclosure or partial mutation.
#### Scenario: Existing scenario 2
- **WHEN** an authenticated browser and delegated MCP client make the same approved operation
- **THEN** they SHALL invoke equivalent domain logic and preserve the same business invariants and historical evidence.

### Requirement: Canonical attendance SHALL use one actual lesson model

Private, group, calendar and other actual teaching occurrences SHALL use canonical `teaching_sessions`, `session_participants` and `session_attendance`; independent legacy `lessons`/`attendance` writers and compatibility adapters SHALL NOT be reintroduced. Notes, cancellations, credit/invoice references, notifications, recurrence and history SHALL remain associated with canonical occurrences under the separately applied canonical attendance specification.

#### Scenario: Existing scenario 1
- **WHEN** a session is completed or corrected
- **THEN** frozen participant attendance, notes, audit revisions and protected financial history SHALL be committed through tenant-authorized, retry-safe canonical operations.
#### Scenario: Existing scenario 2
- **WHEN** a group lesson has several participants
- **THEN** teacher time SHALL be counted once while participant attendance and billable student identities remain individual.

### Requirement: Website and MCP workplace reports SHALL be identical

`/api/coaching/report` and `ccp_reports_workplace_summary` SHALL use the same bounded teacher-scoped calculations and sanitized JSON, CSV and text formatters, including validated workplace-local inclusive date ranges.

#### Scenario: Existing scenario 1
- **WHEN** the teacher requests the same workplace/date interval from either interface
- **THEN** lesson counts, teaching minutes, attendance and student totals SHALL be identical.
#### Scenario: Existing scenario 2
- **WHEN** a foreign workplace, invalid date or unsafe export field is supplied
- **THEN** the request SHALL fail without leaking student information or spreadsheet formula injection.

### Requirement: Security-sensitive entry SHALL use explicit narrow browser handoffs

Passwords, MFA, OAuth/provider credentials, hosted checkout/card entry and a browser-only full private backup containing credentials MAY use an authenticated, documented browser handoff. MCP SHALL expose only approved initiation/status/redacted-export operations; ordinary teacher business fields SHALL NOT be hidden behind this exception.

#### Scenario: Existing scenario 1
- **WHEN** MCP initiates credential or hosted-payment management
- **THEN** it SHALL return only an approved secure browser destination, never the credential or provider secret.
#### Scenario: Existing scenario 2
- **WHEN** the teacher requests a model-safe data export
- **THEN** sensitive tokens and portal credentials SHALL be excluded without silently narrowing ordinary history records.

### Requirement: Parity SHALL be an enforced development and release gate

The complete teacher-route registry, actual delegated OAuth `tools/list` catalogue, per-route shared imported service evidence, the independently named gateway actions and the browser↔MCP acceptance matrix SHALL be checked automatically. Regular CI SHALL enforce the strict parity audit, not only report gaps. A new mismatch SHALL fail the build.

#### Scenario: Existing scenario 1
- **WHEN** any teacher route has a missing or partial MCP counterpart, an unverified required scenario, or a website-only domain operation
- **THEN** `npm run mcp:parity:strict` or the same-PR guard SHALL fail.
#### Scenario: Existing scenario 2
- **WHEN** a parity change is accepted
- **THEN** its 93 historical and 26 additional chess/canonical cases SHALL have named authenticated evidence and the exact merged-main source SHALL pass CI, E2E, security, Compose and restore workflows.
#### Scenario: Existing scenario 3
- **WHEN** version v0.1.0 is prepared for publication
- **THEN** real ChatGPT and Claude client acceptance remains a distinct local prepublication sign-off; automated parity evidence SHALL NOT be misrepresented as live-vendor certification.

### Requirement: Manual payments on saved draft invoices SHALL retain private and reconciled financial history

An authenticated coach may record a partial or full real-world manual payment on either a saved draft or a sent invoice through the existing website and MCP operations. Recording the payment SHALL NOT email, publish, or silently send an unsent draft. Both surfaces SHALL require review and confirmation, reject duplicate/conflicting idempotency replays, and use the same owner-scoped transactional payment writer. The website SHALL save current on-screen line edits successfully before recording money; MCP SHALL offer the corresponding draft edit first when needed.

#### Scenario: Existing scenario 1
- **WHEN** a coach records partial manual funds on a draft
- **THEN** the invoice remains draft and private, with its payment ledger and remaining balance available to the teacher through both surfaces.
#### Scenario: Existing scenario 2
- **WHEN** a draft edit, regeneration, or deletion would lower its total below the amount collected or destroy a payment/prepaid-credit record
- **THEN** the database SHALL reject the whole transaction and leave the original data unchanged.
#### Scenario: Existing scenario 3
- **WHEN** a paid never-sent invoice has an erroneous payment reversed
- **THEN** it SHALL reopen as an unsent draft. A previously sent invoice SHALL reopen as sent; redeemed prepaid credits SHALL prevent an unsafe reversal.
#### Scenario: Existing scenario 4
- **WHEN** a coach sends a partially paid draft
- **THEN** one server-side lock SHALL confirm that the PDF, email and payment link refer to the unchanged remaining balance. Stale snapshots, active incompatible Stripe sessions and competing sends SHALL be rejected.

### Requirement: Published MCP schema, actual dispatch and client discovery SHALL agree

All named `ccp_<domain>_<action>` operations SHALL expose a client-discoverable **root-object** JSON Schema derived from the same typed core as website input. A website or MCP route SHALL NOT introduce a parallel schema adapter or silently drop any optional field. Every supported field (including `assessedOn`, duration, notes, links, explicit nulls, revisions, idempotency UUIDs) SHALL be forwarded to the owner-scoped service and verified by persisted read-back, not just accepted by validation.

#### Scenario: Tool advertised but not loaded in a real Claude conversation

- **WHEN** connector settings show a named write tool but the actual conversation's deferred ToolSearch cannot load it
- **THEN** the failure SHALL be reported as client-discovery/contract acceptance, not conflated with server registration or data storage; the exact current `tools/list`, root schema, deployed SHA, fresh client conversation and `tools/call` SHALL be checked.
- **AND** the current shared input schema SHALL be corrected rather than adding an MCP-only compatibility adapter, as in the resolved `ccp_learning_materials_create` incident.

#### Scenario: Optional date disappears in MCP dispatcher

- **WHEN** an authorized client records a 1–5 skill assessment with explicit historical `assessedOn`
- **THEN** website and MCP SHALL store and independently read the exact same teacher-local date, even across retry, not silently default to today.
- **AND** the E2E test SHALL invoke the **real delegated MCP dispatcher** and compare the result to the website on the same record.

#### Scenario: Actual client acceptance has honest boundaries

- **WHEN** Claude Desktop passes the material create/link/record/void workflow
- **THEN** the result SHALL certify only that concrete client's tested tools; registered count, green CI and a different client's behavior SHALL NOT imply ChatGPT interoperability.

### Requirement: Semantic parity SHALL preserve identity, evidence and source distinctions

The student resolver SHALL distinguish duplicate *roster references to one student ID* from different students with an ambiguous shared alias. A proposed roster including full name and alias of the same student SHALL fail closed without creating duplicate attendance while preserving explicit per-input matches and a safe deduplicated matched-ID view. A platform rating snapshot SHALL remain independent of teacher strength, skill grades and manually edited profile ratings. Student progress SHALL expose latest time-control/provider/source/observed-at snapshots and bounded dated skill trend, with no automatic mastery inference.

#### Scenario: Reconcile name and alias without duplicating a student
- **WHEN** the teacher resolves "Full reporting name" and its saved alias together
- **THEN** both entries SHALL identify one stable UUID and a clear duplicate-*roster-reference* issue SHALL prevent a double-counted lesson; the system SHALL NOT assert two student records exist.

#### Scenario: Provider rating snapshots exist but profile scalar is unset
- **WHEN** two historical Lichess rapid snapshots exist and the teacher's explicit profile rating is absent
- **THEN** the latest rapid snapshot MAY fill a clearly sourced display scalar, while the snapshot list/history still records provider, time control, source and observation dates, and strength stays unchanged.

#### Scenario: Material evidence correction
- **WHEN** teacher-approved `assigned` material evidence is voided
- **THEN** history with voids included SHALL retain correction metadata, while default progress excludes the assigned count; a separately recorded `taught` claim SHALL remain and SHALL NOT imply mastery.

### Requirement: Every portable teacher data category SHALL export in CSV without credential disclosure

The existing full JSON backup SHALL remain the supported lossless restore
format. The authenticated website SHALL provide a complete ZIP containing a
UTF-8 CSV for each supported teacher-owned data category, including archived
students and source-precise historical attendance. MCP SHALL enumerate the same
category names and row counts and retrieve each CSV in bounded, pagewise
content with stable headers. Both adapters SHALL share the same filtered
projection, remove sensitive portal/credential secrets, and neutralize CSV
formula-leading values. Large binary ZIP downloads MAY remain an explicit
browser-only transport boundary; this SHALL NOT hide ordinary data from MCP.

#### Scenario: Download or page across interfaces
- **WHEN** a teacher requests all-data CSV from the website
- **THEN** one authorized ZIP SHALL contain all supported tables and an
  explicit manifest, without silently stopping after the database's default
  1,000-row page.
- **WHEN** the same teacher requests CSV through MCP
- **THEN** successive page requests SHALL reconstruct the identical sanitized
  data for each table without exposing portal tokens or secrets.

### Requirement: MCP initialization SHALL offer accurate version and workflow discovery

The MCP initializer SHALL report the deployed package version, and provide
concise agent guidance to select the intended date-list, calendar lesson,
student roster and export tools. JSON-RPC request size SHALL be bounded at
read time, and SHALL not contradict advertised direct import limits.

#### Scenario: A new client reconnects after deploying an import feature
- **WHEN** a client initializes a fresh MCP session and retrieves tools/list
- **THEN** it SHALL see the new date-list tool contracts and the current server
  version, with guidance against guessing student/family column mappings for
  historical attendance, and SHALL be able to submit a reviewed >32-KiB
  request up to the documented bounded envelope.

### Requirement: Every ordinary teacher business capability SHALL remain reachable via one authenticated MCP connector

All teacher-owned website business reads, searchable fields, editable fields, history, student/material/session/group operations, reports, schedule, finance, communications and data transfer SHALL retain a named authorized MCP counterpart through the existing `/mcp` connector. A task-oriented composite MAY be the preferred way to complete an entire teacher request; it SHALL NOT remove exact record-level create/edit/correct/clear functionality. Sensitive credentials, card entry, MFA and a narrowly reviewed class of high-risk operations MAY continue through secure browser handoffs initiated by MCP where appropriate.

#### Scenario: Composite operation replaces a repetitive low-level sequence
- **WHEN** a new workflow tool creates or links multiple teaching records in one validated operation
- **THEN** the corresponding ordinary website operations and independent granular MCP editing/inspection capabilities SHALL still be available to the same appropriately authorized teacher
- **AND** shared domain contracts, owner scope, revision and audit SHALL produce equivalent final records across surfaces.

#### Scenario: Optimizing tool count would hide a website capability
- **WHEN** an MCP tool is considered for retirement or consolidation
- **THEN** a reviewed inventory SHALL identify all affected website fields/actions and their remaining named authorized MCP operations, with strict parity cases updated to prove full reachability
- **AND** any missing capability SHALL block implementation acceptance, regardless of reduced catalog size.

#### Scenario: Subscription entitlement changes advertised operations
- **WHEN** the authenticated teacher has different plan entitlements or OAuth scopes
- **THEN** server-side `tools/call` authorization SHALL enforce the actual scope and plan regardless of tool-list caching
- **AND** filtering tools MAY reflect stable authenticated capabilities but SHALL NOT make ordinary Free functionality disappear or conflate subscription billing administration with coach-to-student invoice features.

### Requirement: Workflow and granular MCP operations SHALL use one canonical domain service

Both website routes and MCP tools SHALL execute shared owner-scoped typed domain services. Composite commands MAY coordinate multiple existing domain primitives, but SHALL NOT duplicate business rules, expose raw SQL, bypass confirmation, or silently omit optional fields. New capabilities SHALL update the parity registry and authenticated E2E in the same implementation PR.

#### Scenario: Teacher corrects part of a composite-created lesson
- **WHEN** an authorized teacher edits one participant's attendance or one material evidence record via the website or granular MCP tool after a composite lesson capture
- **THEN** both surfaces SHALL observe the same canonical record, preserved revision and audit trail
- **AND** other participants, teaching minutes and unrelated evidence SHALL remain correct.

#### Scenario: Composite commit fails midway
- **WHEN** one local sub-operation in an otherwise approved combined lesson/material workflow fails
- **THEN** the application SHALL roll back the entire local unit of work without a ghost lesson or orphaned association
- **AND** an independently retried, correctly authorized request SHALL use immutable idempotency semantics and disclose pending external-provider reconciliation when relevant.

### Requirement: Historical date-list and portable export surfaces SHALL retain PR #95 parity

The already-merged source-neutral historical date-list import SHALL use the same owner-scoped preview/commit contract on website and MCP, distinct from calendar lesson capture, advanced historical source mapping and student/family roster spreadsheets. The website's full CSV ZIP SHALL correspond to the MCP's sanitized paginated table catalog and data; JSON restore export remains independently supported. Transport limitations SHALL be explicit rather than misreported as missing core business parity.

#### Scenario: Historical date import retains identical history evidence
- **WHEN** the same teacher previews approved ISO presence dates for one workplace via website and MCP
- **THEN** both SHALL agree on identities, source bounds, duplicate/ambiguity checks, digest, committed historical evidence and replay results
- **AND** neither SHALL create canonical lessons, inferred attendance duration, payables or mastery.

#### Scenario: Complete CSV export uses different safe transports
- **WHEN** a teacher requests all-data CSV through the website and through MCP
- **THEN** the website ZIP manifest and the MCP table catalog/pages SHALL represent the same secret-redacted owner-owned records, with stable headers and safe spreadsheet quoting, without silent truncation
- **AND** a client SHALL NOT need the binary ZIP in model context to exercise the equivalent authorized export capability.

#### Scenario: Large reviewed import honors request boundaries
- **WHEN** a valid direct historical date request exceeds the former 32-KiB framing limit but stays within the current documented 320-KiB envelope and per-operation 250-observation/256-KiB input bounds
- **THEN** the MCP gateway SHALL accept it for preview/commit as authorized, and SHALL safely reject oversized requests with no partial mutations.

### Requirement: Parity remains a strict implementation and release gate

The source inventory, full route/tool field mappings, strict 93 original + 26 chess/canonical scenarios, additional workflow-specific authenticated browser↔MCP E2E and current security/backup/recovery gates SHALL continue to apply. Tool-description or name-only presence SHALL never count as full behavior verification.

#### Scenario: Workflow-first refactor submitted for acceptance
- **WHEN** an implementation changes one or more MCP tools or their shared services
- **THEN** same-PR parity inventory/guards, canonical field propagation, tenant isolation, idempotency, independent read-back and required GitHub workflows SHALL be green on exact tested source and merged main
- **AND** a smaller advertised catalog or simulated model sequence SHALL NOT waive any previous business parity assertion.
