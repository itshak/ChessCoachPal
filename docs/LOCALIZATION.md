# Internationalization (work in progress)

ChessCoachPal is moving to an English (en), Hebrew (he) and Russian (ru) interface. This document covers the implemented infrastructure; the complete application-wide translation and RTL audit remain an open OpenSpec change.

## Framework
- Next.js App Router + pinned `next-intl` with request configuration at `i18n/request.ts`, no locale-prefixed routes, preserving existing `proxy.ts` Supabase session/auth handling.
- `i18n/locales.ts` declares the supported locales and direction. A future language requires a registry entry and a catalog, font inspection, translations for all user-facing routes, and E2E. RTL is metadata, not a Hebrew-only business rule.
- `i18n/messages/en.json`, `he.json` and `ru.json` contain ICU-ready translated messages. The CI command `npm run i18n:check` checks key/placeholder parity, but does **not** guarantee translation quality or full website string coverage. The TypeScript CI pre-step also runs the incremental English UI literal audit. This TypeScript AST inventory detects new hardcoded JSX text, labels, placeholders, alt/ARIA labels and inline JSX string expressions against scripts/i18n-hardcoded-baseline.json. Baseline entries are translation debt, not proof of compliance. Review all additions before updating the baseline. The inventory does not yet cover server email bodies, all programmatic toast strings or PDF exports.
- `i18n/server.ts` resolves logged-in teachers via `teachers.preferred_locale`, else an anonymous locale cookie, then the browser Accept-Language header, then English. Language changes use a server response plus full reload to update root `html lang/dir` on initial paint.
- Authenticated teacher preference is the same owner-scoped profile field in website and MCP; `ccp_teacher_profile_get/update` and `ccp_teacher_context_get` expose it while keeping tool IDs and JSON keys stable.

## Install and rollout
The canonical fresh-install SQL includes the teacher's preferred_locale (en/he/ru, default en). Before using a database with existing real records, operators must take and verify a recoverable backup, and *review* `docs/migrations/2026-11-17-preferred-locale.sql` as an **additive** rollout. Git merges, frontend deployments, npm install or releases **do not apply this SQL**. Never reset a live database or erase records to install translations. A missing preferred_locale column will make authenticated profile preferences unavailable until the rollout.

## Data integrity
Teacher interface language is independent of workplace locale, currency, timezone, recipient language and the original content of records. Student names, multilingual aliases, notes, FEN/PGN, chess moves, URLs, usernames, calendar identifiers and canonical JSON fields remain verbatim. The model's instruction language has conversational precedence over the profile default. Sensitive writes continue to require explicit confirmation.

## RTL
Hebrew sets root `dir=rtl` and loads Hebrew-capable fonts. Use logical Tailwind/CSS styles (start/end, ps/pe, ms/me) and mixed-direction isolation for chess notation. RTL testing must cover all components, responsive layouts, calendars, popovers, tables, icons, visual overflow, keyboard focus and accessibility before claiming full RTL support. Setting the root direction alone is insufficient.

## Verification
Check `npm run i18n:check`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run mcp:parity:strict`, authenticated Playwright E2E and full CI. The new language-parity Playwright spec is `e2e/parity-teacher-locale.spec.ts`. Read `openspec/changes/2026-11-17-introduce-multilingual-support/IMPLEMENTATION_PROGRESS.md` for actual current coverage, required regression gates and outstanding work.


## Report language and MCP consistency

The teacher's UI language controls website navigation and the report panel direction. It does **not** depend on the selected workplace locale. A generated report has a separate language choice: explicit validated outputLocale (en/he/ru), else the workplace's supported locale base, else English. JSON returns the stable owner-scoped numeric report and original report.locale alongside an additional localized presentation with language, direction, human-readable labels, numbers, date-only period and timezone. No student names or private lesson notes are included in this aggregate.

Both GET /api/coaching/report and ccp_reports_workplace_summary pass outputLocale into the same shared service. MCP CSV and TXT exports use exactly the same locale formatter as the browser's Download buttons. Raw ISO report date filters, IANA timezone and numeric calculations remain unchanged. CSV retains UTF-8 BOM, escaped quoted cells and formula-injection protection. A teacher can request a Russian report from a Hebrew-language workplace without changing their personal interface or any persisted record. Tests: lib/coaching-report.test.ts, e2e/parity-reports.spec.ts, e2e/parity-rtl-report-ui.spec.ts.

Note for browser tests: Next.js/next-intl embeds the message catalog in streamed React Server Component payloads. Searching raw HTML for strings like "No invoices yet." is not a valid visibility/privacy test; inspect rendered DOM roles/text instead. See e2e/parity-billing-lifecycle.spec.ts. This does not change the portal's server-side invoice filtering by delivery status.
