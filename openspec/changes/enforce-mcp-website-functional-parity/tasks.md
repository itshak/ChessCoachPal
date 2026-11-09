# Checklist — full website ↔ MCP equality

**Status:** Active. Do not archive until every item and the [93 acceptance scenarios](../../../docs/MCP_WEBSITE_PARITY_CHECKLIST.md) pass against merged main.

## A. Foundation and first slice
- [x] A1. Accept ADR-0003; cross-reference OpenSpec, contribution policy and current baseline.
- [x] A2. Add PR teacher-surface change guard, strict 93-case release validation and evidence references for complete routes, with CI unit tests.
- [x] A3. Share website report domain service with MCP `ccp_v1_reports_workplace_summary`; support JSON, CSV and text.
- [x] A4. GitHub synthetic OAuth/website E2E: same report results, group teacher minutes once, invalid ranges and cross-teacher denial; merge on green CI and record SHA/runs.

## B. Remaining parity gaps
- [ ] B1. Workplaces: full policies, membership lifecycle, historical projections, material preferences.
- [ ] B2. Students: full roster pagination, profile, notes, aliases, strength 1–10, ratings, skills, family and edit/clear/archive actions.
- [ ] B3. Schedule: recurring slots, makeup and ad-hoc lessons, frozen roster, history/corrections, DST, bulk attendance.
- [ ] B4. Chess materials: student and workplace full learned/assigned/linked history and source context.
- [ ] B5. Families, events, notifications, parent approvals and calendar/communication workflows.
- [ ] B6. Billing/invoices/credits/payments, scoped approvals and safe redaction.
- [ ] B7. Settings/policies, data transfer, spreadsheet imports and reviewed exports.
- [ ] B8. Zero missing or partial teacher-business route/field/operation; documented narrow exceptions only.

## C. Acceptance
- [ ] C1. All 93 detailed browser↔MCP behavior/security cases verified and checked individually with automated evidence.
- [ ] C2. Fresh synthetic CI, full E2E, typecheck/unit and relevant security/Compose checks green.
- [ ] C3. Strict parity gate passes on merged main; status records exact SHA and Actions links.
- [ ] C4. Archive only after B/C; retain separate real-client v0.1.0 final manual release sign-off.

