# Applied specification — reviewed multi-student lesson capture

**Scope:** The exact-name/alias capture preview and human-confirmed ad-hoc session writer, delivered as one incremental slice of the active `support-conversational-lesson-and-lichess-workflows` OpenSpec. This includes date-only missing-hour inference when a single shared active weekday slot is verified. It does **not** complete free-form natural-language date parsing, exact Lichess study-chapter selection, full historical correction or provider writes.

## Requirement: Lesson identity preview SHALL be tenant-owned and read-only

An authorized teacher MAY propose a single session for two to fifty active learners using exact report names or stored aliases. Website and delegated MCP SHALL reuse the same typed input and shared domain service. Normalization MAY fold Unicode compatibility, case and surrounding/repeated whitespace but SHALL NOT invent transliteration, substring matches or a best-guess identity. The resolver SHALL page tenant-owned active learners rather than silently truncating a roster; it SHALL fail closed when the safe scan limit is reached or its data cannot be verified.

### Scenario: Exact Hebrew report name and English alias

- **WHEN** a teacher proposes a lesson for a mixed set of Hebrew reporting names and unambiguous English aliases
- **THEN** the preview SHALL identify the exact stable student IDs without creating sessions, participants, attendance or mastery records.

### Scenario: Ambiguous, missing or repeated identity

- **WHEN** an alias matches several active learners, matches none, or the same stable learner is named twice
- **THEN** the result SHALL present relevant owner-scoped candidates or a clear issue and set `canCommit=false`; no write SHALL be performed.

## Requirement: Workplace and timestamp SHALL be explicit and verifiable

The preview SHALL require **either** (a) an absolute start instant with an offset and a validated duration of 15–480 minutes, **or** (b) one real `YYYY-MM-DD` workplace-local date, a title and optional note. Combining the two timing modes SHALL be rejected. When a workplace is supplied, all resolved learners SHALL currently belong to it. When omitted, the backend MAY infer it only when exactly one common current workplace exists. The website's local datetime conversion SHALL reject ambiguous daylight-saving folds and nonexistent wall-clock instants. In date-only mode, every named student SHALL have an active owned slot on that day in that workplace; exactly one common local start/duration SHALL be required. Missing, incompatible, multiple matching slots, ambiguous/nonexistent time under the workplace's IANA rules, or occupied canonical instructor intervals SHALL prevent a commit-ready preview. Unassigned personal slots SHALL NOT be treated as evidence for an explicitly selected workplace. The preview SHALL name the inferred time source and original slot IDs, without writing or claiming attendance.

### Scenario: Three students in one school

- **WHEN** three active learners all belong to one shared workplace and a 90-minute class is proposed
- **THEN** the read-only preview SHALL display one candidate session with all three stable IDs and 90 teacher minutes, whether the school is selected or uniquely inferred.

### Scenario: Multiple schools or missing enrollment

- **WHEN** the named learners have zero or multiple common workplaces, or a specified school omits a learner
- **THEN** the preview SHALL refuse a commit-ready proposal and request explicit teacher resolution, never silently enrolling a learner.

### Scenario: Omitted hour with one common weekly slot

- **WHEN** the teacher supplies a known local date but no time for learners who each have exactly one compatible active recurring slot with the same start and duration
- **THEN** website and MCP SHALL resolve the same explicit UTC instant, show the local timezone, evidence slot IDs and require human confirmation before the existing one-session write.

### Scenario: Missing, conflicting, DST or already-occupied slot

- **WHEN** a named learner lacks a slot, multiple common slot times exist, the inferred wall-clock time is in a DST gap/fold, or a canonical session already occupies the interval
- **THEN** the read-only preview SHALL refuse `canCommit`, expose a non-sensitive resolution reason, and require the teacher to supply a verified time or correct the existing session.

## Requirement: Session creation SHALL require a reviewed, idempotent operation

The browser SHALL require an affirmative checkbox after preview; a delegated agent SHALL call the existing confirmed `ccp_v1_sessions_ad_hoc_create` tool using the exact stable IDs and a request UUID. Both SHALL use the existing `ccp_teacher_ad_hoc_session_create` SQL transaction, which revalidates teacher ownership, active enrollment, duplicates, schedule overlap and request replay. Teacher time SHALL be recorded once. All participants start with **unmarked** attendance; comprehension, material mastery and verified notes SHALL NOT be inferred.

### Scenario: Cross-interface retry

- **WHEN** an approved MCP creation is retried with the same request UUID through the website
- **THEN** the same session and frozen roster SHALL be returned without a duplicate occurrence.

### Scenario: Changed replay

- **WHEN** a client retries a committed request UUID with a materially different title, time or participant set
- **THEN** the transaction SHALL reject the request and SHALL NOT mutate the original session.

## Requirement: Website and MCP SHALL have independently tested behavioral parity

The authenticated website `POST /api/coaching/lesson-capture/preview` and delegated `ccp_v1_lessons_capture_preview` (`coach:read`, read-only) SHALL return identical business outputs and invoke the same owner-scoped service. A confirmed write remains separate (`coach:write`) through existing canonical session tools. The route, MCP tool, coaching-page component and independent cross-interface E2E evidence SHALL be registered and enforced by the strict parity check.

### Scenario: Acceptance

- **WHEN** the teacher previews Hebrew/English aliases and safely creates a three-learner session across browser and delegated MCP
- **THEN** the independent tests in `e2e/parity-lesson-capture-preview.spec.ts` SHALL prove field parity, zero preview writes, identity/workplace negative cases, frozen roster, unmarked attendance and unchanged-id retry.
- **AND** the existing active parent OpenSpec SHALL remain unarchived until the other conversational and study workflows are separately accepted.

See [usage guide](../../../docs/LESSON_CAPTURE_PREVIEW.md), [new scenario matrix](../../../docs/MCP_NEW_PARITY_SCENARIOS.md), [canonical lesson spec](../canonical-lesson-attendance/spec.md), and [ADR-0003](../../../docs/adr/0003-mcp-website-business-parity.md).
