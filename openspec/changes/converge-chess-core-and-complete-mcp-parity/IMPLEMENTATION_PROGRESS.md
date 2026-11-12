# ChessCoachPal canonical-schema implementation ledger

**Status:** Draft implementation in [PR #51](https://github.com/itshak/ChessCoachPal/pull/51). The OpenSpec remains active. No release, production reset, OpenSpec archival or main-branch merge is authorized.

## Binding rule: ADR-0001

- One chess-specific **fresh-install** PostgreSQL schema in `supabase/migrations/20261107000000_chesscoachpal_baseline.sql`.
- No incremental schema-upgrade chain, data backfill, alternate material ID mapping, dual material writes, compatibility adapter, obsolete API facade or backup-format version negotiation.
- Fresh synthetic test databases are disposable and may be explicitly recreated. Real teacher or student records must never be reset or removed without operator authorization.
- Portable exports contain the current schema alone, without a `version` property; foreign table names and unsupported top-level keys are rejected, not interpreted.
- The optional professional features (billing, guardian/contact functions, events, hosted account actions) remain supported user capabilities. Removing a compatibility mechanism **does not authorize removing a current useful feature**.

## Current-source changes

The typed `learning_materials` catalog provides teacher-scoped games, puzzles, drills, study chapters and HTTPS links. The same website/MCP services provide corrections, relations, archiving, fan-out homework, reviews, explicit goals/plans and factual lesson-preparation briefings.

The interim material mapping feature has been deleted, including its HTTP route, MCP tools, React panel, source service, SQL table and test. Material archive impact still guards live assignments and typed-material relations.

All executable SQL definitions have been assembled into one fresh-install database snapshot instead of a sequence of upgrade files. No production database was touched.

Teacher portable backups now describe only the current schema and current table allowlist. There is no `DATA_EXPORT_VERSION` check and no previous-data converter. Backup privacy rules still exclude OAuth grants, credentials and payment secrets; restore remains a single approved transaction.

## Important unresolved work

The current source still includes an independently writable resource-link and material-coverage model (`chess_learning_resources` and `chess_material_progress`). Those remaining paths must be replaced with direct typed `learning_materials` IDs and current-schema teaching-evidence records, including the website forms, MCP tools, reports and E2E tests, **before claiming the one-material-model requirement is finished**.

The current source also contains two mechanisms for completed lesson history. A single authoritative occurrence writer, current-schema recurrence/attendance and full field-level MCP parity remain open. Finance, contacts/guardians and events must retain their current supported behavior on the canonical schema. Do not mark a route complete without executed browser and authenticated delegated MCP evidence.

## Verification evidence

The last previously confirmed integrated checkpoint, `f25b360328f6b5964a26fbd1a87b08f38eb67da2`, passed [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43068237786), [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43068237617), security, Compose and backup/restore. Those results preceded this schema cleanup and must NOT be represented as verification of the new tree.

The canonical-schema cleanup candidate `069ab80b3180f11f62085e3c81bebda49b821e46` passed all five workflows: [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43092006651), [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43092006645) (**180 passed, five intentionally skipped, zero failed**), [security history audit](https://github.com/itshak/ChessCoachPal/actions/runs/43092006736), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43092006639) and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43092006657). These are synthetic current-schema tests, not final strict parity acceptance.

An ADR-0001 CI guard checks for one fresh-install SQL snapshot, absent material mapping bridge, and one unversioned backup contract. Its stricter `npm run schema:canonical:strict` mode intentionally blocks the final release until `chess_learning_resources` and the parallel material-progress writer are replaced by direct typed-material evidence. Do not label this code fully canonical merely because the non-strict CI succeeds.

Keep [PR #51](https://github.com/itshak/ChessCoachPal/pull/51) in draft while the strict parity inventory is incomplete. Updating one registry label or deleting a test is not evidence of feature parity.

## 2026-11-11 current-schema implementation increment (not parity acceptance)

- Skill-dimension creation now uses one teacher-scoped SQL transaction and an optional request UUID shared by the website and MCP, with an immutable response receipt, concurrent sort allocation and cross-interface replay/conflict checks. This corrects a concrete outstanding retry gap without importing or converting any old schema.
- Removed an unnecessary format-version field from the parity evidence inventory. Current MCP tool names remain stable during this integration; their names are not a legacy API adapter or a schema-upgrade contract.
- Added browser↔delegated MCP E2E for same-key replay, changed-payload rejection and reverse-direction creation. These new tests remain **unverified until executed on this exact commit**; do not promote the skill-dimensions route or archive the OpenSpec based on this implementation alone.

## Canonical typed material teaching-evidence increment — implementation candidate

- One fresh-install `material_teaching_evidence` ledger now references `learning_materials` by tenant-owned `material_id`. The old `chess_material_progress` ledger was removed, not migrated or dual-read.
- Teacher website and authenticated MCP use `materialId` for recording/filtering evidence. Student/workplace aggregates and the website history editor select from the typed material catalog; no legacy resource-to-material translation or backup version negotiation was added.
- The material lifecycle preview and PostgreSQL archive transaction both block archiving records with material-teaching history. Current-shape portable backup/restore includes the new ledger.
- Added revised unit/E2E fixtures covering canonical IDs, student reports, group-session deduplication, invalid material IDs, and URL reference removal without erasing independent historical evidence.
- **Still open:** eliminate the separately writable `chess_learning_resources` URL-link catalog and update the remaining website/MCP surfaces, consolidate the lesson history writer, finish all other parity gaps, run strict gates and verify on merged main. This is not an OpenSpec completion or release acceptance.

## 2026-11-11 canonical typed material associations — implementation candidate

- Deleted the redundant `chess_learning_resources` table from the one fresh-install schema snapshot, including grants, RLS, foreign keys and resource-specific indexes. New `material_links` retains only teacher, canonical `learning_materials` ID, optional student/session target, immutable request UUID, revision and timestamps. Composite FK and an insert/update trigger enforce scope, current material status, frozen session membership and archive synchronization.
- Website and MCP now share link-specific operations (`materials.links.*` and `ccp_v1_material_links_*`) for create, list, revisioned reassign, impact preview and unlink. Typed material content remains in the single catalog; old tool names and website actions were removed outright, with **no aliases or backwards compatibility**.
- The Chess Learning UI selects from the canonical catalog instead of separately creating URL records. Whole-history evidence is unaffected by link removal. Portable export and single-transaction restore include `material_links` in catalog dependency order. Catalog archive preview and database transaction both protect active associations.
- Added/replaced browser and delegated MCP tests for creation/retry, correction and stale revision, tenant ownership, student/history preservation and current-schema validation. These changes **still require successful exact-head typecheck, E2E, security and database fresh-bootstrap smoke**; none are marked accepted before CI evidence.
- Still open: second completed-lesson writer, other incomplete API route families and 93-case cross-surface acceptance. Strict parity remains blocked; PR stays draft, OpenSpec stays active.

## 2026-11-11 session completion + attendance writer consolidation — implementation candidate

- Replaced `ccp_teacher_session_patch`, the MCP-only `agent_record_attendance`, and MCP-only `agent_update_session_note` with ONE owner-verified SQL mutation entrypoint: `ccp_teacher_session_commit`. This new-schema RPC serializes the session, validates frozen-roster membership, status/note/revisions, and atomically updates session fields and any approved attendance rows. Shared website/MCP attendance and note operations now call the same service; old SQL writer functions and their grants are deleted, not aliased.
- A new `sessions.complete` website action and `ccp_v1_sessions_complete` MCP tool require one current `updatedAt` session revision, all frozen participants and each explicit attendance status + revision, one idempotency key, and confirmed approval. Any roster mismatch or stale attendance row rolls back the ENTIRE completion, including session status and receipt. The normal edit and attendance routes still use this same underlying RPC. No attendance result implies material mastery.
- Added a teacher website completion panel with an explicit status selector for each learner and an affirmative confirmation checkbox. Unit/E2E cover duplicate learners, row+session revision races, owner checks, replay and complete website↔MCP readback; evidence remains pending exact-head execution.
- **B5 is still NOT complete.** The separately writable `lessons`/`attendance` calendar model is needed by existing recurring slots, notes, make-up credits, family emails and invoicing. This change does **not** dual-write or silently reinterpret those rows, does not pretend they are canonical coaching sessions, and does not remove dependent supported business features. The next required step is an explicit clean-schema, service-by-service calendar/finance/portal cutover before deleting those tables and the cross-model history reconciliation.

### Implementation audit correction

- Maintained the **fixed 93 historical checklist case IDs** and established `docs/MCP_NEW_PARITY_SCENARIOS.md` for additional domain cases. The audit validates both matrices without treating new coverage as a replacement for an old case.
- The teacher component inventory now explicitly includes `LessonCompletionPanel`; MCP attendance uses the imported shared service rather than the deleted MCP-specific SQL writer. Exact-head E2E and CI remain release gates.

### 2026-11-12 — green cross-interface completion acceptance

- Source commit `2309bd345bf3d44d711cf49fe3935d20b70c11a2` passed [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43108081495), [security](https://github.com/itshak/ChessCoachPal/actions/runs/43108081459), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43108081484), [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43108081537) and [authenticated website↔MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43108081440) (**184 passed; five intentional skips; zero failures**).
- The new independent `sessions.complete` checklist case is now checked. The historical 93-case baseline remains untouched. Calendar `lessons` / `attendance` cutover and unrelated route parity gaps remain open; do not archive OpenSpec or merge the draft PR.

### 2026-11-12 — prohibit all status-only coaching completion bypasses (implementation)

- The previously accepted `sessions.complete` RPC remains the only transition to `teaching_sessions.status=completed`. `ccp_teacher_session_commit` now rejects empty/partial roster completion and sets transaction-local completion proof; a new database-level status trigger rejects a direct authenticated PostgREST status update without that proof. No magic note/attendance inference or alias.
- Website `sessions.update`, MCP `ccp_v1_sessions_edit`, and the ordinary coaching edit UI no longer accept the status-only completed transition. The separate completion panel can refresh a newly created lesson without reloading and still uses the explicit full roster. Existing completed lesson titles and notes remain editable without redundantly writing the completed status.
- Revised coaching, session-edit and historical-roster-correction E2E fixtures to use canonical full-roster completion, preserving historical attendance notes and corrections; added independent website/MCP/direct-database rejection test. The new scenario is unverified until all exact-head checks pass.
- This closes **one writer bypass** in canonical coaching. It does not yet convert the recurring-calendar `lessons`/`attendance` schema and its billing/guardian dependencies; that cutover remains an explicit unfinished blocker.

### 2026-11-12 — independently accepted completed-status bypass closure

- Tested code commit [`64ae2c9`](https://github.com/itshak/ChessCoachPal/commit/64ae2c9fd1bb048bb791b2d280293a6ed5f67fe5) with **all five workflow families green**: [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43119420231), [authenticated website↔delegated MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43119420118) (**184 passed, five intentionally skipped, zero failed**), [security](https://github.com/itshak/ChessCoachPal/actions/runs/43119419961), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43119420155), and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43119420322).
- The independent `PARITY-completion-cannot-bypass` case is accepted in the new scenario matrix. The SQL trigger rejects direct authenticated completion outside `ccp_teacher_session_commit`; the website and MCP reject status-only completed edits; the full frozen roster remains required for completion. The final evidence-only commit gives the test the stable ID used by the structural parity audit.
- **Not an acceptance of OpenSpec B5 or overall MCP parity.** The parallel recurring-calendar `lessons`/`attendance` writer, its credits/finance/guardian dependencies and the wider missing/partial teacher API route families remain open. Retain PR #51 in draft; do not archive this change or merge into main until strict parity gates are complete.

### 2026-11-12 — legacy calendar private-attendance transaction safety (candidate, NOT B5 closure)

- Current supported calendar one-learner attendance edits and clearing now share `ccp_calendar_attendance_commit` for website and delegated MCP, rather than direct application-side upserts/deletes. The current-schema RPC locks the teacher-owned lesson, checks `marked_at` optimistic revisions, stores immutable idempotency receipts, rejects changed-payload replays and serializes first-write races. It does **not** create a second canonical coaching record.
- Explicit `expectedMarkedAt` / `idempotencyKey` may be submitted together through either interface; existing website controls get a freshly read precondition and UUID before the same RPC. Same-key replay cannot trigger the application-level cancellation-email send a second time, but crash-safe provider exactly-once delivery remains unaccepted until a durable notification outbox is in place.
- Bulk attendance and guardian-initiated cancellations still need comparable concurrency/retry design and a subsequent **full replacement of the old occurrence tables**. This is an interim correctness improvement to retained business features, not an excuse to mark Stage B5 or C2 complete.

### 2026-11-12 — bulk calendar attendance follows same current-schema RPC (candidate)

- Website and MCP bulk attendance no longer directly `upsert` the old attendance table. Each owned lesson goes through `calendarAttendanceWrite` and its tenant-scoped revisioned receipt, preserving the existing per-lesson successes and explicit failures. An optional command UUID plus all original `marked_at` revisions derives stable **per-lesson** child receipt IDs for safe retries after a partial batch.
- A combined teacher-cancellation notification is now limited to **fresh** successful rows; a replayed batch cannot send the same cancellation digest again. This is still an at-most-once application retry safeguard, **not** a crash-safe exactly-once provider outbox.
- Remaining B5/C2 requirements include replacing these current calendar tables with the one canonical session model, and porting parent cancellation, family notes, finance and credits. The new bulk replay case is unverified until authenticated E2E on the exact commit.

### 2026-11-12 — studio policy source-schema parity guard (candidate)

- Added a CI source guard that compares the actual website policy allowlist against the full MCP `studioPolicyPatch` schema, excluding only four browser-required raw credential inputs. Supported ordinary fields, nullable clears, payment provider/QR data and credential-clearing booleans must all be present; otherwise the parity guard fails before release.
- Authenticated website/MCP E2E for these policy values is a separate acceptance requirement, not implied by a field-list match. The secure website remains the only channel for entering fresh Stripe and AI API secrets.

### 2026-11-12 — five existing event/guardian route families accepted after E2E review

- Verified common runtime candidate [`a3af159`](https://github.com/itshak/ChessCoachPal/commit/a3af159a6c3759933993713b77c0f5b86ba832f5) passed all five workflows: [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43163757030), [authenticated OAuth browser↔MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43163756881) (**188 passed, 5 skipped, zero failures**), [security](https://github.com/itshak/ChessCoachPal/actions/runs/43163756770), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43163756792), and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43163756780).
- After reviewing shared website/MCP event and guardian Zod schemas, tenant and atomic SQL owner paths, and named cases in `e2e/parity-families-events.spec.ts`, `e2e/event-atomic.spec.ts`, `e2e/guardian-atomic.spec.ts`, these five **current-route** families move from `gap` to independently evidenced `mcp`: `events` list/create and detail/update/delete; `guardians` list/create and detail/update/delete; family portal-token rotation.
- This is **not** an approval of B4's independent adult/guardian/contact/payer roles, all email provider outbox semantics or the old calendar cutover. The events email flow remains a separately tracked secure confirmed tool and family token delivery stays browser-only.
- Verified teacher route classification is now **28 mcp / 17 partial / 14 gap** of 59. Still NOT strict parity or OpenSpec closure; remaining transactional finance/calendar and provider cases require acceptance.

### 2026-11-12 — spreadsheet mapping local/AI parity (candidate)

- Website `POST /api/import/spreadsheet/suggest` now accepts an explicit `useAi:false` deterministic local heuristic, matching `ccp_v1_import_spreadsheet_suggest`. Omitted `useAi` preserves the website's existing opt-in AI suggestion path, which still strictly requires `confirmedExternal:true` before any student/family samples leave the app.
- Error responses retain safe `SpreadsheetImportError.code` for validation and unconfigured-provider visibility. Named browser↔delegated MCP E2E `PARITY-spreadsheet-suggest-local-vs-ai-consent` compares mappings and checks both failure/consent boundaries. This does not claim live third-party AI acceptance or provider outage recovery.

### 2026-11-12 — invoice draft update owner/receipt parity (candidate)

- Existing `ccp_invoice_draft_update` replaces all revised lines and metadata in ONE authenticated, tenant-locked SQL transaction. It now takes an explicit current-schema request UUID, saves a canonical payload hash and immutable receipt, checks optimistic invoice `updated_at` when supplied, rejects key reuse with modified terms, and returns the original result for cross-interface replay. No older function overload/alias or historical converter is retained.
- Website PUT and `ccp_v1_billing_invoice_draft_update` now validate with exactly the same strict `invoiceDraftEditSchema`; arbitrary unknown business fields cannot be silently ignored by the website. Both preserve the existing invoice editor's approved supported inputs. A request without an explicit UUID gets a new one for the same SQL atomic writer.
- Named new authenticated cases: `PARITY-billing-draft-idempotent-replay` and `PARITY-billing-draft-race-and-field-schema`. Draft invoice line replacement, concurrency, replay, changed-payload conflict, revision denial and shared field validation remain unaccepted until exact-head successful E2E/CI.

### 2026-11-12 — source contract candidate: six teacher-route gap dispositions

- Four routes with the SAME verified domain writer and existing authenticated cross-interface tests are proposed for `mcp`: manual invoice payment record, manual-payment correction, single private-calendar attendance, and bulk private-calendar attendance. Positive/negative shared SQL, replay and tenant tests are in `e2e/parity-billing-lifecycle.spec.ts`, `e2e/parity-calendar.spec.ts`, and `e2e/parity-calendar-attendance-transaction.spec.ts`. These are route-behavior parity classifications, **not** approval of external-provider exactly-once mail or the canonical-lesson B5 cutover.
- Two previous gaps are `partial`, with honest exceptions: 38 ordinary studio-policy keys are website/MCP-editable, but raw AI/Stripe credential insertion stays browser-only; spreadsheet suggest uses one strict source sample schema with local-only default and explicit AI consent, but positive synthetic provider acceptance remains incomplete. These partial statuses still block strict release.
- The source inventory remains exhaustive; **the classifications are candidate assertions until exact-head CI + authenticated OAuth/browser E2E are both green.** Do not mark added new cases accepted early or merge/close OpenSpec.

### 2026-11-12 — eight additional source-reviewed route families proposed for MCP parity

- Invoice detail/draft edit/delete, invoice send/preview, and invoice void are now individually mapped to current shared website/MCP domain services and named authenticated tests. Invoice void additionally uses a new receipt-based `ccp_invoice_void` transaction in the fresh-only schema: it locks the teacher-owned invoice, serializes against manual settlement, refuses payments/active Stripe checkout and issued prepaid credit packages, and handles identical cross-interface retries without double-voiding.
- Five current calendar route families — private lesson notes, lesson detail/update/delete, lesson list/create, recurrence slot detail/update/delete and slot list/create — have matching named MCP tools, shared service methods, DST tests, private-note checks and a new explicit foreign-tenant browser/MCP denial scenario. This **does not** close B5: the independently writable old `lessons`/`attendance` occurrence tables still exist and require the full canonical cutover.
- The source route registry now has **40 mcp / 19 partial / undefined gap** across 59 teacher routes. These are **candidate route-behavior parity assertions** awaiting exact-head successful CI/E2E including the new tests. The strict release gate remains blocked by remaining partial routes, canonical lesson duplication, and live/synthetic provider obligations.

### 2026-11-12 — nine further tested route surfaces proposed for MCP parity

- Reviewed owner-scoped shared service paths and named authenticated browser↔delegated MCP cases; nine distinct teacher routes are proposed as `mcp`: skill-dimension list/create; student roster and atomic family create; plan list/get/commit; material list/get/create/update; material lifecycle; material relations; assignments/attempt/review; deterministic coach briefing; and reviewed FEN/photo vision preview.
- Unlike a claimed matching tool name, the respective `e2e/parity-skill-dimensions-lifecycle.spec.ts`, `e2e/parity-students.spec.ts`, `e2e/parity-training-plans.spec.ts`, `e2e/agent-mcp.spec.ts` and `e2e/parity-lichess-puzzle.spec.ts` run real website and delegated MCP operations. Tests cover revision/replay races, tenant or scope denial where applicable, verified human chess evidence, private note redaction and synthetic external-provider consent.
- Source inventory now proposes **49 mcp / 10 partial / 0 missing** teacher-route families. All newly promoted families must pass the exact-head CI and authenticated E2E gate before being final acceptance. Provider real-world test obligations and B5 current calendar dual-writer remain OpenSpec blockers; do not archive or merge.

### 2026-11-12 — frozen coaching roster current route candidate acceptance

- Website GET and confirmed POST, MCP `ccp_v1_sessions_roster_preview`, `ccp_v1_sessions_roster_correct` and `ccp_v1_sessions_roster_revisions_list` share domain methods. Existing acceptance covers completed-lesson revisioned correction, replay, historic private attendance, audit and consent; new `PARITY-session-roster-foreign-tenant` exercises real foreign-owner sessions via both clients and confirms no mutation after denial.
- Proposed route promotion to `mcp` after exact-head E2E, leaving **50 mcp / 9 partial / 0 gaps**. This is NOT B5 canonical calendar convergence or an excuse to weaken historical evidence blockers.

### 2026-11-12 — unresolved Stripe checkout protects invoice regeneration (unverified candidate)

- Draft regeneration now fails closed when a Stripe checkout ID, URL or payment intent is present, both in the shared website/MCP service and the database transaction lock; it will not silently change items while an old family payment link may still be payable.
- Added an independent cross-interface and authenticated SQL regression `PARITY-billing-regenerate-checkout-reconciliation` to verify 409/CONFLICT and unchanged invoice lines. This is **not** provider-level checkout reconciliation, and it does **not** close finance parity, canonical lesson cutover, or the OpenSpec.
- **No acceptance sign-off** until exact-head CI, authenticated delegated browser/MCP E2E, security and self-host verification are reviewed. Production database state was not changed.

### 2026-11-12 — first generic coach-gateway write uses MCP SQL writer (candidate)

- Replaced the separately writable website `students.update` PostgREST update with the exact same `agent_coaching_mutate('students.update')` transaction used by delegated MCP `ccp_v1_students_update`. Both require `expectedUpdatedAt` and `idempotencyKey`; the teacher workspace reads each student's revision, and changed terms/stale writes fail instead of overwriting. Removed the duplicate direct `studentsUpdate` service writer.
- Modified current-schema receipt hashing so a transaction request has identical meaning across website and MCP clients independent of `clientId`. The first actor's client ID remains audit metadata, not part of replay equality; secure student notes or names never enter receipt records.
- Added `PARITY-student-basic-edit-revision-replay` with browser→MCP and MCP→browser replay, changed-key/stale/omitted revision denial and persisted search. **Do not mark the entire agent gateway or full student profile route complete:** other gateway writes still use direct services, and archive/guardian/finance changes need their own transaction review.

### 2026-11-12 — owner-scoped workplace/group edit equality (candidate)

- The website coaching workspace now submits `expectedUpdatedAt` and `idempotencyKey` from actual workplace/group list revisions. Basic workplace and class-group website edits execute `agent_coaching_mutate`, the SAME teacher-owned SQL transaction and request receipt used by delegated MCP, instead of independent optimistic-free PostgREST updates. Duplicate application writers are removed.
- Added `PARITY-coach-workplace-group-revision-replay`: browser-first workplace edit and MCP replay, model-first group edit and browser replay, changed-key conflicts, stale revision denial, timezone/policy readback. This follows `PARITY-student-basic-edit-revision-replay`; both remain unaccepted pending exact-head E2E.
- Other generic gateway create/enroll/session actions are still on different writers. The gateway route remains `partial`; do not claim general MCP parity until those actions share one atomic path.
 
### 2026-11-12 — multi-route financial parity batch (code staged; CI deferred until integrated implementation)
 
This independent batch brings three incomplete teacher-business families closer to full website↔MCP parity without narrowing scope:
 
1. **Draft generation:** canonical `ccp_invoice_generation_commit` now stores immutable owner-scoped request receipts in the same transaction as invoice lines and prepaid credit redemptions. Website and delegated MCP accept matching UUIDs; `ccp_invoice_generation_receipt` replays the original invoice IDs before eligibility recalculation. Reusing a request key for a changed period/operation conflicts.
2. **Draft regeneration:** `ccp_invoice_regenerate_atomic` now requires original invoice revision and idempotency key; same-key cross-client retries replay the original result, competing changed revisions roll back, and unresolved Stripe checkout links remain blocked. Website regenerations use the current server-provided revision and retain the retry UUID across network interruption.
3. **Configured checkout:** checkout session persistence is now a tenant-locked `ccp_invoice_checkout_claim` with exact payable balance, current revision, valid Stripe URL, and no rival active link. After a racing provider response, the loser is not allowed to overwrite the winner; the service attempts provider expiry for an unlinked session and fails closed on uncertainty. Synthetic adversarial processor coverage is added.
 
The website billing modal now creates and retains a stable commit key and invalidates stale previews when dates change; the invoice detail UI passes the revision and retains its regeneration key over connectivity errors. Both use the same services and SQL functions as MCP. Source audit and new E2E cover duplicate requests, owner scope, stale edits, provider races, and privacy.
 
**Acceptance is intentionally withheld** until a stable exact-head synthetic CI + delegated OAuth/browser E2E campaign runs. No real Stripe charge, real teacher data, production database or live account was touched. Current `lesson_slots`/`lessons`/`attendance` cutover, broader parity inventory and strict release checks remain blocking. No schema upgrade chain or legacy adapter was added.

### 2026-11-12 — finance parity batch: stable-source synthetic acceptance

On source commit `155cdb014405d3ad25c86c814ceaac29a1da9764`, [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43238134655), [authenticated website/delegated MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43238134567) (**205 passed, five intentionally skipped, zero failed**), [security audit](https://github.com/itshak/ChessCoachPal/actions/runs/43238134563), [self-host Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43238134918) and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43238134615) all completed successfully.

Three distinct new E2E cases `PARITY-billing-generation-receipt-replay`, `PARITY-billing-regeneration-receipt-revision`, and `PARITY-billing-regenerate-checkout-reconciliation` are now accepted at their tested code head. The configured synthetic Stripe `PARITY-configured-checkout-pdf-ledger` also passed its adversarial race checks, but belongs to an existing historical scenario; the additional checkout race index remains unchecked until an independently named test is supplied. The original first candidate had malformed SQL delimiters; later candidate E2E found a strict domain argument propagation bug and inaccurate old revision fixtures. These were corrected in source and reviewed, **not bypassed**. The prior run improved to 204/205 tests with one mismatched receipt assertion; final source `155cdb0` passed 205/205 executed E2E plus five intentionally skipped.

Three routes can now be classified `mcp` in the technical inventory. This does not satisfy entire C3, B5/C2, remaining six partial teacher route families or full historical/new checklist and strict post-merge acceptance. PR #52 stays draft as an implementation slice; do not merge the umbrella change to main or archive until its whole requirements pass.

### 2026-11-12 — further source implementation batches for actual website/MCP parity

Finance source `3325b0` passed 207 authenticated E2E checks; synthetic AI source `95daf7` passed 208; student-delete source `dd311c` passed 209 authenticated E2E; combined head `ea1c810` passed 210 E2E tests. Full combined branch verification and prepublication live-provider checks remain separate.

* PR #52: full multi-page PDF, maximum 512 KiB MCP inline privacy envelope, foreign tenant denial; preview-bound bulk email with explicit approval and a current recipient/amount/revision fingerprint. Actual synthetic SMTP sends remain at most once in cross-client races. Coaching completion panel gains selected-roster reload and ignores superseded fetch errors.
* PR #53: positive optional-AI spreadsheet mapping with fixed CI-only provider, source header grounding and sanitized errors. PR #53 was reviewed/merged into PR #52, **not main**, after all five workflows passed.
* PR #54: current-schema student deletion impact no longer queries deleted resource tables. Browser/MCP tenant-scoped, history-preserving and concurrent-deletion tests staged; waiting E2E before closure.

Candidate catalogue **57/59 teacher routes mcp, two partial**, but neither whole-product parity nor the OpenSpec acceptance requirement has been reached. Do not archive, release or merge main.
**Combined-source acceptance, 12 Nov 2026:** [PR #52 source ea1c8108](https://github.com/itshak/ChessCoachPal/commit/ea1c8108e3442837bdad9a64ff05df07ac35d2e2) passed [210 authenticated browser/MCP E2E tests](https://github.com/itshak/ChessCoachPal/actions/runs/43256956577) (five skipped, zero failed), plus [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43256956966), [security](https://github.com/itshak/ChessCoachPal/actions/runs/43256956336), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43256956228) and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43256956412). This verifies the 7-route family source slice, not complete v0.1.0 or live provider behavior.

### 2026-11-12 — checked source and checklist promotion after corrected evidence audit

**Verified source `e2c55a7` (2026-11-12):** [212 authenticated website/MCP E2E tests passed](https://github.com/itshak/ChessCoachPal/actions/runs/43275932081) (five intentionally skipped, zero failures). [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43275931908), [security](https://github.com/itshak/ChessCoachPal/actions/runs/43275932040), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43275931957), and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43275931913) are green on the identical source.

Added real browser/MCP parity tests for student chess-history reads and revision-safe basic updates; bound `students/[id]` route evidence to the broad student route suite so CI requires executable invocation of every claimed tool. The checked matrices now reflect actual, unique, passing source tests (**89/93 historical, 21/23 additional**). **57/59** teacher route families accepted; `/api/agent/v1` and `/api/settings/policy` remain partial. Mandatory canonical calendar/attendance one-writer cutover, remaining provider exception/handoff, strict parity and merged-main acceptance remain blockers, so all umbrella Stage D/E checkbox claims remain open.

### 2026-11-12 — policy secrets secure handoff: first positive provider/browser evidence

Synthetic source `930a596` passed [213 authenticated website/MCP E2E tests](https://github.com/itshak/ChessCoachPal/actions/runs/43278869225), five intentionally skipped, zero failed; CI, security, Compose and backup/restore also green. Tool `ccp_v1_studio_credentials_handoff` returns trusted-origin authenticated AI/Stripe setup URLs, with no raw key input or model-visible credential. The actual existing browser payment modal/optional AI form persists encrypted provider keys; MCP supports redacted configured status and clearing after login. This implements the narrowly approved C5 exception, not a loophole for unrelated teacher data CRUD. Candidate route-family inventory is **58/59** (legacy gateway partial). Standalone second checkout-race and spreadsheet-default tests were added for previously duplicated/pending scenario references; keep them unchecked until exact new head E2E completes. Strict v0.1.0 release still blocked.
