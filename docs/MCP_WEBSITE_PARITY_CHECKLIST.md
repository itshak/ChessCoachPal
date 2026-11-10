# Mandatory MCP-first website parity checklist

**Current draft PR #44 evidence (2026-11-10; NOT merged):** At [`cf00dff`](https://github.com/itshak/ChessCoachPal/commit/cf00dff6325dde7235d0543e789d1a07501b4269), all five PR-head workflows passed: [authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42902045552) **139 passed, five intentional skips, zero failures**; [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42902045705), [security](https://github.com/itshak/ChessCoachPal/actions/runs/42902045586), [self-host Compose](https://github.com/itshak/ChessCoachPal/actions/runs/42902045593), [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/42902045908). Named PKCE Lichess browser consent plus MCP-safe scope management, history-preserving skill dimension edits and atomic skill-assessment receipts are now executable cross-tenant evidence. The Lichess scope connection/revocation scenario is independently signed: **86/93 verified (seven unchecked)**. Teacher-business inventory now contains **50 routes: 20 fully verified, ten partial and 20 gaps** (30 route families remain unresolved). This is PR-head evidence only; broad provider study/puzzle, payment/provider and security/account operations, exhaustive fields and route-family acceptance, strict merged-main parity, archive and release all remain **BLOCKED**. The latest documentation/inventory commit itself needs fresh test execution.

