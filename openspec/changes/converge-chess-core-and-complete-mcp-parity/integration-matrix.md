# Agent integration matrix — source ownership and remaining parity

**This is a work inventory, not evidence of completion.** At proposal time, PR #44's source registry held 53 teacher-business route families: 23 `mcp`, 11 `partial`, 19 `gap`. Its checklist prose instead said 24/10/19. **The implementing agent must reconcile that discrepancy first**. Do not edit counts to make them match without evidence. The final inventory is based on the final code, including routes added by PR #48/#49 and canonical model work.

## 1. Which implementation owns what?

| Concern | Candidate source | Canonical result and implementation rule |
| --- | --- | --- |
| Student identity, names, ratings, archival, quotas | Main + PR #44; student-first spec #47 | One teacher-owned `students` entity, aliases, rating/skill history and validated lifecycle; remove fictitious adult-family requirement without orphaning guardian operations |
| Contact/guardian/payer | Current student-first design | One optional permission-scoped contacts, guardian and payer domain, no prior family data adapter |
| Group and private/ad hoc lessons | Canonical lesson occurrence | A single actual occurrence with frozen roster and teacher duration; no dual completed-lesson writer or earlier-schema conversion |
| Conversation, aliases, exact chapters | `support-conversational-lesson-and-lichess-workflows` + PR #44 | One identity-resolution + preview/confirmed commit workflow reused by canonical lesson service; ambiguity and missing time fail without side effects |
| Typed learning materials | Canonical typed catalog | `learning_materials` + chess-specific subtypes are the only material records; no `chess_learning_resources` catalog or prior-material mapping |
| Assignments, attempts and reviews | PR #49 (stacked on #48) | Preserve per-student assignment IDs and distinct teacher review; complete plans/goals/corrections/reports/briefing via web and MCP |
| Compensation/finance | Main/PR #44 billing + canonical session attendance | Retain invoice, manual pay, credit, PDF, checkout, reports and rates; source invoiceable activity from canonical session projection, no duplicate charges |
| Events, guardian portal, notifications | PR #44 + new contact role/permission model | Keep optional operations and privacy approvals; reconcile event membership and guardian authorities without unrelated history deletion |
| Lichess read/write and image-FEN | PR #44 + earlier conversational OpenSpec; typed puzzle/study in #48 | Keep supported study read/preview/publish workflows; store verified material identities and remote chapter IDs in canonical catalog; safe provider retries |
| Auth/account, hosted subscription | Existing browser flows and PR #44 handoff work | MCP initiation/status where applicable, website only for secret entry or card information; no generic business-operation exemption |
| Reporting/export/import | Current teacher data services | Only current typed material and lesson references, and one current unversioned backup shape; no previous-schema adapter |

## 2. Exact current partial/gap route families to close or replace with tested canonical equivalents

Route paths below are relative to `app/api/`. Each row describes the remaining proof and implementation need, **not** an instruction to retain obsolete duplicate database writes. Every supported website action must have a corresponding tested MCP service; any replaced route must have an explicit successor and tested user-visible functionality.

