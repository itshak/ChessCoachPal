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
