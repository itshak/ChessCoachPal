# Proposed specification delta: MCP-first website feature and reporting parity

**Status: PROPOSED, release-blocking and unimplemented.** The present 28 live MCP tools have partial coverage only. The [complete code-audited checklist](../../../../../docs/MCP_WEBSITE_PARITY_CHECKLIST.md) contains 93 uncompleted behavioral/security cases and the [machine inventory](../../../../../scripts/mcp-website-parity.json) contains 61 routes/17 pages/49 components.

## Requirement: Website is an optional presentation layer, not the authoritative API

Every ordinary business action and editable teacher-owned field provided by a website form, page, route or teacher-visible report MUST also be discoverable and supported via the **same ChessCoachPal /mcp** connection. A new business feature SHALL NOT be accepted until the website and MCP versions share the domain service, permissions and tests. A high-risk browser reauthentication/approval exception is permitted **only** if narrowly justified and chat can start and track the approval, not as a blanket waiver for missing tools.

### Scenarios
- **WHEN** a new student or workplace editable field is added to the website, **THEN** CI SHALL reject an untracked API method/page/component, require field registry update, equivalent MCP tool or approved sensitive exception, and tests. A renamed UI control alone SHALL NOT silently remove MCP access.
- **WHEN** teacher asks “rename Marshal Chess Club” or “edit Armond's level” **THEN** verified current `ccp_v1_workplaces_update` and `ccp_v1_students_update` SHALL safely modify the same entity visible on the website, not create duplicates.
- **WHEN** teacher asks to add an alias, update strength, edit a birthdate or correct private notes **THEN** the proper typed/allowlisted MCP patch SHALL validate one teacher-owned stable ID, required sensitive scope, field semantics and optimistic revision; missing capability is an implementation failure.
- **WHEN** a teacher clears a nullable field **THEN** explicit `null` SHALL clear and omission SHALL preserve the existing value. Unknown/read-only/secret paths SHALL reject without partial writes.
- **WHEN** model tries to update another teacher's student or group, access a service-role key, invoke raw SQL, or use a revoked token **THEN** the call SHALL fail without revealing underlying existence or credentials.

## Requirement: Teacher reports are available via existing MCP connection

The same authenticated report domain service SHALL power the website's `/api/coaching/report` and MCP `ccp_v1_reports_workplace_summary`, plus student progress/material reports and reviewed CSV/text exports.

### Scenarios
- **WHEN** teacher requests “show Marshal October's report” **THEN** MCP SHALL return the same workplace local-date sessions, cancellations, instructor minutes and attendance-status totals as the website, using an identical timezone/source calculation.
- **WHEN** three pupils participated in one 13:00–14:30 lesson **THEN** teacher time SHALL be 90 minutes, with three participant attendance entries—not 270 teacher minutes.
- **WHEN** teacher requests CSV/text output **THEN** MCP SHALL use the same export formatting, bounded/private destination, formula injection defense, and Hebrew mixed-direction support as the website; PII detail requires separate permission and confirmation.
- **WHEN** a legacy lesson and a newer teaching session are projections of the same occurrence **THEN** reports SHALL not double-count them.
- **WHEN** unauthorized or read-only client requests sensitive report/export **THEN** the system SHALL reject it; no secret or other-teacher data is revealed through summaries.

## Requirement: Material history is contextual, complete and truthful

### Scenarios
- **WHEN** teacher asks “show all material Armond learned” **THEN** MCP SHALL retrieve a paginated full history of **taught/covered**, assigned, merely linked and reported completed chapters with source/lesson/time, keeping unknown comprehension explicitly unknown.
- **WHEN** teacher asks “list everything covered at Marshal this month” **THEN** MCP SHALL filter original session workplace, not current enrollment; one game taught to three students in one session counts once in workplace session coverage and separately for each student.
- **WHEN** a study URL exists without verified provider chapter, **THEN** results SHALL display it as linked/unverified rather than claim a specific game or mastery.
- **WHEN** a student changes workplace or a group roster is edited **THEN** frozen historical participant/material association SHALL remain correct.

## Requirement: Sensitive operations remain chat-orchestrated, explicitly authorized

### Scenarios
- **WHEN** a teacher requests guardian contacts, invoice corrections, billing, calendar event emails, bulk import/export or deletion **THEN** the system SHALL provide purpose-limited read/preview/commit with extra scopes, human confirmation and an auditable receipt.
- **WHEN** action requires password, MFA, OAuth consent/provider token, payment card/payout details or provider subscription portal **THEN** MCP SHALL offer a short-lived safe website approval/handoff rather than reveal credentials or grant model arbitrary writes.
- **WHEN** guardian-originated RSVP/cancellation, service webhook/cron or device push registration is called by a teacher MCP grant **THEN** cross-authority impersonation SHALL be denied. These are documented nonteacher exceptions, not parity gaps.

## Requirement: Gate full feature acceptance and first release

### Scenarios
- **WHEN** regular CI runs **THEN** `npm run mcp:parity:audit` SHALL verify every teacher website page, component, API route/method, and any claimed MCP names; untracked new website surface fails.
- **WHEN** actual release validation runs **THEN** `npm run mcp:parity:strict` SHALL fail while **any** teacher-business route remains partial/gap and SHALL also require all 93 browser↔MCP behavior/security cases and prior publication gates as signoff evidence.
- **WHEN** a proposed tool remains unimplemented **THEN** it SHALL not appear in the MCP `tools/list` or be marked complete in docs/registry/checklist.
