# Proposal: Adopt CogNote as ChessCoachPal and make AI agents the primary interface

**Change ID:** `adopt-cognote-chesscoachpal`  
**Status:** Proposed; implementation and verification outstanding  
**Foundation:** CogNote by Andres Jaime Morales, MIT, SHA `fff723ea0374df8f07a20e90e44c725499ec680a`

## Why

Chess teachers manage students, individual lessons, class groups, attendance, employer-specific rules, parent communication, chess materials and reports across multiple places. CogNote provides a tested teacher-management starting point, but assumes a music studio with one student per lesson. ChessCoachPal SHALL prioritize **ChatGPT and Claude as the normal way to enter or update teaching information**, and SHALL offer a website for reviewing, correcting and accessing the same records.

## Proposed changes

1. **Clean foundation:** import pinned CogNote source, migrations, tests, CI and Docker setup into an independently named repository; retain MIT attribution; replace obsolete private prototype files/history and complete publication privacy checks.
2. **Brand and presentation:** ChessCoachPal identity in metadata, PWA manifest, favicon, product copy, navigation, email templates, screenshots and developer docs. Add an accessible wordmark and rook/chat-bubble icon; identify CogNote as upstream.
3. **Agent-first API:** shared typed command/query service; authenticated OpenAPI and MCP-compatible operations usable by ChatGPT and Claude; tool discovery, structured responses, validation, confirmation, idempotency, audit and a safe error model.
4. **Teaching domain:** replace teacher-scoped single-studio assumptions with teacher-owned workplaces, enrollments and groups. A student can appear in several workplaces without creating duplicate student identities.
5. **Sessions/attendance:** recurring group or private session patterns with timezone-aware occurrences, class membership snapshots, per-student attendance, per-student notes and one instructor-time count per group session.
6. **Teacher compensation:** separate family invoices from workplace contracts/rates, hours, expected payouts and reconciled payments; configurable policies and deterministic reports.
7. **Chess learning:** chess-specific skill dimensions and teacher observations; selected Lichess study and Chess.com/Lichess rating references; resource links; optional reporting to Google Docs and attendance import from Sheets. No embedded board in v1.
8. **Security and portability:** continue Supabase/Postgres/RLS initially; add cross-workplace authorization tests, complete backup/restore, optional integrations and RTL/Hebrew-safe reporting.
9. **Public reference documentation:** landscape of alternatives, setup guides, privacy model, migration notes, attribution and reproducible tests.

## Non-goals for this change

- No automatic import of real student data or alteration of existing private accounts.
- No multi-tenant school SaaS, billing for platform access or business planning.
- No embedded chessboard, game engine or lesson-playing interface in the initial release.
- No mandatory OpenAI, Anthropic, Notion, Google or Lichess account for core website use.
- No promise of working tools or deployments before integration tests are observed.

## Success criteria

A clean-room teacher can self-host, enter one group and one private lesson through authenticated AI tools, correct them in the website, generate a workplace-scoped summary and recover an encrypted backup; the same actions must work via UI without AI. Cross-tenant attempts must fail and retries must not duplicate records. Existing CogNote scheduling, billing and portal tests continue to pass or have explicit, justified replacements.
