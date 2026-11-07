# Design — CogNote to ChessCoachPal

## Baseline inventory (verified source, not a claim of execution)

Pinned CogNote is Next.js 16/React 19/TypeScript, Supabase Auth/Postgres/RLS/Storage, Docker self-hosting, Vitest and Playwright. Relevant files: `lib/schedule.ts`, `lib/server/scheduling.ts`, `lib/billing.ts`, `lib/server/billing.ts`, `lib/credits.ts`, `lib/data-transfer.ts`, `components/teacher/TeacherNav.tsx`, `app/(teacher)/`, `app/api/`, `supabase/migrations/`, `.github/workflows/{ci,e2e}.yml`. Upstream `studio_policies` has one row per teacher, `lesson_slots` and `lessons` require `student_id`, and `attendance` has UNIQUE `lesson_id`. Preserve its timezone-aware slot materialization and policy calculation while changing those assumptions.

## Components and trust boundaries

```text
ChatGPT custom GPT / Claude / other agent   Browser UI
          authenticated MCP/OpenAPI        authenticated web session
                      \                    /
                Tool gateway / API routes
              schema + scope + confirmation
                     Domain services
          students | workplaces | sessions
         attendance | learning | compensation
                        |
                PostgreSQL + RLS
                        |
           outbox / audit / integrations
```

Agents are the **primary input interface**. Both agents and web UI call the same domain commands, not two implementations. The web UI is authoritative for inspecting and correcting state. Postgres is the source of truth for structured records; Lichess is authoritative for PGNs/studies, optional Google Sheets for imported external attendance, Google Docs for exported reports, and object storage for binary assets.

## Authentication and AI tool gateway

Use a dedicated `/api/agent/v1` surface (and `/mcp` transport if supported by clients) with discovery, versioned schemas and only named, narrow operations. Implement OAuth-compatible delegated authorization and session binding suitable for the client capabilities; never put a Supabase service-role key in a model prompt. Resolve the authenticated teacher server-side, enforce workplace scope for every query, reject cross-owner IDs and whitelist requested fields. Mutating calls require an idempotency key and create an audit record with actor, source client, before/after revision and result. Schema uses explicit units, IANA timezone, ISO date, student/workplace IDs and versioned enums. Unknown records or ambiguous names return typed `needs_resolution` plus minimal candidate data; never auto-pick. Financial, deletions, bulk edits and messages to parents require a two-step preview + confirmed commit with expiring confirmation token. Keep responses concise and privacy-minimized. Treat external content and agent text as untrusted; prohibit arbitrary SQL and unrestricted filters.

Initial tools: `workplaces.list/create/update`, `students.search/create/update`, `groups.list/create/enroll`, `sessions.list/schedule/reschedule/cancel/record`, `attendance.bulk_preview/bulk_commit`, `lesson_notes.get/upsert`, `teaching_reports.preview/export`, `compensation.preview`, `ratings.get`, `materials.link`. Only expose tools backed by implemented, passing domain commands. Define error types `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION_ERROR`, `NEEDS_RESOLUTION`, `CONFIRMATION_REQUIRED` and `PROVIDER_UNAVAILABLE`. Tool receipts carry record IDs, revision and effective time.

## Database evolution

A teacher owns a stable `workplaces` record: id, teacher_id, name, timezone, locale, currency, policy/settings version. `workplace_memberships` reserves an owner/coach/admin model for later collaboration; all first-release data stays teacher-owned. `students` remain canonical to the teacher, with `workplace_enrollments` (teacher, workplace, student, dates, external reference). New `class_groups` and `group_enrollments` manage cohorts, optional capacity and start/end dates. `lesson_series` describes recurring class/individual schedules independently of a student. `lesson_sessions` stores actual UTC instants, workplace, group, teacher, duration and status. `lesson_participants` snapshots expected attendees at the time of the session. `participant_attendance` is unique(session_id,student_id), with status, minutes, source, notice_at, revision and audit. Separate `student_lesson_notes` from session-wide notes. A shared student must not expose one workplace's private notes in another workplace's reports.

Compensation: `teaching_contracts`, `contract_rate_rules` (effective-dated, currency, duration thresholds, group-size and cancellation rules), `teacher_timesheet_entries`, `expected_payouts`, `payout_reconciliations`. Compute money with integer minor units/decimal, not floating point. Do not conflate workplace-paid instructor amounts with CogNote's existing family `invoices`. Preserve original invoice and makeup policies as separate functionality.

**ADR-0001 overrides earlier compatibility planning.** ChessCoachPal does not support CogNote databases or APIs and does not upgrade between pre-1.0 schemas. Edit the canonical fresh-install SQL directly, remove inherited incompatible tables and APIs outright, and do not write backfills, dual reads/writes, compatibility views or sequential upgrade migrations. Existing development environments must be explicitly reset and reseeded with the current schema; never automatically destroy actual user data. Inherited CogNote migration files are temporary installation scaffolding to consolidate into one bootstrap snapshot, not an upgrade contract.

## Chess teaching and integrations

Rename studio-oriented skills to configurable chess categories (calculation, tactics, endgames, strategy, opening principles, time management, practical play), with separate teacher observations and AI suggestions. Store ratings with platform, username, variant, time control, observed_at and provisional flag; cross-platform ratings are never treated as interchangeable. Selected Lichess Studies are linked by stable study/chapter IDs; do not mirror unpublished study content into public logs. Use provider adapters for optional Google Sheets attendance intake, Google Docs localized output and Notion references. Inputs need stable external IDs and revision-aware reconciliation; reports are generated deterministically and never from free-form model guesses. Default website and tools work without external integrations.

No chessboard in v1. If one becomes necessary, use GigaBoard for rendering and GigaChess for chess state/validation. Analyze Stockfish's GPL-3.0 implications before bundling.

## Branding and accessibility

Use ChessCoachPal as visible brand, `ChessCoachPal` as PWA name and `CoachPal` as short launcher label (12-character PWA maximum). Give the product a small rook + chat accent icon, accessible SVG alt/ARIA labels, cohesive primary colors, updated README, landing, nav, email, static metadata, support and help. Hide obsolete music/practice features from navigation during migration; preserve code behind an explicit temporary flag until safely removed. Verify no original brand appears in visible product screens except upstream attribution. Support responsive UI, full keyboard operation, screen reader labels, Hebrew RTL and locale-sensitive dates/currency.

## Testing and rollback

Preserve upstream Vitest, Playwright and Docker CI; add API contract tests for tools and generated OpenAPI/MCP schemas, cross-teacher RLS, cross-workplace information barriers, concurrent duplicate requests, DST/timezone shifts, group absence/makeups, partial group attendance, permission errors, financial accuracy, export/restore and accessible website editing. Use anonymized or synthetic seeded fixtures. CI must report exact test status; restore the old state from a documented database snapshot if migration verification fails. No change should mutate an existing production deployment automatically.
