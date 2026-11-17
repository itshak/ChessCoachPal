# Delta: Localized reports, exports, communication and AI text

## ADDED Requirements

### Requirement: Human-readable outputs SHALL honor explicit language selection

Reports, text/CSV exports, PDF/document labels, eligible notifications, parent/guardian portal content and optional drafted text SHALL use en/he/ru translations through shared server-side translation helpers. An explicit outputLocale, when applicable, SHALL override workplace output locale; a supported workplace locale SHALL override teacher preferredLocale for workplace-specific reports; otherwise teacher preference or en SHALL apply. Machine-readable IDs, statuses, JSON property names, ISO dates and stored facts SHALL remain unchanged.

#### Scenario: Teacher asks in Russian for a Hebrew workplace report
- **WHEN** the teacher selects outputLocale=ru on a report for workplace locale he
- **THEN** human-readable labels and text SHALL be Russian, report numbers and date boundaries SHALL remain workplace-local, and no lesson count or student record SHALL change.

#### Scenario: Unknown workplace output language
- **WHEN** a legacy workplace locale is not among current translated locales
- **THEN** the exporter SHALL use a documented deterministic fallback without unsafe dynamic loading or corrupt Unicode.

### Requirement: Website and MCP exports SHALL share identical formatters

The website and MCP SHALL invoke the same authenticated domain report formatter for a given requested outputLocale, workplace and date range. CSV SHALL remain UTF-8, formula-injection safe and round-trip safe for Hebrew/Russian text. If human CSV labels are localized, a separately documented stable machine export mode SHALL preserve downstream field semantics.

#### Scenario: CSV in Hebrew
- **WHEN** website and MCP export the same authorized Hebrew teaching report
- **THEN** each SHALL produce identical bytes, correct numeric totals, BOM/escaping, Hebrew headings in human mode, no student-note leakage and no formula execution.

### Requirement: Parent-facing communication SHALL not guess recipient language

Portal and communication locale SHALL be chosen explicitly where available, otherwise derived from the relevant workplace/portal setting with safe en fallback. Teacher interface language SHALL not silently become the parent's language. Sending, changing recipients, exposing private contact information and altering finance shall remain protected by existing authorization and confirmation steps.

#### Scenario: Russian-speaking teacher and Hebrew-speaking parent
- **WHEN** a teacher whose interface is ru generates a reviewed parent-facing reminder for a he workplace
- **THEN** the reminder SHALL use the agreed recipient/workplace language, preserve actual scheduled local times and require the usual send approval; no automatic send occurs from a locale change.

### Requirement: Optional AI-drafted notes SHALL be locale-aware and evidence-bound

AI-assisted progress note generation SHALL accept an explicit desired language where supported, use only authorized source facts, and remain reviewable before saving. User-authored data SHALL not be machine-translated or rewritten automatically.

#### Scenario: English evidence, Russian summary
- **WHEN** a coach chooses a Russian-language draft based on verified English and Hebrew lesson records
- **THEN** the draft MAY present those facts in Russian, but SHALL not invent ratings/mastery, change persisted evidence or save without teacher approval.

### Requirement: Rendered dates, money and typography SHALL remain correct

Human text SHALL use Intl with the selected locale and actual business timezone/currency. Email markup and PDF fonts SHALL support Hebrew direction and Cyrillic/Unicode characters; chess notation and identifiers SHALL retain readable LTR isolation.

#### Scenario: DST-boundary lesson and Hebrew PDF
- **WHEN** a workplace-local lesson crosses a daylight-saving transition and a Hebrew report PDF is generated
- **THEN** the local calendar/date interpretation SHALL match the canonical service, glyphs SHALL render correctly, and numeric/identifier segments SHALL not be mirrored or truncated.
