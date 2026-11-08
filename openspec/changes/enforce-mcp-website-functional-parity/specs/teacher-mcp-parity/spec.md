# Delta: Full website and MCP functional parity

## Requirement: Every teacher business UI operation SHALL have a counterpart in MCP

Each teacher-owned website read, editable field, mutation, history, export or report SHALL also be available through the existing authenticated `/mcp` gateway with equivalent tenant-scoped domain semantics. New web business functionality SHALL NOT land without matching MCP implementation and authenticated behavior tests in the same PR.

### Scenarios
- **WHEN** a new teacher UI/API business feature is introduced **THEN** CI SHALL require an updated parity registry, a live typed MCP tool/adapter and synthetic browser↔MCP E2E coverage.
- **WHEN** a teacher edits, clears or reads the same record through browser and MCP **THEN** both SHALL return the same owner-scoped value, revision, date/timezone semantics and persisted state.
- **WHEN** a read-only or revoked grant, foreign student/workplace ID, unknown property or stale write is used **THEN** the tool SHALL reject without leaking the record or performing partial writes.
- **WHEN** a high-risk action needs card, password, MFA or OAuth credential entry **THEN** only an explicitly documented secure browser handoff MAY be used; ordinary business gaps SHALL NOT be excused as browser-only.

## Requirement: MCP workplace reports SHALL equal website reports

A read-only `ccp_v1_reports_workplace_summary` tool SHALL use the same bounded teacher-scoped service, inclusive workplace-local dates, metrics and CSV/text formatting as the website `/api/coaching/report`.

### Scenarios
- **WHEN** the same authorized workplace/date range is requested through either interface **THEN** active/cancelled sessions, teaching minutes, participant counts and attendance status totals SHALL be identical.
- **WHEN** three learners attend one 90-minute lesson **THEN** teaching minutes SHALL equal 90 and participants SHALL equal 3.
- **WHEN** CSV/text is requested **THEN** the same website formatter SHALL be used, without names/notes in aggregate exports and with formula-injection-safe CSV.
- **WHEN** the workplace belongs to another teacher or date range is invalid **THEN** both surfaces SHALL deny the request without leaking data.

## Requirement: Release is blocked until all feature parity is verified

### Scenarios
- **WHEN** regular CI runs **THEN** source inventory and same-PR parity checks SHALL reject untracked website changes but MAY report outstanding historical gaps.
- **WHEN** release strict validation runs with any missing/partial teacher-business route **OR** any unchecked case in the 93-case checklist **THEN** validation SHALL fail.
- **WHEN** a route is claimed fully MCP-covered **THEN** it SHALL cite a real executable authenticated browser↔MCP E2E test, and that test SHALL have passed on merged main.
