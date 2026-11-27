> **2026-11-21 schema-ownership handoff:** All outstanding physical DDL, source schema/type/RLS changes and schema-generated regression tasks in this checklist are now tracked under the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/tasks.md)** (ADR-0019). Keep this proposal's functionality, UI, MCP and acceptance tasks open until independently verified. Historical SQL implementation instructions here are not independent migrations. Do not mark work complete solely because merged code exists.

# Tasks: introduce multilingual support (en, he, ru)

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


> **Deployment terminology (ADR-0018):** ChessCoachPal is operator-only SaaS; any "self-hosting" references here describe our infrastructure/CI, never customer-hosted product support. [Current policy](../../docs/adr/0018-operator-only-saas-and-tenant-scaling.md).

**v0.1.7 final-release candidate integrated with current main (2026-11-18).** The maintainer has explicitly authorized CI-gated merge to main, new annotated version tag and Coolify redeployment. Do not merge, tag or deploy unless the exact candidate CI, authenticated E2E, fresh schema, security, Compose and backup/restore gates pass. Mark only verified work complete; live ChatGPT/Claude tests and a manual screen-reader/legal review remain separately deferred (see docs/RELEASING.md), not falsely checked off.

## A. Establish the contract and framework
- [ ] A1. Inventory every visible English literal in teacher, guest/auth, legal, marketing, portal, emails, reports/CSV/PDF, PWA/offline, error states and accessibility text; map surfaces to translation namespaces.
- [x] A2. Pin a Next.js 16-compatible next-intl version, configure typed en/he/ru dictionaries, ICU plural/select, shared locale registry, fallback and namespace conventions; verify SSR/client setup without breaking proxy.ts auth.
- [x] A3. Implement unauthenticated language selector, validated locale cookie and Accept-Language fallback; keep existing URL paths and all API/MCP/OAuth/feed token routes unchanged.
- [ ] A4. Resolve authenticated teacher preference on the server on first paint and set root html lang/dir, localized metadata, accessible language labels and stable hydration; exercise sign-in/out and multi-tab transitions.
- [x] A5. Add CI checks for required keys/placeholders, forbidden missing translations and new user-facing hardcoded literals; document how to add a future locale.

## B. Persist settings with website and MCP parity (deliver together)
- [ ] B1. Add constrained teachers.preferred_locale with en default in canonical fresh-install schema; write/review additive deployment plan for databases with real data; backup and restore.
- [x] B2. Extend shared teacherProfileGet/teacherProfileUpdate, website profile PUT and AccountSettings with preferredLocale; expose native labels English / עברית / Русский and a recoverable global switch.
- [x] B3. Extend ccp_teacher_profile_get/update typed MCP schemas/dispatcher using the same domain code, confirmation and OAuth scopes; expose preferredLocale in ccp_teacher_context_get and website teacher context.
- [ ] B4. Update parity registry and add authenticated website↔MCP E2E proving change/reload/readback across device/session, read-only rejection, invalid locale, unauthorized user isolation, stable metadata and no secret exposure.
- [ ] B5. Verify workplace locale, currency and timezone remain independent from teacher UI setting; no rewriting of student names, notes or historic records.

## C. Entire website and full RTL
- [ ] C1. Translate main layout/nav, login/signup/reset/onboarding, dashboard, Account/studio, all global dialogs/toasts/errors/loading/empty states and help into en/he/ru.
- [ ] C2. Translate students/profiles/aliases, groups/workplaces, canonical lesson history/attendance, capture/review, schedule, training/materials/ratings/briefings and chess-specific vocabulary.
- [ ] C3. Translate reports, events, optional billing/finance, notifications, portal/guardian/family views, import/export workflows, PWA/install/offline, public/marketing pages and eligible legal UX after approved translations.
- [ ] C4. Replace LTR physical layout assumptions with logical properties across all components, including mobile nav, dropdowns, popovers, dialogs, tables, calendar, charts, transitions and keyboard focus.
- [ ] C5. Add Hebrew and Cyrillic font coverage, language-aware truncation/word wrap, mixed-direction content isolates and fixed-LTR chess/identifier fields (FEN, PGN, SAN, UCI, code, URLs, emails, phones).
- [ ] C6. Run high-zoom/mobile/desktop RTL interaction and accessibility review: full-site Hebrew dir=rtl, keyboard, screen readers, no clipping or untranslated fallback, Russian long-string stress.

## D. Locale-aware outputs, communications and AI
- [ ] D1. Replace hardcoded en-US/uncontrolled Date.toLocaleString() in UI and human-readable exports with centralized Intl formatting; retain IANA timezone and stable ISO/UTC machine contracts.
- [x] D2. Extend shared reporting domain and matching website/MCP request with optional outputLocale, deterministic locale precedence and translated JSON presentation/TXT/CSV labels without modifying stable machine fields.
- [x] D3. Preserve UTF-8 BOM, safe CSV escaping/formula injection protection, Unicode and Hebrew PDF embedding; test identical website/MCP exported bytes for the same resolved locale. Signed actual CSV/TXT downloads and private invoice PDF equality in EN/HE/RU passed in [#251](https://github.com/itshak/ChessCoachPal/pull/251), [exact E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45912511029).
- [x] D4. Localize event/reminder/email and portal messages using explicit recipient/workplace/portal language, including HTML lang/dir and plain text, without sending as a side effect of language selection.
- [ ] D5. Extend optional AI note-drafting to accept reviewed outputLocale while preserving evidence and explicit teacher approval; prevent inferred mastery/ratings or silent translation of persisted notes.
- [ ] D6. Audit historical spreadsheet import, Russian/Hebrew column headers and name alias normalization; retain exact matching and ambiguous-name fail-closed behavior.

## E. Multilingual MCP experience and safety
- [x] E1. Keep stable ccp_* tool names, input/output schema property names, error codes, scopes, ordered tools/list and single /mcp connection across locales; add a catalog invariance test.
- [x] E2. Provide concise locale-language guidance in existing MCP tool descriptions/initialization only where protocol/client support is proven; instructions prioritize explicit user message language over preferredLocale for prose.
- [ ] E3. Add or reuse localized displayMessage/userMessage for human-facing errors where useful, never replacing structured error code or technical diagnostic; apply outputLocale only to human-formatted output.
- [ ] E4. Test Hebrew/Russian conversational synthetic capture and readback, alias ambiguity, report requested in another language, one-group-lesson count and no accidental write/permission bypass.
- [ ] E5. Independently verify real ChatGPT and Claude multilingual workflows prepublication, documenting client limitations without treating model-only responses as persistence evidence.

## F. Verification, docs and archive
- [ ] F1. Update relevant applied specs, MCP parity inventory, onboarding guidance and developer translation instructions; record ADR for locale storage/routing/contract boundaries if necessary.
- [ ] F2. Run npm install/build/typecheck/lint/unit, translated catalog checker, fresh schema, strict MCP parity, authenticated E2E, accessibility/RTL tests, security checks, self-host Compose and backup/restore on PR head; correct all failures.
- [ ] F3. Merge verified implementation slices into main; re-run exact merged-main gates and record links, unsupported cases and real-client acceptance status.
- [ ] F4. Archive this change and update openspec/specs only after full en/he/ru website and scoped MCP localization acceptance; no premature complete status or silent production reset.