| Path | Registry status | Integration work / missing parity proof |
| --- | --- | --- |
| `agent/v1/route.ts` | partial | Resolve legacy command variants and shared chess skills, observations, workplace/session operations; reject agent self-approval; mapping/capabilities completeness |
| `billing/generate/route.ts` | partial | Canonical-lesson period/rate/attendance source, atomic invoice generation, simultaneous calls and same-key replay |
| `billing/invoices/[id]/checkout/route.ts` | partial | Guard configured Stripe checkout, provider failure/retry, no card data in MCP, secure browser redirect |
| `billing/invoices/[id]/mark-paid/route.ts` | gap | Transactional invoice settlement, manual payment vs provider webhook race and readback |
| `billing/invoices/[id]/payments/[paymentId]/route.ts` | gap | Confirmed manual payment removal, negative/foreign cases, atomic financial audit and replay |
| `billing/invoices/[id]/pdf/route.ts` | partial | PDF bytes/base64 or secure large-file handoff; tenant isolation, financial redaction, size limits |
| `billing/invoices/[id]/regenerate/route.ts` | partial | Atomic replacement of financial lines, rate/history edits, stale revision and retry |
| `billing/invoices/[id]/route.ts` | gap | Full invoice read/edit/clear/delete behavior and transaction/replay invariants |
| `billing/invoices/[id]/send/route.ts` | gap | Exact recipients/amount preview, explicit email confirmation and exactly-once email receipt |
| `billing/invoices/[id]/void/route.ts` | gap | Credit guards, atomic void, concurrent payment/void and immutable audit |
| `billing/invoices/bulk/route.ts` | partial | Partial-success semantics, recipient previews, per-invoice receipts and external retries |
| `coaching/sessions/[id]/roster/route.ts` | partial | Frozen roster historical correction, linked financial/material effects, foreign records, revision/replay |
| `events/[id]/route.ts` | gap | Atomic roster/RSVP update and deletion, concurrent revision/retry, consent-aware membership |
| `events/route.ts` | gap | Atomic create/list, all relevant writable fields, ownership and replay |
| `guardians/[id]/rotate-token/route.ts` | gap | One-use/revision-safe token rotation, no raw token to model, role/consent migration and retry |
| `guardians/[id]/route.ts` | gap | Canonical contact link/update/remove, child history/portal permission preservation, foreign denial |
| `guardians/route.ts` | gap | Optional contact/guardian create/list and adult no-family flow; exact permissions and atomicity |
| `import/spreadsheet/suggest/route.ts` | gap | Provider opt-in redaction, deterministic/no-AI fallback, owner scope, failure and retry |
| `schedule/attendance/bulk/route.ts` | gap | Canonical session/roster attendance; partial result, revisions, consented notices and retries |
| `schedule/lessons/[id]/attendance/route.ts` | gap | Student-specific attendance/clear/historical correction via canonical occurrence |
| `schedule/lessons/[id]/note/route.ts` | gap | Teacher-private vs optional guardian-visible notes; no accidental email/secret exposure |
| `schedule/lessons/[id]/route.ts` | gap | Correct/reschedule/cancel/private/ad-hoc lesson with canonical time, audit and side-effects |
| `schedule/lessons/route.ts` | gap | List/create ad hoc and recurring occurrences; dedupe, local time, group/private records |
| `schedule/slots/[id]/route.ts` | gap | Update/disable/delete recurrence without rewriting completed lessons; DST/holiday semantics |
| `schedule/slots/route.ts` | gap | List/create recurrence and resolve active commitments with safe paging/quota |
| `settings/policy/route.ts` | gap | Complete non-secret field get/update/clear, rates, provider settings and approved secure handoff |
| `skills/dimensions/route.ts` | partial | Skill create/list field behavior, dedup/reorder and cross-tenant/replay |
| `students/[id]/route.ts` | partial | Profile fields, archive/reactivation/quota and deletion impact after contact/lesson canonicalization |
| `students/route.ts` | partial | Adult create with no synthetic family; search, active/archived pagination and concurrent quota |
| `lichess/puzzles/preview/route.ts` | partial | Positive image→FEN proposal and full reviewed FEN→PGN path, unknown state, provider failure and fallback |

**Scope of verified routes:** 23 other teacher route families were tagged `mcp` at proposal time. They still must be rerun against final integrated schema and services, including credits lifecycle, reports, materials evidence, unified history, studio transfer, notification/connection management, Lichess study read/write and profile settings. Do not implicitly exempt an already verified route when its dependencies change.

## 3. Six currently unchecked cases — closure or explicit secure-scoped behavior