A1–A4 are accepted against merged main; B/C and the 93 detailed behavior scenarios remain open. **Phase A evidence (merged main):** [PR #20](https://github.com/itshak/ChessCoachPal/pull/20), commit [759f104](https://github.com/itshak/ChessCoachPal/commit/759f1042c351efba1fc7293bf0da48e71612bb23); [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42481967664) passed source audit, PR-guard tests, TypeScript, 342 unit tests, Docker and Compose; [fresh synthetic E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42481967709) passed (26 browser tests); [restore](https://github.com/itshak/ChessCoachPal/actions/runs/42481967696), [self-host](https://github.com/itshak/ChessCoachPal/actions/runs/42481967682), and [security](https://github.com/itshak/ChessCoachPal/actions/runs/42481967641) passed.

## Phase B partial delivery (not B1–B8 acceptance)

**Additional verified increment:** [PR #21](https://github.com/itshak/ChessCoachPal/pull/21) merged at [5a52fde](https://github.com/itshak/ChessCoachPal/commit/5a52fdeb47e11b0498f1d983adc2adb86bd97978). [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42485032664), [OAuth/browser E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42485032822), [self-host](https://github.com/itshak/ChessCoachPal/actions/runs/42485032685), [restore](https://github.com/itshak/ChessCoachPal/actions/runs/42485032699), and [security](https://github.com/itshak/ChessCoachPal/actions/runs/42485032780) all passed. E2E needed one retry after a transient Supabase Docker port collision on the shared runner; the subsequent full suite passed.

Dashboard summary and teacher notifications list/mark-read are now backed by the same website/MCP service. Registry: 3 MCP-covered route surfaces, 3 partial, 37 gaps. **B5 remains unchecked** because events, guardians, communications and broader notifications still need parity. No additional 93-case checklist sign-off has been granted.

## Phase C: teacher skill dimensions and assessment history increment

Shared website/MCP service now supports teacher-owned 1–5 chess skills, historical reads, append-only ratings, and cautious delete-impact previews. New teacher defaults use chess terms. Routes remain **gaps until CI + E2E proves parity and idempotency requirements are reviewed**; this increment alone is not B2/B8/C acceptance.

## Phase D: guardians/contact lifecycle increment

Website and MCP now invoke the same tenant-scoped family service for list/detail/create/update/delete and token rotation; tools redact sensitive contacts and portal secrets, and deletion has explicit impact preview. This is **not B5 completion**: events, email, cross-request idempotency, atomic child/roster mutation, and release-level cases remain outstanding. PR and merged-main E2E links must be recorded after CI.

## Phase E: legacy private calendar parity increment

Recurring lesson slots and ad-hoc/make-up private lessons now use shared teacher-scoped services and nine MCP tools for list/create/correct/delete. Historical notes and attendance remain protected when slots change. Reconciliation with group teaching_sessions, legacy attendance/note/email behaviors, concurrent writes and comprehensive DST/replay evidence are still **open**; this is **not** completion of the 93-case release gate.

## Phase F: legacy attendance/notes increment

Teacher-scoped private attendance, cancellation notice, explicit family-email actions, bulk marking and teacher-private/family-facing lesson notes now share service code between website and five MCP operations. Synthetic tests verify no-email defaults, notes privacy and cross-tenant protections. **Not completed parity**: idempotent external notifications, real-world delivery checks, DST/cancellation rules, all historical correction cases and 93-case release gate remain open.

## Phase G: event scheduling and invitation increment

Teacher-owned events, assigned students, RSVP summaries, delete-impact preview, and explicit invitation emails now share browser/MCP service code. Seven MCP operations and synthetic delegated OAuth tests validate core list/detail/edit/delete flows without sending email. **Unresolved:** cross-request idempotency, transactional roster updates, exactly-once email, concurrency, and full case-matrix acceptance. This does **not** archive or complete the change.

## Phase H: studio policy editor increment

Shared website/MCP policy service supports scoped read and editing of cancellation, billing, rates, timezone and communications via the same validation logic. The two MCP operations have explicit confirmation, a narrow non-secret input schema and redacted output; credentials and payment QR must be set in a secure website flow. Full parity, idempotent policy updates, settings export/import and the strict acceptance checklist remain outstanding.

## Phase I: billing visibility/accounting increment

Website and MCP invoice details now share a tenant-scoped reader; three MCP tools provide paginated invoice list, redacted invoice details and explicitly confirmed CSV payment export. The browser CSV endpoint uses the same paginated export implementation and escapes spreadsheet formulas. **Not full parity**: all invoice writes, checkout, PDF, payment edits, credit packages and multi-record billing operations remain blockers, as does the strict parity checklist.

## Phase J: draft invoice and payment communication increment

Shared website/MCP invoice service now supports changing draft notes/line items, voiding and deleting eligible invoices, plus explicitly confirmed email sending. Four MCP tools and delegated OAuth tests compare the financial state through website readback; no emails are sent in CI's synthetic mutation tests. **Unresolved:** transactional multi-line replacements, idempotency/exactly-once email, checkout, refunds/payment settlement and other billing/credit actions. Keep parity strict blocked.

## Phase K: OAuth connection administration increment

Website and MCP now call the same owner-scoped service to list active grants and revoke a chosen grant. Read-only clients cannot revoke; tokens and sessions never appear in the tool response, and delegated OAuth E2E confirms immediate access loss after revocation. Browser consent and original OAuth authorization flows remain explicitly secure-browser-only. **Full route/behavioral parity is not accepted** until the strict checklist passes.

## Phase L: prepaid chess lesson credits increment

Teacher-owned credit packages (including pending/current balances), draft purchase invoice creation, expiry correction and redemption returns share website/MCP business services; four new scoped tools require explicit confirmation for writes. Synthetic browser/OAuth tests verify package/invoice linkage, balance equality and expiry updates without charging or emailing families. Remaining risks: cross-entity transactional purchase, replay safety, financial statement reconciliation, bulk credit application and full 93-case matrix. Do not archive.

## Phase L: manual payment reconciliation increment

Teacher-scoped manual payment entry and mistaken-payment deletion share a domain service between website and MCP. Two confirmed tools are included. The MCP record operation requires an idempotency key and uses per-invoice unique external IDs to avoid duplicate requests; E2E covers same-key replay, changed-payload conflict, website readback and removal. **Not completion:** payment/invoice transaction atomicity, concurrent edits, Stripe side effects, remaining invoice-generation/checkout flows, and all 93 strict parity cases remain open.

## Phase M: studio backup/import secure parity increment

Website backup/restore and three MCP transfer actions share the same allowlisted transfer implementation. MCP exports deliberately omit family portal credentials and provider/OAuth secrets; a sanitized backup imported later generates fresh guardian portal tokens. The MCP importer requires a preview digest and explicit user confirmation; E2E checks export redaction and website readback after an import. **Not full parity:** large exports require secure browser handoff, import lacks transaction-level rollback and complete replay/impact checks, and the strict 93-case acceptance remains blocked.

## Phase N: spreadsheet onboarding parity increment

Teacher-scoped CSV/XLSX parsing, column mapping, previews and family/student importing now share website/MCP implementations. Four MCP operations support base64 input, deterministic mapping, opt-in external AI suggestion and explicitly confirmed writes. Synthetic OAuth E2E compares website multipart parsing and normalized preview, then imports a student and verifies website readback. **Unresolved:** transaction-level rollback for multi-family imports, exact quota reservations, idempotent import receipts, file-format edge cases, external-provider error/privacy scenarios and the full strict 93-case signoff. This is not OpenSpec completion.

## Phase O: invoice generation, checkout, PDF and bulk billing adapters

All remaining teacher-business route **surface names** now have corresponding MCP operations: invoice period preview/commit, draft regeneration, owned PDF generation, explicitly approved Stripe checkout link, and bulk send/delete/void. The website uses the same billing domain services; synthetic delegated OAuth E2E compares preview, generated invoice state, regenerated values, PDF signatures, provider guard and bulk state. **Not functional parity acceptance:** invoice/credit atomicity, idempotent side effects, provider outage/retry/receipt behavior, partial bulk send, concurrent updates, 93-case release checklist, and historical legacy/session reconciliation remain unresolved. These route entries stay partial pending stronger proof and strict release gate stays blocking.

## Phase P: chess learning configuration and history corrections

The original website `agent/v1` chess category create/rename, observation correction, and saved Lichess study resource edits now have four matching delegated MCP tools calling the same teacher-scoped learning services. OAuth/browser E2E demonstrates create/update, reading browser-confirmed approval provenance, and resource readback. Approval itself stays browser-only to prevent AI from self-verifying its proposed observations. **No blanket completion:** every legacy gateway action, approval provenance against autonomous model self-approval, replay/expected revision validation and cross-tenant edits require full scenario signoff. The active OpenSpec and strict gate remain blocked.

## Phase P: teacher-attested material coverage and error correction

Add new teacher-scoped `chess_material_progress` evidence ledger with explicit `assigned/taught/completed` states, link/student/workplace/frozen-session ownership validation in SQL trigger, append-only claims, UUID replay safety, revision-checked retraction and audit preservation. A shared service powers a new website history editor on student/learning pages and three MCP tools; delegated OAuth E2E compares JSON with the browser, records/replays/voids, rejects stale corrections and cross-tenant UUIDs. The new `/api/coaching/materials` route is individually supported by an executable E2E case. **Do not count unrelated old URL links as taught**; no automatic inference of mastery. The backlog still includes complete legacy/history reconciliation, cross-page group-deduped aggregate material reports, provider Lichess study/chapter searches/publishing and the rest of the 93-case acceptance matrix. **Full OpenSpec parity remains incomplete.**

## Phase Q: legacy/private and coaching/group lesson history reconciliation

New shared, read-only `teacherUnifiedLessonHistory` service and `ccp_v1_lessons_history_unified` tool combine both legacy `lessons` and current `teaching_sessions` without silently assigning a historic private lesson to today's workplace. Exact student/start/duration overlaps are **flagged, not deleted**, and instructor booked/evidenced minutes use an interval union so a three-student group lesson and its legacy duplicates do not multiply the teacher's time. Teacher students/coaching pages show the same bounded history and warnings. Unit tests cover duplicates, overlap, booked-versus-evidenced distinctions; delegated OAuth E2E compares website output and blocks a foreign workplace. **Still open:** actual correction/migration of legacy data, incomplete historical rosters, ambiguous near-overlaps, per-workplace reconciliation and every other strict 93-case acceptance requirement. Do not archive yet.

## Phase Q — merged unified legacy/coaching lesson history increment

[PR #42](https://github.com/itshak/ChessCoachPal/pull/42) merged as [d93b6ef](https://github.com/itshak/ChessCoachPal/commit/d93b6efb0c6f96d1f07e48640ee8e342af4e891b). Shared, bounded website/MCP lesson history now distinguishes old private lessons from coaching sessions, flags likely cross-model duplicates without deleting them, unions overlapping instructor minutes, and never guesses historic workplace attribution. PR-head GitHub CI, E2E, security, self-host and backup/restore workflows passed (see STATUS.md).

**No full acceptance:** Current registry = 43 route families have tools, 5 verified, 8 partial, 32 gaps. **0/93** detailed behavior/security scenarios are signed off. Cross-model mutations, report/material aggregates, transactionality and replay, external side effects, student lifecycle, and cross-tenant test evidence remain unresolved. Normal CI does not replace strict parity. Remain ACTIVE until the strict gate and complete checklist pass on merged main.

## Phase R: teacher-owned student archive preflight (PR #44, pending validation)

Site and MCP now share read-only archival commitment preflight. Active recurring slots, future private lessons, scheduled direct/group lessons (including frozen rosters), and live group memberships block archive; lookup failures are not silently treated as zero. The website requests a preview before confirmation; MCP has a bounded read tool; synthetic OAuth E2E compares both and denies other tenants. Active student count failures now fail closed. **B2/C remain unchecked**: serializable active-quota reservations, permanent-deletion preview, all 93 cases and merged-main evidence remain outstanding. Do not archive.

## Phase S: enforce named browser/MCP acceptance evidence (PR #44)

Checked checklist rows now need a distinct, named Playwright test (`e2e/*.spec.ts#PARITY-id`) that actually invokes MCP and a website API and makes assertions. Unit tests reject unanchored evidence, missing transports, and unsafe paths. This is a source audit, not proof that E2E ran or parity is complete; all 93 boxes remain unchecked and the OpenSpec stays active.

## Phase T: full-filtered material aggregates (PR #44, awaiting CI)

Added shared student/workplace/session material summary across the entire filtered ledger (up to 5000 records), not merely the visible page. Read-only MCP aggregation and website GET share the same service; dashboard/editor shows assigned, taught and completed separately. Group session/material/stage combinations are deduplicated for teacher totals; repeated claims and individual student coverage remain separately visible. Concurrent pagination drift returns an explicit error, not truncated numbers. Unit and synthetic OAuth/browser tests added. **B4 remains unchecked** pending all imported legacy sources, provider chapter operations, and full 93-case signoffs.

## Phase U: shared student deletion impact and unlinked removal (PR #44)

Owner-scoped website and delegated MCP now share a delete-impact preview across teaching, roster, progress, material and credit references. Ordinary permanent deletion accepts only unlinked profiles with explicit confirmation and the reviewed revision; historical records block it in favor of archive. OAuth synthetic test covers website/MCP equality, foreign tenant, dependency denial, missing approval and successful unlinked deletion. Database-level concurrent dependency prevention and lawful erasure of historical records are still open; no B2/B8/C signoff, do not archive.

## Phase R: race-safe student removal guard (PR #44, pending review)

The website and delegated MCP deletion preflight remains advisory. Added a PostgreSQL `BEFORE DELETE` trigger which rejects ordinary authenticated direct removals if a student has any of the 12 linked teaching, class, workplace, observation, material, event or financial record types; an underlying FK cascade can no longer erase a newly linked record between preview and deletion. Protected privileged administrative cleanup remains separate. The end-to-end test inserts a membership *after* a clean deletion preview, asserts that direct database deletion is rejected, verifies both website and MCP reject the stale deletion, and then removes the membership before completing a safe empty-profile deletion. **This does not complete B2 or B8**: quota reservation concurrency, other deletion paths, and the complete 93-case matrix remain outstanding. CI, synthetic E2E and all release checks must pass before considering this increment accepted.

## Phase S: workplace enrollment removal parity (PR #44, pending review)

Added a confirmed `ccp_v1_workplaces_unenroll` command and website `workplaces.unenroll` action invoking one teacher-owned service. PostgreSQL blocks deletes with live group membership or scheduled future direct lessons instead of silently cascading group-enrollment rows. Existing frozen session participants and teaching history remain immutable. The synthetic delegated OAuth E2E round-trips website and MCP enrollment/removal, proves repeat convergence and cross-tenant denial, and asserts a blocked live group cannot be removed from its workplace by either surface. **This is one B1 increment, not completed parity**; other lifecycle/history/corrective actions and 93-case signoffs remain outstanding.

## Phase T: atomic hosted student quotas (PR #44, pending test verification)

A `BEFORE INSERT/UPDATE/DELETE` database trigger serializes every active-student reservation on a teacher row and rejects concurrent overcapacity writes, including direct SQL, imports and reactivations. Only trusted server onboarding stores hosted deployment mode and cap, and teacher JWTs cannot tamper with counters or plan. Expired entitlement demotion has a tightly scoped RPC. Direct database archiving now checks future lesson and active group commitments. **B2 and B8 stay unchecked** until transactional imports, full scenario signoff and merged-main tests prove closure; do not archive.

## Phase U: transactional spreadsheet import and replay receipts (pending verification)

Replaces the row-by-row partial-success importer with a single tenant-scoped PostgreSQL transaction: teacher-row locking, student-name/archived dedup, family creation/reuse, capacity reservation, and keyed receipt are all committed or rolled back together. Website and MCP call the same RPC; a normalized-payload derived default retry key and optional explicit idempotency key reject changed-payload replays. The E2E suite must prove full rollback on quota conflicts, safe rerun, no portal credential exposure and cross-teacher denial. **B7 and the 93-case matrix remain unchecked** pending exhaustive transfer/import/export validation and merged-main acceptance.

## Phase V: atomic ad-hoc sessions (pending full acceptance)

Shared MCP `ccp_v1_sessions_ad_hoc_create` and browser `sessions.createAdHoc` call a single authenticated tenant-scoped RPC to create 2–50 student one-off sessions without permanent class groups. The database reserves teacher time under an advisory lock, atomically inserts a frozen roster and unmarked attendance, and rejects changed-request UUID replays. Direct API clients cannot write the special roster_mode column. Per-scenario browser/MCP and group-roster tests remain necessary; this is not full B3/C signoff.

## Phase W: atomic invoice draft line edits (pending PR verification)

A tenant-authorized SQL RPC locks the draft invoice and validates all replacement lines, lesson ownership, prepaid-credit restrictions, notes and optional revision before mutating any data. It deletes/recreates line rows, updates subtotal and notes, and commits or rolls back as a single transaction. Website and MCP use the exact shared service; no external payment/email side effects happen here. B6 remains unchecked until other invoice regeneration, payment settlement, checkout and communication transaction/replay cases pass in merged main.

## Phase S: reconcile already-executed evidence without waiving release gates (PR #44)

Reviewed the browser/MCP Playwright suites already present on the PR branch and credited **eight independently named, executed scenarios** (categories lifecycle; observations read/propose; saved resource list/edit/unlink; confirmed payment reversal; invoice void/delete; studio policy), all on [successful delegated E2E run 42701196373](https://github.com/itshak/ChessCoachPal/actions/runs/42701196373) at `39745a8`. The checklist moves from **51/93 to 59/93**; **34 behavior/security cases remain unchecked**. The website/MCP route registry is unchanged at **5 verified / 8 partial / 32 gaps (45 teacher routes)**. This is an evidence correction, not implementation of those still-unverified behaviors. All B/C completion tasks, OpenSpec archive, release and merge remain **blocked**, pending fresh end-to-end and strict verification on final PR head and merged main. Do not silently promote unfinished route entries to verified.
