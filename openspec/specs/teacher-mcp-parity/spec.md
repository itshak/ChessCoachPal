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

`/api/coaching/report` and `ccp_v1_reports_workplace_summary` SHALL use the same bounded teacher-scoped calculations and sanitized JSON, CSV and text formatters, including validated workplace-local inclusive date ranges.

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