**Current merged-main snapshot (2026-11-09):** [PR #42](https://github.com/itshak/ChessCoachPal/pull/42) merged as [d93b6ef](https://github.com/itshak/ChessCoachPal/commit/d93b6efb0c6f96d1f07e48640ee8e342af4e891b). All 43 teacher-business route families have named MCP tools, but this is structural coverage only. The registry classifies **5 verified / 8 partial / 32 gaps**, and **0/93** browser/MCP behavior-security checklist scenarios are formally accepted.

**Release gate remains blocked.** Each checked scenario must cite a named executable test as `e2e/file.spec.ts#PARITY-id`, whose title starts `PARITY:PARITY-id` and whose body exercises MCP, website API and assertions. Runtime E2E and merged-main verification remain mandatory. Strict parity currently requires **all 50 teacher-business route families** verified and **all 93 checklist cases** checked. Secure browser-only exceptions are narrowly allowed for password/MFA/OAuth/card entry, not ordinary editable business data. Historical baseline details below describe earlier source revisions, not present coverage.

**Latest evidence:** PR-head [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42523621060), [delegated OAuth E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42523621045), [security](https://github.com/itshak/ChessCoachPal/actions/runs/42523621097), [self-host](https://github.com/itshak/ChessCoachPal/actions/runs/42523621131), and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/42523621103) all succeeded. Postmerge [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42528998607) succeeded; [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42528998666), [security](https://github.com/itshak/ChessCoachPal/actions/runs/42528998631), [self-host](https://github.com/itshak/ChessCoachPal/actions/runs/42528998606), and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/42528998613) also succeeded on merged main. Vercel returned a deployment build-rate-limit status on the PR, so not all third-party checks were green.

**Previous draft PR-head baseline — 2026-11-10:** [`ece2085`](https://github.com/itshak/ChessCoachPal/commit/ece20852197dd20cf17c1bbee1a9a2fed6ababfd) has [128 passing authenticated browser/MCP E2E tests, 5 intentional skips](https://github.com/itshak/ChessCoachPal/actions/runs/42802938648), [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42802938529), [security](https://github.com/itshak/ChessCoachPal/actions/runs/42802938491), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/42802938433), and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/42802938876) all green. Individually verified browser↔MCP cases: **83/93**; **10 unchecked**. Teacher business API route families: **13 verified / 8 partial / 27 gaps (48 total)**. Bulk invoice preview/send/replay acceptance is newly signed from a passing standalone synthetic SMTP E2E. This is **not** zero-gap parity; the OpenSpec remains active, strict release gate fails, and PR #44 must **not** merge or archive until remaining routes, cases, and postmerge validation succeed. This documentation head requires fresh workflows.

**Previous verified PR-head evidence (not merged-main), 2026-11-10:** Commit [`93efef0`](https://github.com/itshak/ChessCoachPal/commit/93efef0eccdfd1ff40eef22ad9c8c6d7740056f5) passed [127 authenticated browser/MCP E2E tests](https://github.com/itshak/ChessCoachPal/actions/runs/42801504865) with 5 intentional skips and zero failures, plus [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42801505182), [security](https://github.com/itshak/ChessCoachPal/actions/runs/42801505373), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/42801504875) and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/42801504885). The Material History panel is now reachable on /coaching, fixing the group-default-study UI regression. Eight independently named previously unchecked browser/MCP scenarios were reviewed and accepted (default-study history and group scope, chess profile strength and provider-ratings history, report RTL/CSV, event invitation send/retry, invoice period/rate regeneration, prepaid credit lifecycle): **82/93 verified / 11 still unchecked**. The API inventory remains **48 teacher-business routes: 13 verified / 8 partial / 27 gaps** because a passing scenario is not equivalent to full route-level parity. **Strict parity remains BLOCKED; do not merge or archive the active OpenSpec.** Fresh tests on the documentation-head commit are still required.

**Historical source-audit baseline and the still-required 93-case matrix follow.**


**Audit baseline:** 2026-11-08 · audited original main `bb3a3fa`, refreshed at merged main `759f104` · **Status: FAIL / release blocked (Phase A report route verified, full parity unfinished)**. This is a review of code contracts, not a claim that all capabilities passed real OAuth execution. The only demonstrated live Codex workflow so far is student/workplace creation and enrollment. Current 32 tool names are from `lib/server/agent-tools.ts`. Phase A parity/tenant tests passed on [merged main](https://github.com/itshak/ChessCoachPal/actions/runs/42481967709); the full 93-case checklist is not approved.

> **Product rule:** ChessCoachPal is MCP/Plugin first. The website is an *optional* visual interface to the same teacher-owned domain services. Every ordinary website-visible **business operation and editable field** requires a matching tested MCP command or a justified secure browser approval path; absence is a product defect, not a “website-only” feature. Do not archive the change or publish the next release while gaps remain.

## Source inventory and automated tests

The [versioned machine-readable inventory](../scripts/mcp-website-parity.json) currently enumerates **68 app/api routes**, **17 teacher pages** and **53 teacher components**. Among **50 teacher-business API route families**, **20 have PR-head verified MCP coverage, ten have partial coverage and 20 still lack full behavioral parity**. Individual actions on a partial/gap route may work; full route acceptance requires all relevant operations, field mutations, security constraints and tests. Browser-only authentication/credential-entry, guardian-authorized portal actions and system routes are classified separately. Historical baseline details below describe earlier revisions, not the current counts.

Run `npm run mcp:parity:audit` to validate that the inventory tracks every actual route/page/component, that listed HTTP methods match code, and that any claimed live MCP tool exists in the real catalogue. This **passes while explicitly reporting gaps** so normal CI stays green. Run `npm run mcp:parity:strict` to require zero missing/partial teacher-business routes; it **must currently fail** and is the GitHub Release publication gate. Strict success is necessary but **not sufficient**: the behavior and security cases below need synthetic database/browser OAuth integration tests and merged-main evidence. Every new feature PR MUST update the inventory and add website↔MCP behavioral tests; a changed route method/new page/new component with no inventory entry fails regular CI.

**Historical prior PR #44 candidate E2E sign-off (2026-11-10):** Progressed from 74/93 at `a95f821` to **82/93 accepted behavior scenarios** at [`93efef0`](https://github.com/itshak/ChessCoachPal/commit/93efef0eccdfd1ff40eef22ad9c8c6d7740056f5) after the [127-pass browser/MCP E2E run](https://github.com/itshak/ChessCoachPal/actions/runs/42801504865). **11 cases remain open, and 35 of 48 route families are still classified partial/gap.** Independently verified scenario acceptance does not sign off those route families or merged-main gates. Do not archive or merge.

## Concrete browser ↔ MCP test cases

Legend in the third column: **Live tool** = present in current MCP catalogue but this exact parity test remains unchecked; **Gap** = absent/incomplete MCP capability; **Protected** = requires narrow scope, explicit confirmation or safe browser handoff. Tick a row only when a test exercises the website action and the same record via authenticated MCP under the same teacher, checks revisions/storage/output, and verifies cross-teacher denial. Some rows are multi-step workflow tests.

### Workplaces / coaching

Website reference: `/coaching, /api/agent/v1`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [x] | List all teacher workplaces and read details | **E2E accepted on PR head:** `e2e/parity-workplaces.spec.ts#PARITY-workplaces-list`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Create workplace with correct timezone/currency | **E2E accepted on PR head:** `e2e/parity-workplaces.spec.ts#PARITY-workplaces-create`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Rename workplace without changing historical reports | **PR-head E2E:** `e2e/parity-workplaces-extended.spec.ts#PARITY-workplaces-rename`; [passing 61-test OAuth/browser suite](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763) |
| - [x] | Edit timezone, locale, currency, validated policy with revision | **PR-head E2E:** `e2e/parity-workplaces-extended.spec.ts#PARITY-workplaces-policy`; [passing 61-test OAuth/browser suite](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763) |
| - [x] | List workplace enrollments | **PR-head E2E:** `e2e/parity-workplaces-extended.spec.ts#PARITY-workplaces-enrollments`; [passing 61-test OAuth/browser suite](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763) |
| - [x] | Enroll student | **E2E accepted on PR head:** `e2e/parity-workplaces.spec.ts#PARITY-workplaces-enroll`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Unenroll or archive student/workplace without rewriting lesson history | **PR-head E2E:** `e2e/parity-workplaces-extended.spec.ts#PARITY-workplaces-unenroll-history`; [passing 61-test OAuth/browser suite](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763) |
| - [x] | List and edit all workplace material defaults/history | **PR-head E2E acceptance:** `e2e/parity-material-defaults.spec.ts#PARITY-workplaces-material-default-history`; [127-pass authenticated browser/MCP run](https://github.com/itshak/ChessCoachPal/actions/runs/42801504865) verifies creation, revision-guarded correction, history, replay and archiving. |

### Students and progress

Website reference: `/students, /students/[id], /api/students`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [x] | List entire student roster without query and paginate | **E2E accepted on PR head:** `e2e/parity-students.spec.ts#PARITY-students-roster`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Search by Hebrew full name, English aliases and nicknames | **E2E accepted on PR head:** `e2e/parity-students.spec.ts#PARITY-students-search`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Create student, canonical full Hebrew name | **E2E accepted on PR head:** `e2e/parity-students.spec.ts#PARITY-students-create`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Rename student (reports preserve canonical full name) | **Passing PR-head OAuth/browser E2E:** `e2e/parity-student-fields.spec.ts#PARITY-students-rename`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Edit inherited free-form level | **Passing PR-head OAuth/browser E2E:** `e2e/parity-student-fields.spec.ts#PARITY-students-level`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Add/edit/remove English and Hebrew aliases | **E2E accepted on PR head:** `e2e/parity-students.spec.ts#PARITY-students-profile-fields`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Read/edit optional birthdate and practice start date | **Passing PR-head OAuth/browser E2E:** `e2e/parity-student-fields.spec.ts#PARITY-students-dates`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Read/edit teacher notes with private-data scope | **Passing PR-head OAuth/browser E2E:** `e2e/parity-student-fields.spec.ts#PARITY-students-private-notes`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Read/edit hourly rates/travel fees | **Passing PR-head OAuth/browser E2E:** `e2e/parity-student-fields.spec.ts#PARITY-students-rate-fee`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Archive/unarchive or review deletion impact | **E2E accepted on PR head:** `e2e/parity-students.spec.ts#PARITY-students-archive`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Manage 1–10 teacher strength and goals/history | **PR-head E2E acceptance:** `e2e/parity-chess-profile-history.spec.ts#PARITY-students-strength-goals-history`; [127-pass authenticated browser/MCP run](https://github.com/itshak/ChessCoachPal/actions/runs/42801504865) verifies 1–10 strength, goal correction and append-only audit across both interfaces. |
| - [x] | Manage Lichess/Chess.com usernames and per-time-control ratings/history | **PR-head E2E acceptance:** `e2e/parity-chess-profile-history.spec.ts#PARITY-students-multicontrol-ratings-history`; [127-pass authenticated browser/MCP run](https://github.com/itshak/ChessCoachPal/actions/runs/42801504865) verifies provider usernames, distinct time controls, teacher-recorded corrections and history. |
| - [x] | Read attendance, lesson notes and existing skill observations | **PR-head E2E:** `e2e/parity-student-teaching-memory.spec.ts#PARITY-students-teaching-memory`; [118-pass browser/MCP suite](https://github.com/itshak/ChessCoachPal/actions/runs/42766290631). Verifies legacy and coaching lesson models, private note gating, attendance and 1–5 assessment history. |
| - [x] | Add/correct dimension skill assessments, preserving 1–5 history | **E2E accepted on PR head:** `e2e/parity-students.spec.ts#PARITY-students-skills`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |

### Groups and classes

Website reference: `/coaching, /api/agent/v1`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [x] | List groups and memberships | **E2E accepted on PR head:** `e2e/parity-groups.spec.ts#PARITY-groups-list`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Create and rename group | **E2E accepted on PR head:** `e2e/parity-groups.spec.ts#PARITY-groups-create-update`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Add/remove group participant with workplace validation | **E2E accepted on PR head:** `e2e/parity-groups.spec.ts#PARITY-groups-memberships`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | View archived group roster without changing history | **PR-head E2E:** `e2e/parity-groups.spec.ts#PARITY-groups-archived-roster`; [118-pass browser/MCP suite](https://github.com/itshak/ChessCoachPal/actions/runs/42766290631). Confirms frozen participants survive live unenrollment and archived student status without historical edits. |
| - [x] | Attach default lesson studies to group/workplace | **PR-head E2E acceptance:** `e2e/parity-material-defaults.spec.ts#PARITY-groups-default-study-scoped`; [127-pass authenticated browser/MCP run](https://github.com/itshak/ChessCoachPal/actions/runs/42801504865) verifies workplace/group ownership, correct edits, invalid link rejection and visible coaching-page editor. |

### Schedule and attendance

Website reference: `/schedule, /api/schedule`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [x] | List/create/edit/disable/delete recurring slots | **Passing PR-head OAuth/browser E2E:** `e2e/parity-calendar.spec.ts#PARITY-calendar-recurring-slots`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [ ] | Resolve local schedule, DST, holidays and student workplace slots | **Gap/protected** — MCP gap |
| - [x] | Create one-off or makeup legacy lesson | **Passing PR-head OAuth/browser E2E:** `e2e/parity-calendar.spec.ts#PARITY-calendar-one-off-lesson-creation`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Create single-student/new group teaching session | **Passing PR-head OAuth/browser E2E:** `e2e/parity-session-operations.spec.ts#PARITY-sessions-standard-creation`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Capture a single ad-hoc lesson for arbitrary 3 students | **E2E accepted on PR head:** `e2e/parity-ad-hoc.spec.ts#PARITY-ad-hoc-three-students`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | List dates/sessions and frozen participants | **E2E accepted on PR head:** `e2e/parity-ad-hoc.spec.ts#PARITY-ad-hoc-mcp-create`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Reschedule or cancel teaching session | **Passing PR-head OAuth/browser E2E:** `e2e/parity-session-operations.spec.ts#PARITY-sessions-reschedule-cancel`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Edit legacy calendar lesson start/end, home visit, status | **Passing PR-head OAuth/browser E2E:** `e2e/parity-calendar.spec.ts#PARITY-calendar-lesson-edit`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Read/record attendance for an individual teaching-session participant | **Passing PR-head OAuth/browser E2E:** `e2e/parity-session-operations.spec.ts#PARITY-attendance-individual`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Record/review bulk legacy attendance with exact roster | **Passing PR-head OAuth/browser E2E:** `e2e/parity-calendar.spec.ts#PARITY-calendar-attendance-bulk`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Edit shared teaching session note | **PR-head E2E:** `e2e/parity-session-edit.spec.ts#PARITY-sessions-title-completion`; [passing 61-test OAuth/browser suite](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763) |
| - [x] | Edit private/shared legacy lesson notes | **Passing PR-head OAuth/browser E2E:** `e2e/parity-calendar.spec.ts#PARITY-calendar-private-shared-notes`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Reconcile legacy lessons and new teaching_sessions (no double counting) | **Passing delegated OAuth/browser E2E:** `e2e/parity-unified-history.spec.ts#PARITY-unified-lessons-reconcile` ([115 tests passed](https://github.com/itshak/ChessCoachPal/actions/runs/42715103997) at `bf7c205`). Preserves both source records and flags exact overlap while counting instructor minutes once. |
| - [x] | Correct completed lesson/roster history with revision | **PR-head E2E acceptance:** `e2e/parity-completed-roster-correction.spec.ts#PARITY-calendar-correct-frozen-history`; [132 passed, five intentional skips](https://github.com/itshak/ChessCoachPal/actions/runs/42882873971) at `b61820b`. Shared website/MCP atomic roster corrections preserve removed attendance in a private audit, reject stale revision/changed-key replay and do not modify live group membership. |

### Chess learning and Lichess

Website reference: `/learning, /coaching, /students/[id]`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [x] | List configured chess skill categories | **E2E accepted on PR head:** `e2e/parity-learning.spec.ts#PARITY-chess-categories`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Create/rename/reorder/delete skill categories | **Authenticated PR-head E2E:** `e2e/parity-chess-category-delete.spec.ts#PARITY-chess-categories-lifecycle`; [passing OAuth/website suite](https://github.com/itshak/ChessCoachPal/actions/runs/42701196373) at `39745a8`. |
| - [x] | Read student chess observations | **Authenticated PR-head E2E:** `e2e/parity-observations-and-links.spec.ts#PARITY-chess-observations-read`; [passing OAuth/website suite](https://github.com/itshak/ChessCoachPal/actions/runs/42701196373) at `39745a8`. |
| - [x] | Propose unverified observation | **Authenticated PR-head E2E:** `e2e/parity-observations-and-links.spec.ts#PARITY-chess-observations-proposal`; [passing OAuth/website suite](https://github.com/itshak/ChessCoachPal/actions/runs/42701196373) at `39745a8`. |
| - [x] | Correct observation and teacher-confirm/approve it | **E2E accepted on PR head:** `e2e/parity-learning.spec.ts#PARITY-chess-observations`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | List saved study URLs linked to student/session | **Authenticated PR-head E2E:** `e2e/parity-observations-and-links.spec.ts#PARITY-chess-resources-list`; [passing OAuth/website suite](https://github.com/itshak/ChessCoachPal/actions/runs/42701196373) at `39745a8`. |
| - [x] | Link permitted Lichess Study/HTTPS material to student/session | **E2E accepted on PR head:** `e2e/parity-learning.spec.ts#PARITY-chess-resources`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Edit/unlink previously attached resource | **Authenticated PR-head E2E:** `e2e/parity-resource-unlink.spec.ts#PARITY-chess-resources-edit-unlink`; [passing OAuth/website suite](https://github.com/itshak/ChessCoachPal/actions/runs/42701196373) at `39745a8`. |
| - [x] | Connect and revoke teacher Lichess study scopes securely | **PR-head E2E:** `e2e/parity-lichess-oauth.spec.ts#PARITY-lichess-oauth-provider-consent`; [139-pass browser/MCP CI](https://github.com/itshak/ChessCoachPal/actions/runs/42902045552) verifies PKCE browser consent for read/write scopes, credential redaction and confirmed revocation with explicit provider-failure disclosure. Companion `PARITY-lichess-tenant-security` checks foreign-tenant isolation. |
| - [ ] | Search actual studies and chapter 32 by PGN metadata | **Gap/protected** — MCP gap |
| - [x] | List **all material taught** by student over date range | **Passing PR-head OAuth/browser E2E:** `e2e/parity-material-coverage.spec.ts#PARITY-materials-student-history`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | List **all material taught** at workplace, without group duplication | **Passing PR-head OAuth/browser E2E:** `e2e/parity-material-coverage.spec.ts#PARITY-materials-workplace`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Compare assigned vs taught vs reported completed material | **Passing PR-head OAuth/browser E2E:** `e2e/parity-material-coverage.spec.ts#PARITY-materials-stage-reconciliation`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [ ] | Review FEN from image and import approved puzzle PGN to Lichess | **Gap/protected** — MCP gap |

### Reports / exports

Website reference: `/coaching /api/coaching/report, /dashboard`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [x] | Generate workplace-local date-range session and attendance summary | **E2E accepted on PR head:** `e2e/parity-reports.spec.ts#PARITY-reports-workplace-summary`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Compute instructor teaching minutes once for simultaneous group lesson | **E2E accepted on PR head:** `e2e/parity-reports.spec.ts#PARITY-reports-group-teacher-minutes`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Inspect attendance present/absent/late/excused/unmarked breakdown | **E2E accepted on PR head:** `e2e/parity-reports.spec.ts#PARITY-reports-attendance-breakdown`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Produce CSV and text from exactly same calculation | **E2E accepted on PR head:** `e2e/parity-reports.spec.ts#PARITY-reports-csv-text`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |text` uses website `reportCsv/reportText`; merged-main E2E in [PR #20](https://github.com/itshak/ChessCoachPal/pull/20); full scenario sign-off still open |
| - [x] | Report student progress, strength, skills and material coverage | **Passing delegated OAuth/browser E2E:** `e2e/parity-student-progress.spec.ts#PARITY-progress-student-summary` ([115 tests passed](https://github.com/itshak/ChessCoachPal/actions/runs/42715103997) at `bf7c205`). Shared report combines strength, skill assessment history and explicitly attested non-voided material evidence without inferred mastery. |
| - [x] | Report materials taught in workplace vs individual student coverage | **Passing PR-head OAuth/browser E2E:** `e2e/parity-material-coverage.spec.ts#PARITY-materials-workplace-student-report`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Expose dashboard summary via MCP | **Passing PR-head OAuth/browser E2E:** `e2e/parity-security-and-dashboard.spec.ts#PARITY-dashboard-summary`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Verify Hebrew RTL/timezone boundaries, no spreadsheet injection | **PR-head E2E acceptance:** `e2e/parity-rtl-report-ui.spec.ts#PARITY-reports-hebrew-rtl-csv`; [127-pass authenticated browser/MCP run](https://github.com/itshak/ChessCoachPal/actions/runs/42801504865) verifies actual RTL report UI, local-midnight totals and exact CSV export equality. |

### Families and events

Website reference: `/families, /events`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [x] | List/create/edit/delete guardian/family and assigned students | **Passing PR-head OAuth/browser E2E:** `e2e/parity-families-events.spec.ts#PARITY-families-crud`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Rotate family portal token without disclosing token to model | **Passing PR-head OAuth/browser E2E:** `e2e/parity-families-events.spec.ts#PARITY-families-token-rotation`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | List/create/edit/delete event and attendance/RSVP status | **Passing delegated OAuth/browser E2E:** `e2e/parity-portal-rsvp.spec.ts#PARITY-events-lifecycle-rsvp` ([115 tests passed](https://github.com/itshak/ChessCoachPal/actions/runs/42715103997) at `bf7c205`). Verified event roster/RSVP readback, website/MCP edit and confirmed deletion. External email delivery remains a separate gate. |
| - [x] | Email event invitations with recipient/content preview | **PR-head E2E acceptance:** `e2e/parity-event-email-delivery.spec.ts#PARITY-events-invitation-delivery`; [127-pass authenticated browser/MCP run](https://github.com/itshak/ChessCoachPal/actions/runs/42801504865) verifies no-secret preview, explicit confirmed send, one SMTP delivery after website/MCP retries. |
| - [x] | Parent portal RSVP/cancel is separate guardian authority | **Passing delegated OAuth/browser E2E:** `e2e/parity-portal-rsvp.spec.ts#PARITY-portal-guardian-rsvp` ([115 tests passed](https://github.com/itshak/ChessCoachPal/actions/runs/42715103997) at `bf7c205`). Guardian-only token actions allow accept/decline and reject forged teacher-MCP status mutations. |

### Billing, credits, invoice workflows

Website reference: `/billing, /api/billing`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [x] | Read invoice list/details and totals | **Passed named OAuth/browser E2E:** `e2e/parity-invoice-list.spec.ts#PARITY-billing-invoice-list-detail` ([104 passing tests](https://github.com/itshak/ChessCoachPal/actions/runs/42709042700) at `089dd1d`). Tests authenticated own-invoice totals, paginated MCP list and confirmed/redacted family contacts. |
| - [x] | Generate/regenerate invoices with period and rate checks | **PR-head E2E acceptance:** `e2e/parity-invoice-generation-rates.spec.ts#PARITY-billing-generation-regeneration`; [127-pass authenticated browser/MCP run](https://github.com/itshak/ChessCoachPal/actions/runs/42801504865) verifies period/attendance/rate generation, regeneration, website/MCP readback and duplicate-bill denial. |
| - [x] | Edit invoice draft/line items | **E2E accepted on PR head:** `e2e/parity-invoice-draft.spec.ts#PARITY-billing-invoice-edit`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Mark invoice paid/add/reverse payment with audit | **Authenticated PR-head E2E:** `e2e/parity-billing-lifecycle.spec.ts#PARITY-billing-manual-payment`; [passing OAuth/website suite](https://github.com/itshak/ChessCoachPal/actions/runs/42701196373) at `39745a8`. |
| - [x] | Void and delete invoice drafts safely | **Authenticated PR-head E2E:** `e2e/parity-billing-lifecycle.spec.ts#PARITY-billing-void-delete`; [passing OAuth/website suite](https://github.com/itshak/ChessCoachPal/actions/runs/42701196373) at `39745a8`. |
| - [x] | Send one or bulk invoices after preview of recipient and amount | **PR-head browser↔MCP E2E:** `e2e/parity-invoice-bulk-send.spec.ts#PARITY-billing-send-bulk-reviewed`; [128-pass authenticated suite](https://github.com/itshak/ChessCoachPal/actions/runs/42802938648) independently proves reviewed individual recipients/totals, multi-invoice send using both clients, explicit email approval, exact-once SMTP delivery, and no duplicate email on reverse-client retries. |
| - [x] | Create/update credit packages, redeem/undo credits | **PR-head E2E acceptance:** `e2e/parity-credits-lifecycle.spec.ts#PARITY-credits-full-lifecycle`; [127-pass authenticated browser/MCP run](https://github.com/itshak/ChessCoachPal/actions/runs/42801504865) verifies atomic package/invoice creation, replay conflict, expiry, redemption and return across both interfaces. |
| - [ ] | Create payment checkout, inspect PDF, export ledger | **Gap/protected** — MCP gap; secure checkout link |

### Settings, account and data transfer

Website reference: `/studio, /account, /ai-connections`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [x] | Read/edit studio timezone, scheduling, rates, billing and notification policy | **Authenticated PR-head E2E:** `e2e/parity-policy.spec.ts#PARITY-studio-policy`; [passing OAuth/website suite](https://github.com/itshak/ChessCoachPal/actions/runs/42701196373) at `39745a8`. |
| - [x] | Read/edit optional AI settings without disclosing keys | **Passing delegated OAuth/browser E2E:** `e2e/parity-optional-ai.spec.ts#PARITY-optional-ai-settings` ([115 tests passed](https://github.com/itshak/ChessCoachPal/actions/runs/42715103997) at `bf7c205`). Browser key entry is masked in both reads; confirmed MCP changes provider/clears key and rejects raw secret parameters. |
| - [ ] | Edit display name, email/password and MFA | **Gap/protected** — browser secure reauthentication, not generic MCP |
| - [x] | Manage delegated MCP connection grants/revoke | **Passing dedicated delegated-OAuth/browser E2E:** `e2e/parity-connections.spec.ts#PARITY-connections-grants` ([99 passing Playwright tests](https://github.com/itshak/ChessCoachPal/actions/runs/42704750635), 5 intentionally skipped, on `3fce603`); the broader agent E2E also verifies token invalidation, scope limits and website-side revocation. |
| - [x] | Export full teacher data with consent/PII controls | **Passed named OAuth/browser E2E:** `e2e/parity-teacher-export.spec.ts#PARITY-teacher-export` ([104 passing tests](https://github.com/itshak/ChessCoachPal/actions/runs/42709042700) at `089dd1d`). Full website export is authenticated; confirmed MCP export deliberately redacts portal credentials. |
| - [x] | Preview/commit spreadsheet import and duplicate mapping | **Passed named OAuth/browser E2E:** `e2e/parity-spreadsheet-commit.spec.ts#PARITY-spreadsheet-preview-commit-replay` ([104 passing tests](https://github.com/itshak/ChessCoachPal/actions/runs/42709042700) at `089dd1d`). Shared CSV mapping, preview, atomic confirmed import, and website replay receipt are tested. |
| - [x] | Rotate calendar feed token without revealing secret to model | **Passing delegated OAuth/browser E2E:** `e2e/parity-calendar-token.spec.ts#PARITY-calendar-token-rotation` ([115 tests passed](https://github.com/itshak/ChessCoachPal/actions/runs/42715103997) at `bf7c205`). MCP confirmed rotation invalidates old feed URL without returning replacement secret; signed-in browser can read new token. |
| - [x] | List/mark notifications; configure browser push per device | **Passed named OAuth/browser E2E:** `e2e/parity-notifications.spec.ts#PARITY-notifications-list-mark` ([104 passing tests](https://github.com/itshak/ChessCoachPal/actions/runs/42709042700) at `089dd1d`). Device push enrollment remains an explicitly documented browser/device-only exception. |
| - [ ] | Open subscription billing portal/checkout | **Gap/protected** — secure browser portal, not direct chat payment |

### Cross-cutting safety and quality

Website reference: `Every business website page`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [x] | Read-only MCP cannot expose write tools | **Passing PR-head OAuth/browser E2E:** `e2e/parity-security-and-dashboard.spec.ts#PARITY-security-read-only-client`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Teacher B cannot read/update teacher A records by UUID/cursor | **Passing PR-head OAuth/browser E2E:** `e2e/parity-security-and-dashboard.spec.ts#PARITY-security-cross-tenant-ids`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Stale record expectedUpdatedAt and idempotency replay safely reject | **Passing PR-head OAuth/browser E2E:** `e2e/parity-session-edit.spec.ts#PARITY-sessions-edit-stale-replay`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [ ] | Every new website field/action has tested MCP counterpart or secure exception | **Gap/protected** — mandatory CI/review gap |
| - [x] | Report and website use same deterministic service, not different formulas | **Passed named OAuth/browser E2E:** `e2e/parity-report-determinism.spec.ts#PARITY-reports-shared-determinism` ([104 passing tests](https://github.com/itshak/ChessCoachPal/actions/runs/42709042700) at `089dd1d`). Website and MCP report summaries remain identical after an attendance correction. |
| - [x] | Real read/write MCP actions tested through delegated OAuth plus website readback | **Passing PR-head OAuth/browser E2E:** `e2e/parity-security-and-dashboard.spec.ts#PARITY-delegated-oauth-website-roundtrip`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | No raw SQL, secret fetch, guardian contacts in default tool results | **Passing delegated OAuth/browser E2E:** `e2e/parity-tool-security.spec.ts#PARITY-security-no-raw-tools` ([115 tests passed](https://github.com/itshak/ChessCoachPal/actions/runs/42715103997) at `bf7c205`). Unknown raw SQL/secret tools rejected and default family reads redacted; confirmed contact reads still omit portal tokens. |
| - [x] | Long-running exports/imports/sends have explicit confirmation and receipts | **PR-head delegated OAuth + browser E2E:** `e2e/parity-long-running-receipts.spec.ts#PARITY-safety-long-running-receipts`; [129 passed, 5 skipped](https://github.com/itshak/ChessCoachPal/actions/runs/42863389801) at `56e5c94`. Verifies model-safe export approval, import preview SHA-256/confirmation/website replay readback, and exactly one synthetic SMTP email after cross-client retries. This is one workflow scenario, **not** a sign-off of every transfer, event or billing route. |

## Mandatory per-feature release protocol

- [ ] Enumerate all teacher pages, client components, API routes and server-side direct writes. Compare every feature/field with the machine-readable registry, not only endpoint names.
- [ ] For each browser operation, execute **browser path → database snapshot → equivalent delegated MCP read/write → database readback → browser refresh**, with identical dates, timezones and domain constraints. Test null clears, concurrent stale revisions, same idempotency-key replay and different payload conflict.
- [ ] For reporting, compare MCP vs website **byte-for-byte metric values** for identical workplace/from/to, timezone/DST boundaries, Hebrew RTL/localized output, CSV formula-injection resistance, cancellation and 3-person one-lesson deduplication; verify material coverage count separately.
- [ ] Run as teacher A and teacher B, with 1 write-enabled and 1 read-only OAuth client; test cross-tenant UUID/cursor, revoked grant, invalid scope, provider outage and sensitive-data redaction.
- [ ] For notifications, finance, deletion, credential or export actions, verify exact recipient/amount/privacy impact preview and expiry/reconfirmation. Require secure browser step when needed; no model-visible secrets or passwords.
- [ ] Check all documentation and schema registry generated from the deployed MCP `tools/list` / OpenAPI, not invented names. Ensure the website and MCP invoke shared domain services.
- [ ] Run synthetic CI (unit/typecheck/Playwright/Supabase RLS, Compose and restore) green on the **merged** implementation SHA and update this checklist and `mcp-website-parity.json` only after real tests pass.
- [ ] Run `npm run mcp:parity:strict` on release candidate SHA and obtain **zero teacher-business gaps**, plus pass real client acceptance and existing v0.1.0 privacy/security gates before release.

**Source audit coverage:** 93 behavior/security scenarios above. Each checked row has a dedicated authenticated browser↔MCP test; unchecked scenarios remain release blockers. The registry protects structure; it cannot independently prove that individual field semantics inside an unchanged UI component remain in sync. Review the feature inventory with each code change and add tests for new behavior.

**Explicit exclusions:** Login/password/MFA, OAuth consent, third-party provider token setup, platform-hosting subscription portal, service-to-service webhooks/cron, browser/device push subscriptions, the visual onboarding tour, and **guardian-originated** portal actions are not direct teacher-chat CRUD. Their secure handoff, setup/status, or safe teacher administrative operations still require separate documented capabilities; they must not be silently counted as complete teacher-business parity.

## Dashboard and notifications MCP parity increment

**Additional verified increment:** [PR #21](https://github.com/itshak/ChessCoachPal/pull/21) merged at [5a52fde](https://github.com/itshak/ChessCoachPal/commit/5a52fdeb47e11b0498f1d983adc2adb86bd97978). [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42485032664), [OAuth/browser E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42485032822), [self-host](https://github.com/itshak/ChessCoachPal/actions/runs/42485032685), [restore](https://github.com/itshak/ChessCoachPal/actions/runs/42485032699), and [security](https://github.com/itshak/ChessCoachPal/actions/runs/42485032780) all passed. E2E needed one retry after a transient Supabase Docker port collision on the shared runner; the subsequent full suite passed.

Dashboard GET and notification GET/PATCH now use shared teacher-scoped services and delegated MCP counterparts; this does **not** complete the 93-scenario sign-off, which remains blocked until every detailed scenario is verified.

## Expanded tool-surface coverage is not functional sign-off

The newer parity increments provide MCP tool names for every one of the 43 teacher API route families (104 tool definitions on the current PR #40 branch). This is a valuable interface milestone **but does not close the checklist above**. The automated inventory still reports **3 verified, 8 partial, 32 gap** at the route level, and the 93 individual behavior/security cases remain unchecked. Financial generation/credit updates are not atomic, external emails/Stripe require replay and outage evidence, multiple UI data paths bypass the named route inventory, and the legacy `lessons` vs `teaching_sessions` data models are not yet reconciled. Do not collapse these gaps into a single green 43/43 claim or run OpenSpec archive until the browser/OAuth/RLS acceptance matrix is complete.

## New material evidence ledger (Phase P, incremental)

Material references by themselves do not count as *taught*. The new append-only `chess_material_progress` ledger contains teacher-attested `assigned`, `taught`, and `completed` statuses, student/workplace/session provenance, replay-safe request IDs, and revision-guarded retractions. Its website panel and `ccp_v1_materials_history_list/record/void` tools use one owner-scoped service and real delegated-OAuth browser E2E. The workplace list response explicitly labels its deduplicated session/material count as **current-page only**; do not present it as a complete workplace report. No checklist case is automatically approved: historical legacy-material migration, full date-range aggregation, multisession dedup, external studies and all 93-case review remain open.

## Cross-model lesson history increment (Phase Q)

A new `/api/coaching/unified-lessons` website reader and `ccp_v1_lessons_history_unified` tool call the same teacher-scoped service, reading both private legacy and coaching/group sessions. Reports explicitly distinguish *booked* from *evidenced* teaching time, calculate the instructor's overlapping intervals once (not once per group pupil), and retain/flag suspected exact duplicate records. Unit tests and delegated browser↔MCP assertions cover this reader. Historic private lessons still have **unknown workplace attribution**; the service never fabricates a workplace from a current enrollment. This partial integration does not complete the checklist case for all corrections, historic roster accuracy or exact source reconciliation.
