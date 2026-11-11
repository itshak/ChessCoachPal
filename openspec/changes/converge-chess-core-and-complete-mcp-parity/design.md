# Design: canonical integration, implementation batching and release-proof parity

**Status: proposed execution design.** This document coordinates existing active OpenSpecs; it does not replace their unfulfilled requirements or claim their implementations are accepted.

## 1. Source control and integration topology

Before implementation, inspect **live** main, PR #44, #48 and #49 heads, diff/base ancestry, OpenSpec tasks and CI, the current schema, generated MCP catalogue and versioned parity registry. Avoid assuming the branch or commit IDs in this proposal are still current.

- Create **one integration implementation branch/PR** from up-to-date main. Bring in the typed-material implementation from #48, then the stacked homework/navigation implementation #49, respecting actual git ancestry, so its material references are not orphaned. Reconcile #44's much larger parity work against the resulting tree with a reviewed merge/cherry-pick/port of retained deltas. **Do not blindly merge #44** (which predates the canonical changes) and do not silently overwrite #48/#49.
- Track a source-of-truth mapping for every conflicting file/service/table/API/test, with explicit disposition: reused unchanged, adapted to canonical model, replaced with behavior preservation, or deferred *only if never made a supported teacher operation*. Keep migrated IDs/history and RLS/tenant constraints intact.
- One owner for alias resolution and lesson preview/commit, one for session occurrence/attendance, one material identity, one assignment/review ledger, one report/teaching-minute calculation, one account/permission model and one policy/billing engine. Avoid website/MCP-specific forks of domain logic.
- Treat existing per-PR OpenSpec tasks as still open until an individually proven integrated outcome is accepted. Update task/evidence links together after verification, not while writing each small service.

## 2. The canonical replacement boundaries (integrate BEFORE final parity)

### Student, contact and payer

`students` remain canonical, independent teaching identities with stable UUID, aliases, strength, skill/rating history, active/archive lifecycle and optional contacts. A coach can create an adult without a fictitious family, compulsory birthdate or guardian. Allow shared contacts for siblings but separate child histories and granular guardian consent/access. Keep business payer/responsibility separate from lesson visibility. Preserve existing guardian/family business flows through a compatible *new domain service or intentional user-visible migration path* with the same authenticated website/MCP features; no direct destructive removal. Historical portal tokens and contact secret handling remain protected. Existing real-data installations must not be reset without operator inventory, backup and explicit authorization.

### Lesson occurrence vs scheduling rules

Use one canonical teacher-owned lesson occurrence with frozen participants and per-student attendance, notes, actual materials and teacher teaching duration. Group, individual and ad hoc instruction must share this occurrence model, with recurrence and workplace policy modeled independently as scheduling intent, not a competing completed-lesson writer. Preserve old `lesson_slots/lessons` data through an audited import/projection/migration that does not invent attributions or erase existing records. Existing schedule/list/update/attendance/notes routes and MCP tools must be adapted to the canonical service until replaced by equivalent supported routes/tools. When replacing an old route, update the website, MCP, registry, tests, links and history migration *together*. Scheduling remains available; do not use canonicalization as an excuse to drop recurring private lessons or holiday/DST support.

### Learning material identity and evidence

Use one `learning_materials` teacher-owned root with validated typed `chess_games`, `chess_puzzles`, `chess_drills`, `chess_study_chapters` and external link payloads; no puzzles stored in games, no permissive one-table misc JSON. Match #48's foundation (create/search/get) with full edit/correction/delete-impact and history/reference lifecycle. Reconcile old `chess_learning_resources`, study URLs and `chess_material_progress` with stable provenance; preserve the distinction linked / taught / assigned / attempted / completed / reviewed / teacher-assessed. Use explicit ownership-valid material relations, collections and source-game references. Existing material reports and workplace/student aggregation resolve through the canonical IDs and cannot double-count one group lesson.

### Homework, plans and briefings

Integrate #49's separate assignments/attempts/reviews into the canonical material and lesson model, preserving per-student fan-out and idempotent receipts. Finish teacher-approved goals/training plans, revision-guarded changes, bulk preview/commit, full website/MCP CRUD/read/search/export and factual before-lesson briefings. Completion does not imply mastery. Every briefing claim includes source ID, time and confidence/provenance; provider outage still leaves useful locally stored facts. Existing study/material edits must not compete with the typed catalog.

## 3. Retained optional business and provider modules

**Do not delete billing or financial functionality** because it may be a supported professional-tier differentiator. Reconcile invoice/credit calculations against the one canonical lesson/attendance history (no duplicate teacher time, invoice lines or redeemed credits). Finish atomic draft editing, generation, regeneration, void/delete, manual payment and reversal, checkout request state, PDF, ledger, bulk send, exactly-once provider/email receipts, concurrency and replay. Use synthetic Stripe/email provider fixtures for required automated acceptance; never charge real cards in CI. Payment-card entry, subscription portal and financial account auth are secure handoffs. Verify plan gating identically through web and MCP, without exposing private prices, thresholds or entitlements.

Keep event/roster/RSVP/communications and consent-protected guardian functions as supported optional features. Preserve notifications, emails and portal role restrictions. A retired legacy facade is acceptable only if all supported UI+MCP operations have an equivalent tested canonical successor; record the change precisely.

