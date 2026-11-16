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
