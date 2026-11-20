> **Execution reconciliation (2026-11-19):** Follow [the reconciled execution sequence](../../../docs/OPENSPEC_RECONCILED_EXECUTION_SEQUENCE_2026-11-19.md). The new [temporal enrollment and credit-safe lifecycle change](../2026-11-19-temporal-enrollment-credit-safe-lifecycle/proposal.md) must be included in the canonical schema **before final freeze acceptance**. Earlier "schema freeze first" wording means governance and inventory first, not final approval before this amendment. No per-feature production migration; this proposal's feature implementation follows its stage dependencies.

# Change: introduce-multilingual-support

> **Schema-first execution gate (2026-11-19):** [`2026-11-19-freeze-unified-saas-schema-and-regressions`](../2026-11-19-freeze-unified-saas-schema-and-regressions/proposal.md) is the **mandatory first implementation change**. All schema DDL, tenant/RLS/FK/index work, generated DB types and schema-induced regressions belong to that change; this proposal must wait for its reviewed schema freeze and passing exact-head gates before implementing its remaining business functionality. Its existing schema statements describe requirements for the foundation, **not** permission to add per-feature DDL later. Operator-only SaaS and future shard-compatible UUID/RLS design follow [ADR-0018](../../docs/adr/0018-operator-only-saas-and-tenant-scaling.md); no customer self-hosting or live cutover is authorized.


**Status: IMPLEMENTATION IN PROGRESS on PR #86 — not merged, accepted or archived.** The baseline code audit and initial scope below are historical proposal context; consult tasks.md and IMPLEMENTATION_PROGRESS.md for latest implementation and verification.
**Requested first-class UI languages:** English (en), Hebrew (he), Russian (ru).
**Architecture:** MCP/ChatGPT/Claude first, optional fully localized website.
**Source audit:** 2026-11-17, main at 32ea4a0ad33ce66ccf2c18d208004b526d0fb6bf.

## Why

ChessCoachPal currently displays an English user interface. app/layout.tsx fixes the HTML language to en, TeacherNav and most components contain literal English strings, and the dashboard and coaching UI hardcode en-US in places. There is no central message catalog or teacher-wide language preference. A workplace already has a locale, and Hebrew report RTL, Unicode aliases and Hebrew/English exact-name resolution exist, but these do **not** make the whole website multilingual. Russian has no first-class UI treatment.

An MCP-first teacher should be able to ask in Hebrew or Russian and receive a response in that language, read generated reports, and change language settings through the same shared domain service as the website. The existing English MCP tool schema is suitable for model operation and should not be duplicated per language. Locale metadata and human-readable outputs need explicit handling.

## Desired outcomes

1. A real, extensible, type-checked localization framework for the full website, beginning with en, he and ru, with no English-only user-facing flows in supported locales.
2. Fully functional Hebrew RTL across desktop, mobile, dialogs, forms, calendar, charts, account, onboarding, unauthenticated pages, guardian/parent portal and error states. Direction is locale metadata, not a one-off Hebrew CSS exception; future RTL locales are addable without redesign.
3. A self-service **Interface language** setting in Account and anonymous login/onboarding language control; saved securely per teacher and reflected during SSR, initial paint and on other devices. No forced sign-out.
4. Correct distinction among **teacher interface locale**, **workplace/report locale**, **IANA timezone**, **currency** and **original content language**. Locale changes must never rewrite stored student names, chess notation, historical notes or chess evidence.
5. Localized human-facing reports (view/export), generated text, validation and confirmations, notifications and emails, and family/guardian pages where language is known or selected. Stable machine identifiers, dates and amounts are not translated.
6. Verified multilingual AI/MCP experience: English remains the stable language of tool names and JSON schemas, while profile/context exposes preference, localized text outputs are available when valuable, and model workflows work correctly for Russian/Hebrew coaching instructions.
7. Website/MCP parity, security boundaries and automated checks remain mandatory for any added teacher profile setting or localized business output.

