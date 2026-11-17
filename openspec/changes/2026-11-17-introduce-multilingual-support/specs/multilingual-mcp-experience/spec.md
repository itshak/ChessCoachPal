# Delta: Language-aware MCP teacher experience

## ADDED Requirements

### Requirement: MCP SHALL expose teacher language preference without changing stable machine contracts

The existing authenticated /mcp connection SHALL expose preferredLocale through teacher profile and trusted teacher context reads, and SHALL allow confirmed teacher profile update through the same validated website/MCP domain service. All ccp_* tool IDs, JSON input/output schema keys, canonical error codes, stable identifiers, OAuth scopes and permissions SHALL remain language-neutral; tools/list SHALL remain deterministic and compatible with clients.

#### Scenario: Russian-speaking coach establishes AI context
- **WHEN** an authenticated client calls ccp_teacher_context_get for a coach with preferredLocale=ru
- **THEN** the response SHALL expose ru alongside trusted local date and timezone without returning student-private information, credentials, or changing existing tool names/schemas.
- **AND** the assistant MAY answer in Russian using canonical tool data while preserving the stable machine identifiers.

### Requirement: Teacher prompt language SHALL take precedence for conversational output

The server SHALL document in existing MCP model-facing metadata/instructions (subject to actual client support) that an explicit user language choice for a current request takes precedence over stored preferredLocale for natural-language answers, while defaulting to preferredLocale when no explicit language is indicated. The model SHALL NOT infer authority or use an LLM translation result to authorize a business write.

#### Scenario: Hebrew query against Russian UI preference
- **WHEN** a coach with preferredLocale=ru explicitly asks in Hebrew to find a student or summarize a lesson
- **THEN** the assistant-facing context SHALL allow Hebrew prose while all reads/writes retain canonical IDs, input schemas, source language and actual authorization rules.

### Requirement: Human-facing MCP output SHALL be localizable without translating data contracts

A shared human-output formatter SHALL accept optional outputLocale (en/he/ru) for reports, export text and human-readable error display where appropriate. Existing structured error.code, machine data/status and stored source records SHALL remain stable. Clients without locale-aware metadata support SHALL still receive usable structured data and English machine-facing descriptions.

#### Scenario: Localized error and stable validation code
- **WHEN** a Hebrew user submits a rejected unsupported preference value or ambiguous student alias
- **THEN** tool output SHALL keep machine-readable VALIDATION_ERROR or AMBIGUOUS_STUDENT and canonical candidate IDs, with any optional user-facing explanation localized consistently; no guessing or unauthorized update occurs.

### Requirement: Multilingual identity and lesson workflows SHALL be evidence-verified

Exact Unicode name/alias normalization and ambiguity detection SHALL continue to resolve stable teacher-owned student IDs without fuzzy matching or automatic transliteration. Both Hebrew and Russian instructions SHALL support the same preview/approval/commit workflows and business logic as English. Conversational language and user-facing translations SHALL not modify session duration accounting, teaching evidence, ratings or historical content.

#### Scenario: Hebrew alias and Russian lesson note
- **WHEN** a teacher resolves a Hebrew student name with an explicitly registered Russian alias, previews a group lesson and approves the commit
- **THEN** it SHALL record one canonical session, correct participant attendance and teacher minutes, preserve the originally authored note, and allow exact browser↔MCP readback.
- **AND** duplicate aliases and ambiguous names SHALL block unsafe writes.

### Requirement: MCP localization SHALL be governed by parity and real-client acceptance

New teacher profile fields and locale-sensitive outputs SHALL have a shared website route/domain operation, registered MCP equivalent, authenticated tests and strict parity evidence in the same implementation PR. Automated delegated-MCP tests SHALL cover locale behavior and negative cases. Live ChatGPT and Claude acceptance SHALL be tracked separately; synthetic tests cannot certify real client language behavior.

#### Scenario: New outputLocale argument
- **WHEN** a language option is added to a website report or assistant tool
- **THEN** both clients SHALL call the same formatter, tests SHALL compare equal results/exports for identical inputs, and tools/list/schema regressions SHALL fail CI.
