# ADR-0010 — Explicit family language for communications and Unicode invoice rendering

**Status:** Accepted as implementation contract on multilingual PR #86; deployment/release pending CI, E2E and owner sign-off.

## Context

Teachers can change their website interface among English, Hebrew and Russian, and
workplaces already have their own locale/timezone/currency. Neither setting is a
trustworthy indicator of which language a family's primary or secondary guardian
wants to receive. A teacher's browser-cookie value must never determine what a
recipient gets by email or in an invoice PDF. Existing PDF Helvetica encodes
WinAnsi only and drops Hebrew/Cyrillic names and notes.

## Decision

1. `guardians.preferred_locale` is nullable, constrained to `en`, `he`, `ru`.
   `NULL` falls back **deterministically to English**, not to the current UI
   language, not to an unverified workplace guess and not to the student name.
   Both guardian contacts of the same family use this family-level preference.
2. Keep teacher `preferred_locale` separate. Teacher-directed notifications
   use the teacher's validated language; teacher-viewed portal/website pages use
   their own viewer language cookie. Family communication setting changes
   do not send any email, generate invoices or rewrite saved teaching records.
3. The website and delegated MCP use the same family-create/update domain code,
   `preferredLocale` schema field and transaction-safe guardian-save RPC. The
   MCP can read locale without exposing email/phone/portal-token, and the family
   detail remains owner-only. Invalid locales fail closed at zod and SQL layers.
4. Event previews, email deliveries and reminder cron reads use the same
   localized recipient template selected from the family row at send time.
   The canonical teaching outbox uses this choice for lesson notes and
   cancellation messages while preserving teacher-approved note content.
5. Invoice PDF download and email attachment share one teacher/guardian
   scoped loader. Labels, date presentation and email text are selected by the
   family preference. Stored dates, payment amounts, item descriptions and
   status remain unchanged. The PDF embeds redistributable DejaVu Unicode
   fonts with the accompanying license notice, carries PDF language metadata,
   and draws Hebrew text right-to-left while separating BiDi runs from the
   Latin/Cyrillic text run to prevent reversal. Payment amounts retain their
   source currency and integer-cent calculations.
6. Legacy/installed databases get an **additive** migration SQL file under
   `docs/migrations/2026-11-17-family-communication-locale.sql`, not a reset.
   The canonical prelaunch schema is updated independently. No production SQL
   is applied automatically by this PR.
7. API, MCP schema names/codes/permissions, private record contents, consent,
   email provider idempotency and financial claim semantics remain canonical;
   no per-language MCP tool forks.

## Alternatives rejected

- Guess from teacher UI locale: one teacher may have multiple families whose
  communication needs differ.
- Guess from workplace locale: invoices can aggregate lessons from multiple
  workplaces and families may use a different language.
- Guess from names, emails or AI language detection: error-prone and intrusive.
- Translate or mutate saved student names/teacher notes: violates coaching
  evidence and financial record provenance.
- Helvetica transliteration/drop unknown glyphs: silently loses billable names
  and instructions.

## Verification and operational gates

- Test HTML `lang`/`dir`, Unicode PDF text rendering with actual generated PDFs,
  invalid-locale rejection, email preview parity, no contact disclosure and
  real site/MCP invoice PDFs.
- Ensure CI/Vercel/standalone build traces include the font files and license.
- Apply and back up database additively only at approved deployment; test on a
  representative existing-data clone before release.
- Full OpenSpec acceptance, live ChatGPT/Claude workflows and merge/archive
  are separate, still open gates. Do not merge or archive PR #86 by implication.