## In scope

- Internationalization framework and typed translation catalogs for the three languages; clear module conventions and fallback; SSR, hydration, metadata and accessibility; three-language selection and preference persistence.
- Full application/marketing/authenticated/guest web UI, including all existing user-visible components and user-facing errors, confirmations, toast messages, empty states, date/time/number/currency labels and PWA/offline surfaces.
- Hebrew RTL layouts, responsive behavior and deliberate mixed-direction LTR islands for email, phone numbers, usernames, URLs, FEN, PGN, UCI/SAN, numeric identifiers, timestamps and code.
- Teacher-owned language setting through existing profile website API and ccp_teacher_profile_get/update MCP tools; exposed through trusted ccp_teacher_context_get; any extra rendering options must be shared by browser and MCP.
- Locale-aware customer-facing communications, human-readable reports and deterministic exports; safe localized optional generated AI text.
- Unit, integration, authenticated Playwright browser↔delegated-MCP, language/RTL visual and accessibility regression tests.

## Explicit non-goals

- Translating persisted teacher/student content automatically, inferring a person's language from their name, inventing chess mastery or changing identity matching to fuzzy/transliterated matching.
- Renaming ccp_* MCP tools, translating JSON property names, status/error codes, auth/OAuth scopes or database column names; forking MCP endpoints by language; adding a translator LLM dependency for routine UI.
- Full multilingual tool-definition translation or dynamic per-connection tools/list variation. This could degrade model reasoning, deterministic tool discovery and cacheability; re-evaluate only if measured client testing demonstrates a need.
- Translating external provider interfaces or legal/tax notices without reviewed and jurisdiction-appropriate wording. Unsupported external content remains original with an appropriate language indicator.
- Locale-based authorization, entitlements, rate limits or autonomous financial/document sends.

## Acceptance and delivery policy

Implement in independently reviewable vertical slices (framework/settings/MCP, RTL primitives/navigation, remaining surfaces, outputs/portals, hardening), but **do not mark the overall change applied or archive it** until all three languages are usable end to end, required E2E and strict parity pass on merged main, and the test evidence is linked. Live ChatGPT/Claude acceptance for Hebrew and Russian is tracked separately from automated delegated MCP testing. No production DB reset, deployment, or destructive data operation is authorized by this specification.

## Related requirements

- docs/adr/0001-pre1-breaking-changes.md — pre-1.0 schema policy and non-destructive real-data constraints.
- docs/adr/0003-mcp-website-business-parity.md; openspec/specs/teacher-mcp-parity/spec.md — authenticated teacher website/MCP parity in same feature PR.
- lib/server/teacher-profile-service.ts; app/api/auth/update-profile/route.ts; lib/server/agent-tools.ts — existing shared profile and MCP seams.
- lib/server/teacher-context.ts; app/api/teacher/context/route.ts — trusted teacher context.
- components/teacher/ChessCoachWorkspace.tsx; components/teacher/CoachingReportPanel.tsx; lib/coaching-report.ts — existing locale/timezone split and partial Hebrew RTL.
- app/mcp/route.ts — single stable authenticated MCP endpoint.

## OpenSpec deliverables

- design.md — selected implementation and MCP localization decision.
- tasks.md — verifiable stepwise execution checklist.
- specs/teacher-interface-localization/spec.md — website/settings/RTL requirements.
- specs/localized-output/spec.md — reporting, export, communication and provider output requirements.
- specs/multilingual-mcp-experience/spec.md — agent behavior, compatibility, parity and testing.

> **Cross-change schema coordination (2026-11-19):** Existing candidate: teacher preferred-locale field; verify current baseline and finish acceptance. Existing locale column is not evidence that all locale UX and parity gates passed. See [`../SCHEMA_ROADMAP.md`](../SCHEMA_ROADMAP.md) for shared dependencies and ADR-0017 single-final-cutover rules. Passing the Contacts/Finance PR does not automatically accept this proposal.