| Existing checklist area | Target evidence in the final integrated application |
| --- | --- |
| Scheduling across local time, DST, holiday/workplace rules | End-to-end recurrence and confirmed edits in at least two relevant IANA zones, ambiguous/nonexistent local time rejection, holidays, frozen roster/history and cross-interface equality |
| Image-derived FEN and approved puzzle PGN publish | Positive provider-mock image proposal, editable chessboard/FEN preview, unknown castling/ep/turn review, approved PGN import, 64 chapter rollover, retries and provider-error report |
| Configured checkout/PDF/ledger | Synthetic configured checkout provider, confirmed secure link, PDF bytes/large-file handoff, post-payment ledger parity and no real card charge |
| Display name, email, password, MFA | Ordinary display profile via MCP + web; browser-only reauthentication/password/MFA with narrowly scoped MCP safe start/status and no credential disclosure |
| Hosted subscription portal/checkout | Authenticated secure browser handoff with MCP safe initiation/status; no payment-card handling through chat |
| Exhaustive field/action/route coverage | Generated explicit page/component/API+direct-write→domain→MCP field/action map, signed E2E per changed operation, zero unmapped supported fields |

Two more release safeguards: (a) do not delete a checked test because a canonical backend was changed; update it to test the successor, and (b) the existing checklist's mandatory **eight per-feature protocol items** still require individual completion evidence.

## 4. NEW acceptance scenarios from the student-first proposal

The old 93 scenarios remain the historical release matrix. Add separately enumerated, individually named executable PARITY cases (do not silently overwrite existing IDs):

1. Adult student create/edit without synthetic family; absent birthdate/contact remains unknown.
2. Siblings share a consent-limited contact with separate lesson/material histories and no unauthorized payer visibility.
3. Archival/reactivation of an active/returning student preserves canonical history under concurrent hosted capacity attempts.
4. One 90-minute multi-student lesson produces one teacher duration, frozen attendance/roster and per-student observation/material history; retries and corrections do not duplicate it.
5. Fresh private/group lessons use one occurrence with no duplicated teacher minutes or earlier-schema import.
6. Typed game PGN, puzzle FEN, drill and study chapter and external link create/read/edit/delete-impact, validation, relationships, provenance and tenant enforcement.
7. Group-batch homework fans out one assignment per student; attempts, teacher review and goal changes retain distinct source facts, replay and history.
8. One factual briefing reports recent lessons, taught vs assigned materials, reviews, verified assessments and unknowns identically through website and MCP without Lichess/AI.
9. End-to-end teacher chat journey: preview student aliases and exact chapter; commit one two-student 90-minute lesson, two observations and Daniel-only homework; obtain next-lesson briefing with immutable source IDs.
10. Pro/optional feature permissions are consistent in website and MCP, including invoice/guardian/event access and safe credential/payment handoff.

Add more scenarios whenever the concrete changed field/action inventory finds them; this ten-item set is a floor, not permission to omit per-field checks.

## 5. Test evidence mechanics

Every claimed `mcp` route needs a real source mapping, actual MCP tool existence, named executed test, browser/API + delegated OAuth MCP path, persisted readback, scope/foreign-teacher denial and failure/replay tests appropriate to its risk. Existing `scripts/parity-evidence.mjs` and `scripts/mcp-parity-audit.mjs` must remain strict against fabricated evidence. Tests for new scenarios must have unique stable IDs and not reuse a checked historical case title. Keep an auditable table of every route and every scenario with test path, result, commit SHA and workflow URL; include documented reviewed exceptions only for credential entry/authorized separate principals, never use `not-applicable` to hide a teacher action.

## 6. Change-conflict resolution requirements

- **DO NOT REMOVE** implemented Stripe/invoice/credit tools, finances, guardian functions or events merely because #47 moved them to secondary navigation; retain or safely adapt.
- **DO NOT BUILD ON TWO LESSON HISTORIES** as if both were canonical; preserve old records via explicit reconciliation, one occurrence writer and source-tagged projection.
- **DO NOT ADD A SECOND MATERIALS REGISTRY** beside #48. Migrate/link existing evidence and adapt PR #44 services to typed IDs.
- **DO NOT INFER** a child's guardian privileges from being a payer, nor automatically mark a completed assignment as a mastered chess skill.
- **DO NOT CLAIM** server-side chess image inference knows the full game state from pieces alone.
- **DO NOT MARK** any active OpenSpec archived or ready for v0.1.0 until merged-main strict parity and the applicable accepted task evidence exist.
