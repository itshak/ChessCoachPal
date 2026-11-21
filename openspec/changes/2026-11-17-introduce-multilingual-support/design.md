> **2026-11-21 schema-ownership handoff:** All anticipated physical persistence in this design is owned by the **single [consolidated schema P0](../2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** under ADR-0019. This design remains a downstream feature contract. Superseded old freeze references below are historical; no independently staged feature DDL or live database change is authorized.

# Design: extensible internationalization, complete RTL and language-aware MCP

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


> **Deployment terminology (ADR-0018):** ChessCoachPal is operator-only SaaS; any "self-hosting" references here describe our infrastructure/CI, never customer-hosted product support. [Current policy](../../docs/adr/0018-operator-only-saas-and-tenant-scaling.md).

**Decision status:** Proposed implementation plan, not accepted implementation evidence.

## 1. Language/locale domain model

Supported first-class interface locales: en, he, ru. Canonical UI preference is the language tag en/he/ru (future language-region tags can be introduced by a reviewed locale registry). Define a single shared locale registry mapping tag to native name, message catalog, Intl formatting locale, text direction (ltr/rtl), optional font subset and future fallback. Do not implement RTL as locale === he scattered through components. Invalid/unsupported UI choices fail validation; unknown browser Accept-Language values fall back safely to en. Never allow arbitrary locale strings to become translation module paths.

Persist teachers.preferred_locale with constrained values and a default en, owned under existing teacher RLS; additively roll out to any actual beta DB with backup and restoration evidence. Pre-v1 canonical fresh schema also gets the field. Use preferredLocale at the domain/API layer, not a client-only localStorage setting. Existing teachers default to en without overwriting workplace locale or stored content.

**Distinct concerns:**
- Teacher preferredLocale controls authenticated website chrome and default human-facing output, **not** stored student data.
- Workplaces already have locale (a BCP-47-like string), timezone and currency. This locale is retained as an independent output/communication preference, never implicitly synchronized with teacher UI language. Normalize supported base-language choices for translation lookup; preserve original workplace tag. An explicit request outputLocale wins for that output, then workplace locale when applicable, then teacher preference, then en.
- Anonymous / login / marketing / guest portal language uses an explicitly selected language cookie, then browser Accept-Language, then en. An authenticated user preference overrides the anonymous cookie; after a confirmed authenticated change update the cookie so SSR sees the new choice immediately. Guardian portal selection is browser-specific and must not alter the teacher profile.
- User-owned content language is preserved verbatim. No implicit translation of names, aliases, notes, teaching evidence, study titles or provider-provided PGN/FEN.

## 2. Library, integration and route strategy

Use **next-intl** with the Next.js App Router: typed message namespaces (common, navigation, auth, account, dashboard, students, lessons, calendar, materials, reports, finance, events, portal, emails, errors, accessibility, metadata); en/he/ru message files; request-scoped locale, server and client translation functions, ICU placeholders for counts/plurals, shared Intl date/number formatting and controlled fallback. Use a build-time/CI check for missing/unused keys, missing interpolation variables, untranslated human-facing strings and ICU syntax; code owners review translations with native speakers.

**Keep existing public routes stable**: no required /en, /he or /ru prefixes for teacher, OAuth, MCP, API, portal, token, calendar feed, notification or PWA paths. next-intl supports locale resolution without locale-prefixed routing. Preserve current proxy.ts Supabase auth/session responsibilities; do not replace it with an i18n middleware that swallows OAuth routes. Resolve UI locale server-side via cookie + authenticated profile on the appropriate layout; no flash of LTR English before Hebrew hydration. Auth state transitions and multiple browser tabs must not cause stale locale/hydration mismatch. Public marketing SEO localized path strategy may be a later separate decision; full visible text in supported locale is in scope now.

Localize existing Next.js metadata titles/descriptions, accessibility labels and document lang/dir. Ensure offline pages, PWA install guidance, error boundaries, legal page presentation (with approved legal text only), password reset and login are covered. Legal documents require separately reviewed translations, not unverified machine-generated legal promises.

## 3. Full RTL, accessibility and fonts

Use HTML root lang and dir from the resolved interface locale. Use CSS logical properties and Tailwind start/end/ps/pe/ms/me; audit all hardcoded left/right alignment, padding/margins, border radii, floating menus, popovers, drawers, progress steps, tables, sticky columns, carousel/calendars, input icons, theme switch, charts, keyboard focus, responsive navbar, drag/swipe gestures and animations. Mirror only directional icons that convey navigation; do not mirror logos, chess boards, material visuals or numeric symbols.

Mixed Hebrew/Russian/English content uses bdi/dir=auto or equivalent scoped isolation; explicitly render URLs, email, phone, handles, identifiers, ISO dates, PGN, FEN, SAN/UCI and code LTR when semantically correct. Use Intl.Segmenter as applicable for truncation/search and evaluate caret behavior/selection in rich-text editors. Preserve the secure sanitized HTML rendering boundary.

Audit actual font coverage: currently Inter/Nunito load Latin subsets. Add appropriate Cyrillic and Hebrew-capable font subsets/fallbacks through next/font with no runtime external fetch. Test width, line wrapping, long Russian phrases and Hebrew diacritics, high zoom, screen-reader language, tooltips and mobile viewports. RTL acceptance is **whole-site**, not merely a report section's dir attribute.

## 4. Preference setting and shared domain contract

Extend teacherProfileGet / teacherProfileUpdate and the existing Account settings form and PUT /api/auth/update-profile with preferredLocale. Extend existing ccp_teacher_profile_get/update schema and dispatcher with the same validated field and confirmed MCP change semantics; do not introduce a parallel language-only settings database or an untracked website field. Include preferredLocale in teacherContextGet, GET /api/teacher/context and ccp_teacher_context_get for model context. Enforce valid enum, teacher RLS, coach:read for reads, coach:write and confirmed=true for updates, no credential leakage. Ensure stored preference survives reauthentication, refresh and device switches.

Show **Interface language** in Account with the three native-language choices: English, עברית, Русский. Provide language control on login/onboarding and, where appropriate, a compact global shortcut accessible in all locales. Save immediately only after server confirmation; toast can be localized using the selected language. Accessible keyboard navigation and translations of language names are required. There must be a recovery path from an accidentally selected language.

If a future new language is added, its catalog, locale registry entry, font/direction configuration and tests should be sufficient without editing every business page.

## 5. Output localization and determinism

Business truth is locale-neutral: UTC instants, ISO dates, stable IDs/status/field names, IANA timezone and currency codes are unchanged. UI only formats them using resolved locale and actual workplace or teacher zone. Audit raw Date.toLocaleString(), DateTimeFormat("en-US"), currency formatting and hardcoded English report text across all pages/components and messages.

For reports/exports, add **optional outputLocale** to shared report domain/website request and matching MCP tool where output is human-facing; JSON machine fields and canonical values remain stable. The default for workplace-specific reports follows explicit workplace locale when supported. Human-readable CSV/TXT headings and PDF text may use translated strings; keep CSV data deterministic, UTF-8 BOM where needed and formula-injection protection, equivalent browser/MCP bytes for the same exact request and locale. If downstream consumers require stable CSV schema, provide an explicitly versioned machine-readable export mode with stable English field identifiers rather than silently localizing machine contracts.

Translate notification and email templates, parent/guardian portal labels and document labels according to explicitly chosen recipient/portal/workplace language as available, otherwise en. Do not use teacher's UI locale to guess a parent's preferred language. Do not automatically send translated content or expose minors' data without the existing confirmation/authorization rules. Maintain correct MIME charset, HTML lang/dir, plain text, and Unicode PDF font embedding where necessary. AI-drafted progress notes receive explicit requested outputLocale and fact-only guardrails; teacher must review before saving and may choose a different output language without editing original evidence.

## 6. MCP: evaluation and selected minimal extension

**Assessment:** Yes, limited multilingual awareness in MCP is valuable; a complete separate localized tool registry is **not** warranted. Models can understand instructions in Russian/Hebrew while the ccp_* machine interface remains English. Stable tool names, JSON schema field identifiers, error/status codes, scopes, date/time formats and order are crucial for reliable clients and existing parity checks. Per-connection dynamic translated tools/list may harm model/tool caching and should not be introduced without proven benefit. MCP protocol tool metadata is model-facing; localizing it is optional, not a prerequisite for multilingual teacher conversations.

Keep single /mcp endpoint and static language-neutral machine contract. Add preference to ccp_teacher_profile_get and ccp_teacher_context_get responses, and allow change via ccp_teacher_profile_update with explicit approval. Concisely state in server instructions/tool descriptions (where supported and tested): use the teacher's explicit current message language first, otherwise preferredLocale for conversational summaries; faithfully preserve quoted names and notes; do not translate canonical IDs/chess notation. Instructions are hints, never authorization or evidence, and must not claim the model will always obey them.

Localize **only human-readable** text from MCP operations when useful (formatted report TXT, userMessage/displayMessage or rendered note drafts) through the same application translation formatter. Preserve stable machine code and canonical fields, and use explicit outputLocale override when the user asks for a report in another language. When server/AI client cannot be guaranteed to set language, prefer deterministic structured data and allow the model to compose the user-facing answer in the teacher's language. Do not automatically translate stored notes or enrich facts. Fix lexical exact alias resolution only if tests demonstrate specific Unicode bugs; no silent transliteration or fuzzy identity guesses.

MCP server currently identifies protocol 2025-06-18; do not opportunistically change protocol/transport during this change. Check compatibility against actual connected clients. MCP synthetic tests must prove Russian and Hebrew commands reach the same tools, structured data, authorization, revisions and receipts; real ChatGPT and Claude tests are supplementary and required before claiming reliable client UX.

## 7. Implementation touchpoints and migration

Primary files to inspect/edit: app/layout.tsx, app/(teacher)/layout.tsx, app/globals.css, components/teacher/TeacherNav.tsx, components/teacher/AccountSettings.tsx, app/login/page.tsx and components/auth/LoginForm.tsx, proxy.ts, next.config.ts, all pages/client components and text-producing lib/server services; app/portal; app/manifest.ts; lib/ai/provider.ts; lib/coaching-report.ts; components/teacher/CoachingReportPanel.tsx; lib/server/teacher-profile-service.ts, teacher-context.ts and agent-tools.ts; app/api/auth/update-profile/route.ts and app/api/teacher/context/route.ts; supabase/migrations canonical schema, scripts/mcp-website-parity.json, docs/AI_CONNECTORS.md, and all relevant tests.

Update migration source-of-truth and non-destructive rollout notes; no automatic reset on a database with actual data. Use translated UI resources shared by browser/server rather than duplicating translations for web and MCP. Never include personal teacher data in translation catalogs or CI fixtures.

## 8. Test design and release criteria

- Locale resolution precedence (authenticated preference, cookie, browser preference, fallback), malformed locale rejection and persistence; SSR root lang/dir and hydration.
- Translation catalog completeness/placeholder consistency in en/he/ru, no hardcoded English under full-site language sweeps, translated accessibility labels and keyboard operation.
- E2E page coverage in 3 locales: dashboard, students/aliases, lessons/group attendance/preview, learning materials, calendar/DST, reports, account, onboarding, authentication, portal, billing, error/empty/loading states and mobile nav.
- RTL screenshot/DOM/layout/interaction regression in Hebrew at mobile+desktop: table, chart, calendar, dialogs, menus, form caret, mixed-language FEN/PGN and screen reader. Long Russian text no clipping.
- Locale-safe date, number, timezone, currency and ISO contract tests, PDF/CSV export/font/Unicode and formula-injection tests, same browser↔MCP export bytes and unchanged machine JSON across locales.
- Shared website/MCP read/write of preferredLocale, read-only/OAuth/foreign-tenant rejection, malformed values, no credential exposure, confirmation and stable tool list names/keys.
- Natural-language acceptance fixtures in he and ru for student alias resolution, single group teaching duration, reports, notes, correction and explicit other-language override. User prompt language wins for prose; no unapproved writes or invented translations/ratings.
- Existing CI gates: lint, TypeScript, unit, strict MCP parity, authenticated Playwright, security, fresh-install schema, self-host Compose and backup/restore at the exact merged-main commit; separately document real client tests. No completed checkboxes without evidence.

## 9. Research basis

Source audit in main (2026-11-17). Framework design uses official next-intl routing/request localization guidance and Next.js App Router internationalization guidance; MCP decision considers the model-facing tool name/schema requirements and deterministic tools/list guidance in the current public MCP specification. Framework/version compatibility and current runtime behavior MUST be revalidated by implementation tests rather than assumed by the proposal.
