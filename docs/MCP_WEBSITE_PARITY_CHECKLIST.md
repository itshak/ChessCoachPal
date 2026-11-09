# Mandatory MCP-first website parity checklist

**Current merged-main snapshot (2026-11-09):** [PR #42](https://github.com/itshak/ChessCoachPal/pull/42) merged as [d93b6ef](https://github.com/itshak/ChessCoachPal/commit/d93b6efb0c6f96d1f07e48640ee8e342af4e891b). All 43 teacher-business route families have named MCP tools, but this is structural coverage only. The registry classifies **5 verified / 8 partial / 32 gaps**, and **0/93** browser/MCP behavior-security checklist scenarios are formally accepted.

**Release gate remains blocked.** Each checked scenario must cite a named executable test as `e2e/file.spec.ts#PARITY-id`, whose title starts `PARITY:PARITY-id` and whose body exercises MCP, website API and assertions. Runtime E2E and merged-main verification remain mandatory. The standard inventory audit can pass with documented gaps; strict parity requires all 43 verified and all 93 scenarios checked. Remaining high-risk work includes historic corrections, transactional/replay safeguards, accurate material aggregates, student archive/reactivation quotas, cross-tenant security, external-provider side effects and merged-main evidence. Do not archive OpenSpec or claim general parity.

**Latest evidence:** PR-head [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42523621060), [delegated OAuth E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42523621045), [security](https://github.com/itshak/ChessCoachPal/actions/runs/42523621097), [self-host](https://github.com/itshak/ChessCoachPal/actions/runs/42523621131), and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/42523621103) all succeeded. Postmerge [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42528998607) succeeded; [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42528998666), [security](https://github.com/itshak/ChessCoachPal/actions/runs/42528998631), [self-host](https://github.com/itshak/ChessCoachPal/actions/runs/42528998606), and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/42528998613) also succeeded on merged main. Vercel returned a deployment build-rate-limit status on the PR, so not all third-party checks were green.

**Latest draft PR-head evidence (not merged-main):** [99 passing authenticated website/MCP E2E tests](https://github.com/itshak/ChessCoachPal/actions/runs/42704750635), [CI](https://github.com/itshak/ChessCoachPal/actions/runs/42704750400), [security](https://github.com/itshak/ChessCoachPal/actions/runs/42704750523), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/42704750540) and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/42704750856) all succeeded at `3fce603`. **60/93** individually named browser/MCP scenarios have passing PR-head evidence; **33 remain unchecked**. The current draft registry is **45 teacher routes: 6 verified / 8 partial / 31 gaps**. This is not merged-main acceptance, and the strict release gate remains **BLOCKED**; changes after the cited SHA require renewed CI.

**Historical source-audit baseline and the still-required 93-case matrix follow.**


**Audit baseline:** 2026-11-08 · audited original main `bb3a3fa`, refreshed at merged main `759f104` · **Status: FAIL / release blocked (Phase A report route verified, full parity unfinished)**. This is a review of code contracts, not a claim that all capabilities passed real OAuth execution. The only demonstrated live Codex workflow so far is student/workplace creation and enrollment. Current 32 tool names are from `lib/server/agent-tools.ts`. Phase A parity/tenant tests passed on [merged main](https://github.com/itshak/ChessCoachPal/actions/runs/42481967709); the full 93-case checklist is not approved.

> **Product rule:** ChessCoachPal is MCP/Plugin first. The website is an *optional* visual interface to the same teacher-owned domain services. Every ordinary website-visible **business operation and editable field** requires a matching tested MCP command or a justified secure browser approval path; absence is a product defect, not a “website-only” feature. Do not archive the change or publish the next release while gaps remain.

## Source inventory and automated tests

The [versioned machine-readable inventory](../scripts/mcp-website-parity.json) enumerates **61 app/api routes**, **17 teacher pages** and **49 teacher components**. Of the **43 teacher-business API route surfaces**, **3 now have merged CI-verified MCP adapters**, **3 have partial coverage** and **37 are missing full MCP parity**. Some existing individual actions (e.g. workplace rename) work; route-level parity requires *all* actions and fields on that route, not one. Other route surfaces include auth, parent portal, webhooks, browser push and UI-only functions and are marked separately.

Run `npm run mcp:parity:audit` to validate that the inventory tracks every actual route/page/component, that listed HTTP methods match code, and that any claimed live MCP tool exists in the real catalogue. This **passes while explicitly reporting gaps** so normal CI stays green. Run `npm run mcp:parity:strict` to require zero missing/partial teacher-business routes; it **must currently fail** and is the GitHub Release publication gate. Strict success is necessary but **not sufficient**: the behavior and security cases below need synthetic database/browser OAuth integration tests and merged-main evidence. Every new feature PR MUST update the inventory and add website↔MCP behavioral tests; a changed route method/new page/new component with no inventory entry fails regular CI.

**PR #44 candidate E2E sign-off (2026-11-09):** From the original 51/93 executed scenarios, eight previously uncredited named tests and one newly implemented, passing OAuth grant-revocation test have increased **PR-head evidence to 60/93**. The latest 99-pass [E2E run](https://github.com/itshak/ChessCoachPal/actions/runs/42704750635) proves those named cases executed; five other tests were intentionally skipped. **33 scenarios and 39 incomplete business-route classifications still block strict parity, OpenSpec archiving and merge**. No merged-main release signoff is implied.

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
| - [ ] | List and edit all workplace material defaults/history | **Gap/protected** — MCP gap |

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
| - [ ] | Manage 1–10 teacher strength and goals/history | **Gap/protected** — MCP gap |
| - [ ] | Manage Lichess/Chess.com usernames and per-time-control ratings/history | **Gap/protected** — MCP gap |
| - [ ] | Read attendance, lesson notes and existing skill observations | **Tool/reference:** `ccp_v1_chess_observations_list` — partial, two teaching history models |
| - [x] | Add/correct dimension skill assessments, preserving 1–5 history | **E2E accepted on PR head:** `e2e/parity-students.spec.ts#PARITY-students-skills`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |

### Groups and classes

Website reference: `/coaching, /api/agent/v1`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [x] | List groups and memberships | **E2E accepted on PR head:** `e2e/parity-groups.spec.ts#PARITY-groups-list`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Create and rename group | **E2E accepted on PR head:** `e2e/parity-groups.spec.ts#PARITY-groups-create-update`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Add/remove group participant with workplace validation | **E2E accepted on PR head:** `e2e/parity-groups.spec.ts#PARITY-groups-memberships`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [ ] | View archived group roster without changing history | **Gap/protected** — missing historical projection tests |
| - [ ] | Attach default lesson studies to group/workplace | **Gap/protected** — MCP gap |

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
| - [ ] | Reconcile legacy lessons and new teaching_sessions (no double counting) | **Gap/protected** — critical data-model gap |
| - [ ] | Correct completed lesson/roster history with revision | **Gap/protected** — MCP gap |

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
| - [ ] | Connect and revoke teacher Lichess study scopes securely | **Gap/protected** — MCP + website gap; secure browser consent |
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
| - [ ] | Report student progress, strength, skills and material coverage | **Gap/protected** — MCP gap |
| - [x] | Report materials taught in workplace vs individual student coverage | **Passing PR-head OAuth/browser E2E:** `e2e/parity-material-coverage.spec.ts#PARITY-materials-workplace-student-report`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Expose dashboard summary via MCP | **Passing PR-head OAuth/browser E2E:** `e2e/parity-security-and-dashboard.spec.ts#PARITY-dashboard-summary`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [ ] | Verify Hebrew RTL/timezone boundaries, no spreadsheet injection | **Gap/protected** — MCP report parity acceptance missing |

### Families and events

Website reference: `/families, /events`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [x] | List/create/edit/delete guardian/family and assigned students | **Passing PR-head OAuth/browser E2E:** `e2e/parity-families-events.spec.ts#PARITY-families-crud`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Rotate family portal token without disclosing token to model | **Passing PR-head OAuth/browser E2E:** `e2e/parity-families-events.spec.ts#PARITY-families-token-rotation`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [ ] | List/create/edit/delete event and attendance/RSVP status | **Gap/protected** — website exists; MCP gap |
| - [ ] | Email event invitations with recipient/content preview | **Gap/protected** — send workflow gap |
| - [ ] | Parent portal RSVP/cancel is separate guardian authority | **Gap/protected** — excluded from teacher MCP impersonation |

### Billing, credits, invoice workflows

Website reference: `/billing, /api/billing`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [ ] | Read invoice list/details and totals | **Gap/protected** — MCP gap |
| - [ ] | Generate/regenerate invoices with period and rate checks | **Gap/protected** — MCP gap |
| - [x] | Edit invoice draft/line items | **E2E accepted on PR head:** `e2e/parity-invoice-draft.spec.ts#PARITY-billing-invoice-edit`; [passing authenticated browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/42685623529) |
| - [x] | Mark invoice paid/add/reverse payment with audit | **Authenticated PR-head E2E:** `e2e/parity-billing-lifecycle.spec.ts#PARITY-billing-manual-payment`; [passing OAuth/website suite](https://github.com/itshak/ChessCoachPal/actions/runs/42701196373) at `39745a8`. |
| - [x] | Void and delete invoice drafts safely | **Authenticated PR-head E2E:** `e2e/parity-billing-lifecycle.spec.ts#PARITY-billing-void-delete`; [passing OAuth/website suite](https://github.com/itshak/ChessCoachPal/actions/runs/42701196373) at `39745a8`. |
| - [ ] | Send one or bulk invoices after preview of recipient and amount | **Gap/protected** — MCP gap; communication/finance scopes |
| - [ ] | Create/update credit packages, redeem/undo credits | **Gap/protected** — MCP gap |
| - [ ] | Create payment checkout, inspect PDF, export ledger | **Gap/protected** — MCP gap; secure checkout link |

### Settings, account and data transfer

Website reference: `/studio, /account, /ai-connections`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [x] | Read/edit studio timezone, scheduling, rates, billing and notification policy | **Authenticated PR-head E2E:** `e2e/parity-policy.spec.ts#PARITY-studio-policy`; [passing OAuth/website suite](https://github.com/itshak/ChessCoachPal/actions/runs/42701196373) at `39745a8`. |
| - [ ] | Read/edit optional AI settings without disclosing keys | **Gap/protected** — protected browser approval/secret boundary |
| - [ ] | Edit display name, email/password and MFA | **Gap/protected** — browser secure reauthentication, not generic MCP |
| - [x] | Manage delegated MCP connection grants/revoke | **Passing dedicated delegated-OAuth/browser E2E:** `e2e/parity-connections.spec.ts#PARITY-connections-grants` ([99 passing Playwright tests](https://github.com/itshak/ChessCoachPal/actions/runs/42704750635), 5 intentionally skipped, on `3fce603`); the broader agent E2E also verifies token invalidation, scope limits and website-side revocation. |
| - [ ] | Export full teacher data with consent/PII controls | **Gap/protected** — MCP gap |
| - [ ] | Preview/commit spreadsheet import and duplicate mapping | **Gap/protected** — MCP gap |
| - [ ] | Rotate calendar feed token without revealing secret to model | **Gap/protected** — secure browser approval gap |
| - [ ] | List/mark notifications; configure browser push per device | **Gap/protected** — notifications MCP gap; push device browser-only |
| - [ ] | Open subscription billing portal/checkout | **Gap/protected** — secure browser portal, not direct chat payment |

### Cross-cutting safety and quality

Website reference: `Every business website page`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [x] | Read-only MCP cannot expose write tools | **Passing PR-head OAuth/browser E2E:** `e2e/parity-security-and-dashboard.spec.ts#PARITY-security-read-only-client`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Teacher B cannot read/update teacher A records by UUID/cursor | **Passing PR-head OAuth/browser E2E:** `e2e/parity-security-and-dashboard.spec.ts#PARITY-security-cross-tenant-ids`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [x] | Stale record expectedUpdatedAt and idempotency replay safely reject | **Passing PR-head OAuth/browser E2E:** `e2e/parity-session-edit.spec.ts#PARITY-sessions-edit-stale-replay`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [ ] | Every new website field/action has tested MCP counterpart or secure exception | **Gap/protected** — mandatory CI/review gap |
| - [ ] | Report and website use same deterministic service, not different formulas | **New shared service:** `lib/server/coaching-report-service.ts`; merged-main E2E passed; full scenario sign-off still open |
| - [x] | Real read/write MCP actions tested through delegated OAuth plus website readback | **Passing PR-head OAuth/browser E2E:** `e2e/parity-security-and-dashboard.spec.ts#PARITY-delegated-oauth-website-roundtrip`; [87-test run](https://github.com/itshak/ChessCoachPal/actions/runs/42698521763), final-head rerun required |
| - [ ] | No raw SQL, secret fetch, guardian contacts in default tool results | **Tool/reference:** `current restrictions` — regression suite |
| - [ ] | Long-running exports/imports/sends have explicit confirmation and receipts | **Gap/protected** — MCP gap |

## Mandatory per-feature release protocol

- [ ] Enumerate all teacher pages, client components, API routes and server-side direct writes. Compare every feature/field with the machine-readable registry, not only endpoint names.
- [ ] For each browser operation, execute **browser path → database snapshot → equivalent delegated MCP read/write → database readback → browser refresh**, with identical dates, timezones and domain constraints. Test null clears, concurrent stale revisions, same idempotency-key replay and different payload conflict.
- [ ] For reporting, compare MCP vs website **byte-for-byte metric values** for identical workplace/from/to, timezone/DST boundaries, Hebrew RTL/localized output, CSV formula-injection resistance, cancellation and 3-person one-lesson deduplication; verify material coverage count separately.
- [ ] Run as teacher A and teacher B, with 1 write-enabled and 1 read-only OAuth client; test cross-tenant UUID/cursor, revoked grant, invalid scope, provider outage and sensitive-data redaction.
- [ ] For notifications, finance, deletion, credential or export actions, verify exact recipient/amount/privacy impact preview and expiry/reconfirmation. Require secure browser step when needed; no model-visible secrets or passwords.
- [ ] Check all documentation and schema registry generated from the deployed MCP `tools/list` / OpenAPI, not invented names. Ensure the website and MCP invoke shared domain services.
- [ ] Run synthetic CI (unit/typecheck/Playwright/Supabase RLS, Compose and restore) green on the **merged** implementation SHA and update this checklist and `mcp-website-parity.json` only after real tests pass.
- [ ] Run `npm run mcp:parity:strict` on release candidate SHA and obtain **zero teacher-business gaps**, plus pass real client acceptance and existing v0.1.0 privacy/security gates before release.

**Source audit coverage:** 93 behavior/security scenarios above. All checkboxes intentionally unchecked until equivalent website+MCP behavioral integration tests exist. The registry protects structure; it cannot independently prove that individual field semantics inside an unchanged UI component remain in sync. Review the feature inventory with each code change and add tests for new behavior.

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
