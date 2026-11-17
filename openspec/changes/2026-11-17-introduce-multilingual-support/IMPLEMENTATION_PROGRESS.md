# Implementation progress — 2026-11-17

**OpenSpec status: IN PROGRESS. Not yet applied or archived.** This change is being implemented on branch `openspec/2026-11-17-multilingual-en-he-ru` in PR #86.

## Implemented locally in this slice
- Added pinned Next.js 16-compatible `next-intl` framework, locale registry and request-scoped catalogs for en/he/ru, browser/cookie/teacher preference resolution, SSR `html lang/dir`, Hebrew/Cyrillic fonts and an accessible three-language control on public/login/account/navigation surfaces.
- Added additive teacher profile language field to canonical SQL and a **review-only non-destructive migration** for existing databases; no database reset/deployment/application of SQL has occurred.
- Extended the existing shared website/MCP profile and context to read, validate and update preferredLocale without altering MCP tool names, business schemas, authorization, other data or user-owned content.
- Added shared human-readable report CSV/TXT localization with a workplace-language default and optional MCP outputLocale, keeping stable report JSON, timezone calculations, UTF-8 BOM and CSV escaping. Added report UI locale selector and translated key report strings.
- Translated the public landing page, navigation, core dashboard, main account/login controls, report page/header and some student/schedule sections. Translation catalogs include reusable keys for future surfaces.
- Added catalog key/placeholder CI guard and new Playwright browser/MCP language parity tests; extended unit expectations for report localization. Updated strict parity route inventory for the anonymous locale cookie endpoint.

## Automated checks on the isolated checkout
- `npm run typecheck` passed on the intermediate implementation; recheck exact commit.
- `npm run lint` passed on the intermediate implementation; recheck exact commit.
- `npm run build` passed on the intermediate implementation; recheck exact commit.
- `npm run mcp:parity:strict` passed on current inventory; this structural test **does not** certify the new cross-client behavior.
- `npm run i18n:check` passed with equal en/he/ru keys and placeholders.
- Local `npm test` crashed with an **Illegal instruction** in the remote device runtime; GitHub Actions unit suite and E2E must determine actual acceptance. Authenticated E2E has not yet been executed locally.

## Outstanding blockers — do not mark applied
- **Full translation coverage is not done.** Many teacher screens/components, billing, advanced lessons/calendar, contact/guardian portal, emails, error states, legal notices, embedded prompts and PDFs still contain English literals.
- Full RTL adaptation, logical layout audit, chart/calendar/menu/drawer keyboard and mobile/browser screenshot/accessibility verification are not done. Full RTL is a release blocker under this OpenSpec.
- Proper multilingual customer communications, AI drafts, all PDF font/RTL rendering, stable export contracts and more natural-language MCP tests remain open.
- Exact-head CI, authenticated database E2E, security/Compose/restore checks, deployment-safe reviewed migration and live ChatGPT/Claude acceptance remain open.
- No runtime source changes have been merged into main, no live database altered, no deployment and no OpenSpec archive. Mark the change complete **only** after every requirement and every test gate is evidenced.

## Future checkpoints
1. Finish every remaining page/component and supported generated output, with reviewed Hebrew and Russian copy.
2. Audit RTL and mixed-direction behaviors at desktop/mobile and add visual/accessibility regression coverage.
3. Run all CI/E2E, update tasks and applied specs only when verified; use an additive migration for real beta data.


## Subsequent corrections and UI expansion
- GitHub Actions initially rejected an npm lockfile with a missing floating-ui optional dependency; regenerated and verified lockfile with the runner's npm 11.19.1 and pushed correction.
- First GitHub CI, security history audit, self-host Compose and backup/restore passed on 019ea7b. The first authenticated E2E at that SHA found three failures: two English-heading assertions for deliberately localized Hebrew CSV, and a teacher preference update permission error.
- Identified the RLS-safe **column-level UPDATE privilege** omission in canonical teacher-table GRANT after a security REVOKE; added preferred_locale to the explicit allowed-column list and to the non-destructive existing-database SQL. Did NOT grant table-wide UPDATE.
- Updated corresponding Hebrew CSV E2E expectations to assert translated labels, preserving aggregate content and formula-injection guarantees.
- Added another 100+ curated translated keys to the teacher coaching workspace, student creation and chess profile editor; additional visible screen labels now render in Hebrew and Russian. These do not yet amount to full website translation.
- Repeat all checks and authenticated E2E on new exact-head CI after the fix; prior green workflows are not proof for later changes.