For Lichess, retain the existing study search/OAuth/read, manual FEN/puzzle preview and optionally enabled publishing if those operations exist in the supported website. The newer student-first proposal defers **new remote provider writes from its core rollout**, not a silent deletion of already supported provider tools. Where publishing remains exposed, finish reviewed image→candidate FEN→edited full FEN→validated PGN→explicit confirmed study/chapter publish with 64-chapter rollover, permission and external retry semantics, including safe provider mocks. Do not require server vision to guess castling rights, en-passant, side to move or move counters. Provider write may be deferred **only through an explicit separate scope decision that simultaneously removes it from supported UI/MCP release surfaces and amends both older OpenSpecs**. Default instruction: **keep and complete it**.

## 4. Precise MCP/web equality contract

For each supported teacher business field and action:

1. Inventory concrete website page/component, its API or direct server write, read/search/edit/clear/delete, request/response schemas, required OAuth scope and plan/entitlement.
2. Map to a discoverable typed named MCP operation on the **same** `/mcp` gateway. Website and MCP call one teacher-scoped validated domain service or identical transactional RPC.
3. Confirm exact field mutation semantics (including `null` clear, locale/hebrew alias, times/timezones, rate/amount and expected revision), cursor/search coverage, output redaction, owner checks and immutable audit.
4. Test authenticated browser/API → database snapshot → delegated MCP mutation/read → browser refresh and reverse direction, including same request replay, changed-payload conflict, stale updates, tenant B, read-only and revoked OAuth grants.
5. Use narrow confirmation/impact previews before destructive, external, emailed, financial or privacy-sensitive actions; never expose payment card/CVV, provider API credentials, OAuth token, MFA code or password in model context.
6. For a secret-entry action, document the *specific* secure browser handoff and verify MCP initiation/authorization/status without inventing general web-only exceptions. Device push and guardian-originated sessions retain their own principal.

The `scripts/mcp-website-parity.json` registry and 93-scenario checklist are evidence manifests, **not a score to optimize**. Recompute them from the integrated source. Every new UI/API field/action and new typed chess workflow adds required test cases; retaining 93/93 alone is insufficient. Resolve the current 23/11/19 registry vs 24/10/19 prose discrepancy by checking actual test coverage, not by changing either count cosmetically.

## 5. One coordinated build, then the comprehensive campaign

**Do not repeat full CI for tiny code deltas.** The applying agent works through the implementation checklist as one dependency-ordered batch, with tests authored alongside implementation but the complete pipeline executed **after** source and evidence coverage are ready.

Recommended checkpoint discipline:

- Keep one integration branch and one primary implementation PR. If tool/session limits require remote saving, use infrequent grouped checkpoints with `[skip ci]` only where repository policy permits, clearly labeled **unverified**, and never interpret a skipped check as passing. Prefer local unpushed commits and a single final ordinary CI-triggering commit when tools permit. Do not create a chain of competing per-gap PRs.
- Cheap syntax/type-check or a narrowly targeted diagnostic may be run during implementation if needed to prevent cascading errors; this is not full acceptance and must not trigger repeated GitHub workflow campaigns. The agent may write all test files before executing them. Never edit production config merely to fake a passing test.
- Once source integration, domain changes, route/field mapping and the new test matrix are complete, commit a **single coherent candidate** and run: format/lint/typecheck, unit, MCP catalogue/generation audit, complete 93+ scenario browser↔OAuth/MCP E2E on disposable Supabase, strict parity, security/history/privacy, Docker/Compose smoke, backup/restore, provider/mail contract mocks. Capture exact SHA, run URLs, failures and coverage.
- If failures are discovered, fix them in **consolidated batches**, repeat impacted local tests and one final complete synthetic campaign on the final SHA. Do not waive failures, mark unchecked rows checked, or merge without every required gate green. External network/setup failures must be distinguished from product failures and retried with recorded evidence.
- Finish with independently verified **merged-main** workflows and strict parity; only then reconcile/archive every actually completed OpenSpec and update the release docs. **No production reset, official release or publication**. Live ChatGPT and Claude delegated-client acceptance remains the separate final local pre-v0.1.0 step.

## 6. Security, continuity and rollout

RLS + owner composite FKs protect every material subtype, session, contact, payment, event, homework and record. Idempotent writes are tenant-scoped; changes are retry-safe across website and MCP. Avoid credential leaks in model output, tests and source history. Keep the accepted ADR-0001 pre-1.0 no-compatibility posture but do not wipe real tenant data. On any potentially destructive schema transition, provide operator-facing impact inventory, export/backup, explicit approval, dry-run, isolated synthetic migration tests and rollback/recovery notes before any production operation.

## 7. Required final report format

An applying agent reports: base/main and final implementation SHA; exact PR links and source dispositions for #44/#48/#49; the canonical data/schema decisions; route-family verified/partial/gap counts and changed denominator; individually evidenced accepted cases of 93+; exact test command results/Actions links; data preservation and cross-tenant results; unresolved provider-live/manual-release requirements; merged-main and OpenSpec archive status. **Never call a result fully complete if strict parity is still red.**
