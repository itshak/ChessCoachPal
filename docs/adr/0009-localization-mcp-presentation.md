# ADR-0009: Locale precedence, bidirectional UI and MCP presentation boundaries

- **Status:** Accepted — design contract; translation rollout remains incomplete
- **Date:** 2026-11-17
- **Scope:** Teacher interface, guest portal, locale-aware reports, generated human text and MCP presentation
- **Related:** [ADR-0003](0003-mcp-website-business-parity.md), [ADR-0007](0007-mcp-supabase-contract-and-release-evidence.md), [active multilingual OpenSpec](../../openspec/changes/2026-11-17-introduce-multilingual-support/tasks.md)

## Context

ChessCoachPal's MCP-first interface serves teachers who may teach in Hebrew or Russian, work with English technical chess notation, and share records with multilingual families. A workplace locale is not the teacher's personal UI preference. Previously, the website's report panel set its direction from the selected workplace locale and displayed English text inside RTL layouts. A model-only change to MCP descriptions is not evidence of translated website content or persisted data.

## Decision

1. **One UI language per viewer.** The teacher's validated `teachers.preferred_locale` (`en`, `he`, `ru`) governs authenticated website chrome and server-rendered root `lang`/`dir`; unauthenticated viewers use a validated cookie, then weighted `Accept-Language`, then English. A guest portal viewer can switch language without changing the teacher's profile, workplace or stored family records.
2. **Workplace settings remain independent.** Workplace `locale`, IANA timezone and currency retain their respective meanings. Switching the interface never mutates them, student names/aliases, lesson notes, FEN/PGN/SAN/UCI, financial amounts or history. Human dates are formatted with explicit locale and relevant IANA timezone; JSON dates and persisted timestamps remain canonical.
3. **Report output-language precedence.** Explicitly validated `outputLocale` wins; otherwise use the supported base language of the selected workplace locale, then English. The same teacher-scoped service computes the browser and `ccp_reports_workplace_summary` responses. The existing numeric `report` keys and `report.locale` continue to represent canonical business data. A separate `presentation` object supplies translated labels, formatted counts/dates, chosen output locale and text direction. The UI follows the teacher's own language; the report presentation block may have a different direction.
4. **Exports and safety.** CSV and plain text use the same requested output locale, with identical website/MCP source calculations. Preserve UTF-8 BOM, quoted/escaped cells, formula-injection safeguards, and no identifying names or private notes in aggregate reports. A locale selector is read-only and never sends email, changes an invoice or triggers an MCP write.
5. **MCP stays stable.** Tool names, argument keys, error codes, OAuth scopes, resource ownership and permissions do not depend on language. Locale-specific human-readable fields are additive and must be tested via website ↔ delegated MCP on the same tenant, including `outputLocale` differences, invalid locales and stable machine fields. The browser and MCP shall use one shared domain formatter rather than independently translated algorithms.
6. **RTL is component-level, not a root toggle alone.** Hebrew requires `dir=rtl`, Hebrew-capable fonts, logical CSS properties, accessible controls, bidirectional isolation for arbitrary names, and explicitly left-to-right code/URLs/chess notation. Verify Hebrew and Russian at mobile/desktop/keyboard/zoom; catalog parity alone does not certify RTL quality.
7. **No implied release completion.** This ADR is an implementation rule, not a claim of full en/he/ru coverage. The active OpenSpec cannot be archived until remaining screens, emails/PDFs, real-client workflows and exact-head CI/RTL acceptance are verified. Operators must manually review the additive existing-database locale migration after a verified backup; no implicit live reset or deployment migration is authorized.

## Consequences

Future teacher-visible actions and reports must carry localized human-readable outputs without changing persisted business state or creating website-only functionality. Any PR adding English-only UI text must pass the incremental UI literal audit; legacy untranslated areas remain explicitly tracked until migrated. Browser/CSS, export text and MCP presentation each require separate evidence rather than a single structural parity assertion.