## Continued UI migration and automated debt guard — November 17
- All five workflow groups, including the full authenticated E2E, passed on commit 3fb6a96. This is **checkpoint evidence**, not proof of later commits.
- Added reviewed en/he/ru labels across the full weekly teaching-calendar board including day headers, mobile buttons, attendance controls, private lesson scheduling, rescheduling, cancellation, safe confirmation dialogs, and note-sharing controls. Kept canonical attendance enums stable and did not translate saved lesson text.
- Translated the teacher Help section and public PWA offline page, including SSR title and functional links.
- The language E2E spec now verifies Hebrew/Russian schedule headings and Hebrew mobile 390px RTL horizontal-overflow, and keyboard focus of the language switcher. These additional tests require exact-head CI confirmation.
- Added a TypeScript AST-based UI-text inventory and incremental regression guard, included in the standard typecheck pre-step. Baseline tracks approximately 1,330 remaining English labels across about 100 TSX files: these are **untranslated debt**, not acceptable final coverage. The audit does not yet include all server-generated emails or PDF content.
- Local latest code: TypeScript, optimized Next.js build, touched-file ESLint, catalog parity and strict MCP structural parity pass. Exact-head GitHub authenticated E2E, PDF/email localization and site-wide responsive RTL remain open.


## Guest family portal and policy localization checkpoint
- Full authenticated E2E, CI, security audit, self-host Compose and backup/restore all succeeded on previous commit fc60162. See the GitHub Actions runs for this SHA; no claim for later heads until they are checked.
- Added en/he/ru translations to portal teacher notes/lesson cards/events, cancellations, RSVPs, prepaid packages, invoices, payment instructions, policy summary and policy-update notice.
- Retained authenticated/anonymous session and token permissions, stable status enums, original chess notes and sensitive account/payment values, recipient notification opt-ins and formula-safe reporting.
- Added a family-portal language selector (anonymous cookie only) and Playwright RTL mobile and English/Hebrew/Russian guest portal layout checks.
- Event and portal display dates honor UI language and workplace timezone, while canonical event dates, calendar fields, invoice calculations and existing English email format remain unchanged.
- Catalog-checker fixed to compare unique ICU interpolation parameters because valid Russian plural rules repeat the same parameter in several branches; new ICU runtime tests added.
- Local TypeScript, optimized Next.js build, ESLint of touched components, catalog and strict website/MCP parity checks pass. Remaining translated-content/RTL audit, PDF and emails, per-recipient language and full-site completeness remain unverified and OpenSpec stays active.


## Recurring teaching slots and make-up settings
- Localized weekly slot creation/updates/removal, edit forms, date/day and currency-input labels, confirmation text and notices, and cross-workplace timezone-safe weekdays through Intl.
- Localized historical make-up credit booking and teacher cancellation/make-up policy settings without changing attendance, policy flags, credit redemption, idempotency or save payloads.
- Added Hebrew/Russian E2E assertions for the schedule's recurring lessons and make-up credits headings. Extended the change's locale catalogs to more than 700 complete en/he/ru key pairs; the JSX English debt audit is still above 1,100.
- Full acceptance requires exact-head GitHub CI, integration tests with seeded Supabase and visual/manual RTL inspection. Untranslated advanced training, billing, settings, communications, PDFs and legal screens remain open.


## ICU test execution audit
- Discovered the existing Vitest test glob included only lib/**/*.test.ts, so previously added i18n/locales.test.ts and i18n/messages.test.ts compiled but were **not executed** in CI unit tests. Expanded vitest.config.ts include to i18n/**/*.test.ts so actual en/he/ru ICU formatting, pluralization and mixed-language student name assertions are run by standard npm test in GitHub CI. Local remote Vitest binary still crashes with Illegal instruction, so rely on GitHub unit result for acceptance.


