# Implementation tasks: adopt-cognote-chesscoachpal

All tasks start unchecked. A task can be marked complete only with a commit reference and observed verification evidence in docs/STATUS.md.

## P0 — source, provenance, publication

- [ ] 0.1 Obtain a reproducible clean source snapshot of CogNote SHA fff723ea0374df8f07a20e90e44c725499ec680a. Verify every tracked source file and lockfile by manifest and SHA comparison.
- [ ] 0.2 Replace legacy repository tree with a new root commit (no old parents); preserve MIT upstream author notice and document derivation.
- [ ] 0.3 Review old refs, commits, tags, PR refs, cached SHA links, Actions artifacts/logs and other copies; rotate any exposed credentials. Do not claim cache/object purge without GitHub confirmation or fresh repository re-creation.
- [ ] 0.4 Verify upstream and inherited third-party artwork/index/font licenses; remove music-only assets not necessary for basic operation.
- [ ] 0.5 Audit repository and new history for actual student identities, workplace names, private links and secrets. Confirm no examples contain live data.
- [ ] 0.6 Restore clean CI: package install, typecheck, unit tests, Docker build and seeded Playwright/RLS tests; capture pass/fail evidence.
- [ ] 0.7 Do not change repository visibility until P0 publication checks are satisfied.

## P1 — rebrand and baseline behavior

- [ ] 1.1 Replace CogNote product copy in landing, nav, login, account, portal, dashboard, onboarding, e-mail, PDF, notifications and help; preserve upstream attribution.
- [ ] 1.2 Create a ChessCoachPal rook/chat logo, favicon, PWA SVG and installable icons; update manifest, service worker cache, title, theme and social preview.
- [ ] 1.3 Update README, contributor guidance, architecture, environment docs and Docker startup with accurate self-host instructions.
- [ ] 1.4 Remove music-centric navigation; isolate practice, VexFlow, OSMD and music index screens behind temporary flags. Disable any obsolete routes without breaking imports or tests; document eventual deletion.
- [ ] 1.5 Add synthetic onboarding sample: one coach, two workplaces, one group and one private learner; no live names.
- [ ] 1.6 Verify desktop/mobile, accessibility, keyboard navigation and no unintended visible upstream brand.

## P2 — shared service layer and AI agents (highest functional priority)

- [ ] 2.1 Inventory page and API direct Supabase calls; introduce typed domain commands/queries shared by web and agent routes.
- [ ] 2.2 Specify OpenAPI schemas and versioned MCP tool names; generate or validate both against one contract.
- [ ] 2.3 Implement delegated teacher authentication for agent clients, per-operation scopes and token revocation; never expose elevated service credentials.
- [ ] 2.4 Implement read/search tools: workplaces, students, groups, sessions, attendance, notes, resources and reporting previews.
- [ ] 2.5 Implement write tools: student/workplace creation and edit; group enrollment; schedule/reschedule; attendance and lesson note entry; idempotency records.
- [ ] 2.6 Implement multi-match disambiguation with stable candidate identifiers and no writes while unresolved.
- [ ] 2.7 Implement preview/confirm flow for destructive/financial/bulk/outbound communication; prevent stale confirmations and duplicate side effects.
- [ ] 2.8 Implement audit receipts, structured errors, least-privilege output and tool-call tracing without private payload logs.
- [ ] 2.9 Test at least one authenticated ChatGPT-compatible and one Claude-compatible client flow, with clear setup docs; never assert native voice tool support without a verified test.
- [ ] 2.10 Verify create/update/undo parity from web UI and agents using the same command service and row revisions.

## P3 — workplaces, groups, attendance

- [ ] 3.1 Add workplace schema with teacher ownership, timezone, locale, currency and policies; backfill default workplace for existing records.
- [ ] 3.2 Add canonical student registry plus workplace/group enrollments; handle the same student enrolled across contexts.
- [ ] 3.3 Add independent lesson series/occurrences, class groups, session participant snapshots and per-student attendance/notes.
- [ ] 3.4 Preserve DST-correct scheduling, idempotent occurrence generation and changes to future recurring lessons; add cross-workplace teacher conflict warnings.
- [ ] 3.5 Migrate legacy one-student attendance, notes, makeup credits and invoices without losing history; verify counts and reversible mappings.
- [ ] 3.6 Build aggregated teacher calendar, workplace filter, group register and private lesson correction flow.
- [ ] 3.7 Add RLS + authorization tests for owner, unrelated teacher and cross-workplace access; no parent token leaks.
- [ ] 3.8 Implement per-student cancellation/makeup rules for group sessions without canceling the session.

## P4 — teacher compensation, chess context and reports

- [ ] 4.1 Add versioned institute/contract/rate rules, worked-time calculations, expected pay and payout reconciliation separate from family billing.
- [ ] 4.2 Verify group teaching duration counted once; test tiered rates, partial attendance, cancellations, currency minor units and period boundaries.
- [ ] 4.3 Add chess-specific skill dimensions, assessed versus AI-inferred provenance and teacher-approved rating-level calibration.
- [ ] 4.4 Add selected Lichess Study links/metadata, user-verified Lichess/Chess.com identities and time-control-specific rating snapshots.
- [ ] 4.5 Add configurable report definitions and deterministic workplace/month totals; Hebrew RTL and locale-sensitive rendering.
- [ ] 4.6 Add optional Google Sheets attendance intake and Google Docs output adapters; ensure retries/corrections are reconciled, never duplicated.
- [ ] 4.7 Preserve optional Notion/Drive resource references without requiring either provider.

## P5 — reliability, packaging and acceptance

- [ ] 5.1 Ship Docker-based local PostgreSQL/Supabase installation with zero required cloud service accounts.
- [ ] 5.2 Provide tested complete backup and restore (database plus uploaded files), import/export and schema rollback instructions.
- [ ] 5.3 Implement persisted limits/queues where in-process rate limiting is unsafe; ensure service-role routes and portal tokens are reviewed.
- [ ] 5.4 End-to-end acceptance: teacher enters group attendance via agent, corrects on website, generates localized report and restores from backup.
- [ ] 5.5 Test failures: provider unavailable, repeated tool calls, two teachers, overlapping lessons, ambiguous names, missing permissions and concurrent edits.
- [ ] 5.6 Run and record `npm ci`, `npm run typecheck`, `npm test`, `npm run test:e2e` and Docker build. Document remaining failures.
- [ ] 5.7 Update docs/STATUS.md and archive OpenSpec only after every accepted requirement is verified.
