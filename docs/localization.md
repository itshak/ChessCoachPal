# Localization and language contracts

ChessCoachPal supports English (`en`), Hebrew (`he`) and Russian (`ru`).
This product is **MCP/AI-assistant first**: the website and MCP share business
services, permissions and record schemas. A new language changes *presentation*,
never the meaning or identity of stored chess and teaching records.

## Language sources are intentionally independent

| Usage | Source and precedence | Does not change |
| --- | --- | --- |
| Teacher web UI and HTML metadata | Validated `teachers.preferred_locale`; otherwise `en` for an authenticated teacher. For guests, validated `ccp_locale` cookie, then browser `Accept-Language`, then `en` | Workplaces, notes, students, saved material |
| Anonymous family portal | Viewer `ccp_locale` cookie, `Accept-Language`, then `en` | Family mail language and teacher preference |
| Family recipient email and invoice PDF | Validated `guardians.preferred_locale` (`en`/`he`/`ru`), otherwise explicit fallback `en` | The teacher's web-language cookie and workplace timezone/currency |
| Teacher recipient alerts | Teacher `preferred_locale`, otherwise `en` | Guardian communications |
| Report human-visible JSON/CSV/TXT | Explicit `outputLocale` (`en`/`he`/`ru`), then the report's workplace locale when supported, then `en` | Stable business numbers, ISO dates and exported underlying data |
| Agent/tool calls | Stable English `ccp_*` names, OAuth scopes, JSON schema keys and machine error codes; caller can request language for human-readable outputs | The actual model user's message language overrides interface-language default when replying in prose |
| Source content | Stored student names, aliases, games, notes, FEN/PGN/SAN/UCI, links and external content remain verbatim | Teacher-reviewed evidence and history |

A parent's preferred contact language cannot be safely inferred from the
teacher's login language, workplace, chess site username, surname, IP or AI
classification. The family-level communication setting does not itself send
mail or trigger any billable operation. The same owner-scoped guardian service
is used by both website and delegated MCP, including optional `preferredLocale`.

## Writing translated UI

- Client components use `useTranslations("namespace")` from `next-intl`.
  Server components and request-scoped metadata use `getTranslations(...)`.
  Add the **same key** and ICU parameters to `i18n/messages/en.json`,
  `he.json` and `ru.json`; use ICU plural/select instead of concatenating
  English singular endings. Root HTML `lang` and `dir` come from
  `i18n/server.ts` / `i18n/locales.ts`.
- Prefer CSS logical properties (`ms`, `me`, `ps`, `pe`, `start`, `end`) instead of
  `left`/`right` for layout. Add `<bdi dir="auto">` around mixed-direction
  student names and input user content. Keep identifier inputs such as FEN,
  PGN, UCI, email, URLs, phone, access tokens, code and financial machine IDs
  visibly LTR, including in a Hebrew RTL page.
- Human-facing API failure text is **not necessarily translated**. Use
  `useLocalizedApiError()` with a **translated, action-specific fallback**;
  the formatter maps vetted stable error codes to reviewed UI strings without
  changing backend diagnostics. Only throw a `LocalizedUiError` when a string
  has already been validated and translated within the client itself. Never
  trust a JSON `error` string simply because it looks like a human sentence,
  and never translate or mask machine error codes returned through MCP.
- OAuth consent is a server-rendered HTML response from
  `app/oauth/authorize/route.ts`. Its language, permission explanation and
  failure copy are translated, but CSRF, PKCE, OAuth scopes, the exact redirect
  allowlist and registered client ID are immutable security contracts.

## Reports, email and PDFs

Report textual exports must preserve UTF-8 BOM for Excel, safe CSV quoting and
formula-injection prevention. Never localize machine field names or financial
cents inside canonical JSON responses. Event invite/reminder previews and
actual sends share recipient templates; changing language is never sufficient
consent to send a message. Teacher-approved note bodies remain verbatim even
inside a translated email wrapper.

Invoice PDFs embed redistributable DejaVu Unicode fonts from `assets/fonts`
(with their accompanying license). `pdf-lib`'s default Helvetica silently
loses Hebrew/Cyrillic glyphs; custom fontkit/BiDi run handling is necessary.
The PDF download and mail attachment use the same owner-scoped source loader.
Embed and trace font resources in Next standalone/serverless builds; do not
base64-embed fonts into client pages or expose signed family portal URLs via
public logs. Render and inspect actual mixed-script and RTL invoices, not just
parse `%PDF` bytes. The invoice date presentation can be localized; periods,
quantities, prices, paid balance and originals must not be mutated.

## CI and acceptance

Run `npm run i18n:check`, `npm run i18n:literal-audit`, `npm run typecheck`,
`npm run build`, `npm run mcp:parity:strict`, and targeted lint/unit tests.
CI runs Vitest and an authenticated Playwright suite using a synthetic OAuth
MCP client, testing real website↔MCP parity and mobile RTL. The JSX literal
audit is **incremental only**: it does not discover all TypeScript error
messages, HTTP error pages, generated emails/PDF, runtime placeholders,
assistive technology text or external provider content. Review those by hand.
No count of catalog keys proves 100% site coverage. Conduct screen-reader,
keyboard, zoom, narrow mobile, wide desktop, and native Hebrew/Russian copy
reviews before release.

Full release acceptance also requires testing actual ChatGPT and Claude clients
with live connections and confirming that tool responses **really persisted**
as intended, not merely that an LLM generated a plausible sentence. Use
private/synthetic data and authorized test accounts only. The prelaunch SQL
schema and additive migration are separate: never reset a real customer DB
while deploying language support. Complete backup + restore + existing-data
migration review and final licensing review first.

## Adding a future locale

1. Add its code, `name`, `dir` and valid Intl tag in `i18n/locales.ts`; add a
   complete reviewed ICU catalog and update the request fallback/negotiation.
2. Check root metadata, frontend controls, mixed-script fonts, mobile direction,
   OAuth consent, portal and every generated communication.
3. Evaluate locale validation for `teachers.preferred_locale`, nullable
   `guardians.preferred_locale`, all public API/MCP request validators,
   `outputLocale`, reports and historical data migrations. Preserve existing
   rows; use additive SQL with a documented rollback and backup.
4. Add deterministic website/MCP output parity E2E and genuine client proof;
   run the full release test matrix before claiming support. Do not introduce
   per-locale copies of MCP tools or alter existing status/error semantics.

See [ADR-0009](adr/0009-localization-mcp-presentation.md) and
[ADR-0010](adr/0010-family-communications-locale-and-unicode-pdf.md), and the
active `openspec/changes/2026-11-17-introduce-multilingual-support` checklist.
The OpenSpec change remains active and must not be archived before accepted
website, MCP, output, security, deployment and live-client evidence.