## CI source guard correction
- GitHub CI on 90457b3 detected a prohibited legacy financial-field token in the localization-only key makeupFor in CanonicalMakeupPanel; no legacy physical tables or runtime dependencies were introduced. Renamed the UI key to makeupLessonFor across all three catalogs and its UI usage. Reran schema:attendance:strict locally: 0 legacy references and exit 0; TypeScript/catalog/literal checks pass.
- Exact-head CI and E2E are required after this correction. The active OpenSpec is not complete or archived.


## Shared multilingual reports and latest E2E regression
- On prior pushed SHA 52f1a3a, main CI including the ICU Vitest tests, security history audit, self-host Compose and backup/restore all passed. Authenticated Playwright reported one failure in the invoice delivery privacy test: it searched full raw streamed HTML for the translation-catalog string No invoices yet., which remains serialized in Next.js RSC payloads even when a paid invoice is visibly rendered. This is a test false positive, not a surfaced invoice permission leak.
- Reworked the invoice test to check the actual DOM both before and after deliberate delivery, with explicit visible invoice period and Paid status. Only delivered invoices should render in the portal. Exact-head E2E re-verification is required.
- Extended owner-scoped report service with optional outputLocale and additive human-language presentation (labelled counts, attendance, locale, direction and locale-aware date-only period). Retained all numeric report fields, workplace locale, IANA timezone, CSV BOM/escaping/formula safety and private record exclusions. Website and MCP call the same formatter; explicit locale wins over workplace default. Teacher website chrome direction remains independent of report output direction.
- Added en/he/ru source unit expectations, and browser/delegated-MCP E2E comparing JSON fields, unchanged business numbers, CSV and TXT bytes across three locales and rejecting unsupported locale. Recorded design in ADR-0009 and extended active parity checklist/registry. These changes are implemented locally, not yet CI-accepted.


### Verification at this local report slice
- Passed: npm run typecheck (712 locale keys each; zero new hardcoded literals), npm run build, npm run mcp:parity:strict (93/93 historical scenarios), npm run schema:attendance:strict, ESLint on touched report, API, MCP and Playwright sources (zero errors, two inherited warnings in agent-tools).
- A full repository npm run lint currently fails with 26 existing errors in untouched legacy E2E helper/spec files and two old public/app components/teacher-events-service.ts (chiefly no-explicit-any, two unescaped JSX apostrophes); that full-repo debt is not fixed by this scoped locale PR. GitHub CI runs a narrower lint gate. Full lint F2 acceptance remains open and must not be claimed green.
- Local Vitest binary still crashes with Illegal instruction on the remote device; rely on GitHub CI unit tests and exact-head authenticated E2E after push. This report slice, billing DOM test, and ADR require new CI evidence.


## Public recovery, hosting and framework error surfaces
- Continued EN/HE/RU reviewed messages for self-hosting options, Try ChessCoachPal, password reset invalid-link/error prompts and form labels, 404 not found, client error boundary and the root loading state.
- The emergency global-error boundary intentionally cannot depend on NextIntlClientProvider, which may have failed. It uses a hydration-safe English server snapshot and reads the validated anonymous locale cookie or browser locale on the client, then sets its own html lang/dir. Its existing user-controlled reset button still works, with no added secrets or side effects.
- Added 390px English, Hebrew and Russian Playwright coverage for try/hosting/recovery/unknown routes, plus visible-language and root-direction assertions. All UI values remain viewer preferences; no teacher/workplace/student data is modified by switching language.
- Local TypeScript, optimized Next build, touched-file ESLint, catalog parity and no-new-English-literal audit pass. Catalogs now have 747 keys per language, but approximately 1,105 English JSX literals still require reviewed translations. Full RTL and output emails/PDFs remain open. Exact-head authenticated E2E for this new slice is not yet verified.


