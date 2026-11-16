# Delta: Teacher interface localization and full RTL

## ADDED Requirements

### Requirement: Three first-class interface locales SHALL be available

The app SHALL support complete English (en), Hebrew (he) and Russian (ru) website translations through one extensible, type-checked translation framework and explicit locale registry. Supported languages SHALL cover navigation, pages, user-visible messages, onboarding, auth, accessibility and every teacher/guardian web workflow. Unsupported requests SHALL safely fall back to English without leaking raw keys.

#### Scenario: A Russian-speaking coach uses an existing teaching account
- **WHEN** the coach selects Русский and reloads from another device
- **THEN** authenticated pages, dialogs, errors, navigation, content labels, actions, accessible names and confirmations SHALL display Russian and no ordinary workflow SHALL require switching back to English.

#### Scenario: A user has no account or unsupported browser preference
- **WHEN** a first visitor selects עברית on login or sends an unsupported Accept-Language value
- **THEN** the chosen supported locale (or safe en fallback) SHALL render on first server response and remain stable through hydration without requiring a locale route prefix.

### Requirement: Teacher language preference SHALL be durable and have MCP parity

A teacher SHALL have preferredLocale as an authorized, validated account field independently editable/readable via website and authenticated MCP shared profile operations. Valid values are en, he and ru. The website SHALL provide clear native-language selection, immediate verified feedback and a recovery path. A teacher's selected locale SHALL take precedence over browser/cookie hints after login and persist across sessions.

#### Scenario: Change language from an MCP assistant
- **WHEN** an authorized teacher confirms setting preferredLocale=he via ccp_teacher_profile_update
- **THEN** the same shared profile service SHALL persist the value, ccp_teacher_profile_get and website profile SHALL both read he, and the next server-rendered app page SHALL have lang=he and dir=rtl.
- **AND** the update SHALL NOT modify workplace locale, timezone, student data or account credentials.

#### Scenario: Invalid or unauthorized preference update
- **WHEN** a read-only MCP grant, unauthenticated website request or unsupported locale attempts to update the teacher's language
- **THEN** the request SHALL fail with a stable validation/authorization result without any partial change.

### Requirement: RTL SHALL be complete for Hebrew and extensible for future locales

Language direction SHALL come from locale metadata. For he, the **entire website** including header/nav, forms, dialogs, help, portal, calendar, tables, charts, mobile layouts, PDF/CSV presentation where applicable, accessibility and keyboard interaction SHALL work right-to-left. Directional affordances SHALL mirror only when semantically warranted; chess boards, logo and LTR data SHALL retain correct orientation.

#### Scenario: Hebrew coach records a mixed-language lesson
- **WHEN** a Hebrew teacher opens the group lesson editor on a phone and enters Hebrew student names with a Lichess URL, FEN and English SAN moves
- **THEN** navigation, action order, focus, text selection and controls SHALL be RTL without clipping, and chess notation/URL/identifiers SHALL remain legible left-to-right.
- **AND** saved source text SHALL not be transliterated or translated.

#### Scenario: A new RTL locale is registered
- **WHEN** maintainers add a future RTL language catalog and registry direction entry
- **THEN** the shared layout primitives SHALL apply RTL without introducing a new page-by-page Hebrew-specific layout branch.

### Requirement: Locale SHALL not override workplace/business semantics

The UI language SHALL be independent of workplace locale, IANA timezone, currency, and recorded student/lesson/source language. Localized display formatting SHALL not change canonical business timestamps, student identifiers, recorded content, payment amounts or historical evidence.

#### Scenario: English UI and Hebrew report locale
- **WHEN** an English-interface teacher selects an existing he workplace
- **THEN** the surrounding interface SHALL remain English while locale-dependent workplace output may use Hebrew, with dates interpreted in the workplace's actual timezone rather than the browser locale.

### Requirement: Translation quality and full-site coverage SHALL be testable

CI SHALL check catalog completeness and placeholders across en/he/ru. Browser tests SHALL cover authenticated and public pages, three-language interaction, desktop/mobile RTL, Unicode fonts, and accessible announcements. Ordinary new user-visible strings SHALL be added to message catalogs, not shipped as unreviewed English literals.

#### Scenario: Developer adds a new teacher settings field
- **WHEN** a new visible label/error/confirmation is introduced
- **THEN** the change SHALL supply translations for all three supported locales and CI SHALL fail when required messages or placeholders are missing.