## Student profile and rating history expansion
- Added fully reviewed en/he/ru student detail headings, family breadcrumbs, attendance display labels, and client-side chess rating observation controls. Explicit external provider consent, immutable manual rating record and preview/commit flow remain unaltered; source enums and stored rating values continue in canonical English machine fields. Public account usernames and user-entered chess profile text are never translated.
- Added locale-aware human dates to chess rating snapshots, birthday and practice-start displays, while preserving raw YYYY-MM-DD values, year-only practice-start sentinels, level text, fee integer cents and student API updates. Added mixed-direction isolation where arbitrary human names appear.
- Added Hebrew/Russian authenticated teacher browser assertions for student profile, rating observations and practice-start labels, plus executable i18n unit expectations for Russian game plurals, Hebrew years and mixed-language usernames. Local typecheck, optimized Next.js build, touched-file ESLint, 93/93 strict parity, and zero-legacy attendance audit passed before this progress update.
- GitHub E2E on earlier 76c5d7f found one stale English metric assertion in e2e/coaching-report.spec.ts for a Hebrew-workplace report. Corrected this test to assert Hebrew metric text and independent English chrome/Hebrew output direction. Exact-head authenticated browser/MCP CI is still required. All remaining untranslated advanced coaching/billing/material UI, PDF/email outputs, full RTL and release-readiness tasks remain open.


## Chess training, material history and teacher-approved lesson capture — November 17 continuation
- Localized the full chess-learning panel, including editable skill categories, reviewed observations, AI-proposed versus teacher-approved evidence, exact student/material selection, material links and safe unlink confirmation. Student names, observation text, stored fields and MCP tool/action identifiers are never translated.
- Localized the typed material catalog (PGN games, FEN puzzles, drills, chapters, HTTPS links), source relationships, archive impact and restore/edit notices. Preserved canonical material kinds, revisions, source references and financial/teaching evidence; kept PGN, FEN, chess result strings, study IDs and source URLs left-to-right in Hebrew UI.
- Localized the immutable teaching-evidence history, per-workplace Lichess default studies, group selection, whole-history counts, stage labels and teacher confirmation dialogs. Stage enums and history/audit write semantics remain unchanged.
- Localized multi-student lesson capture, exact aliases, timezone inference, preview and pending chapter review, and **separate explicit approvals** for lesson creation versus an atomic lesson+chapter assignment. Kept idempotency signatures, actual write API payloads, no-auto-attendance and no-auto-mastery policies.
- Added two-locale authenticated browser E2E for the training/materials library and coaching capture, including 390px direction/overflow; extended student profile integration tests and ICU approval text tests. Tests not yet verified by GitHub against this exact source head.
- Local verification before this commit: 1,130 en/he/ru message keys with matched placeholders; UI English literal debt 832 strings in 82 files; TypeScript, optimized Next build, touched-file lint, strict historical website/MCP parity (93/93), zero-legacy schema audit all passed. Full coverage, emails/PDF Unicode, advanced training tools, entire-website RTL, real-client acceptance and release migration remain open.


## Homework assignments and coach-reviewed training plans
- Implemented reviewed English, Hebrew and Russian presentation for homework assignment creation, due dates, attempt outcomes, evidence notes and separate coach review feedback. The saved material kind, in_progress/submitted/completed, reviewed/needs_work machine enums and request confirmation semantics remain unchanged. Student-generated instructions/feedback are never rewritten or translated.
- Implemented teacher-authored training plan and goal presentation, status selectors, archive view and correction/audit history, including locale-aware revision timestamps. Actual plan status, goal status, expected revision, audit history, target date and explicit coach evidence remain canonical values. Homework completion still never automatically proves mastery.
- Added locale-specific authenticated browser headings for Homework and training follow-up and Training plans and goals, plus ICU counts for Russian goal plurals and Hebrew homework/coach review notices. 1,225 keys per supported locale, compared to 1,130 before this slice. Incremental JSX debt remains ~770 English literals across 80 files, not complete coverage.
- Follow-up exact-head GitHub CI and seeded E2E remain required before acceptance; this tranche is on the active OpenSpec only. No production database, public-site deployment, release, OpenSpec archive or merge to main.
