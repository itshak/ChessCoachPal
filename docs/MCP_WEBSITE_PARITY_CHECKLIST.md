# Mandatory MCP-first website parity checklist

**Audit baseline:** 2026-11-08 · audited original main `bb3a3fa`, refreshed at merged main `759f104` · **Status: FAIL / release blocked (Phase A report route verified, full parity unfinished)**. This is a review of code contracts, not a claim that all capabilities passed real OAuth execution. The only demonstrated live Codex workflow so far is student/workplace creation and enrollment. Current 32 tool names are from `lib/server/agent-tools.ts`. Phase A parity/tenant tests passed on [merged main](https://github.com/itshak/ChessCoachPal/actions/runs/42481967709); the full 93-case checklist is not approved.

> **Product rule:** ChessCoachPal is MCP/Plugin first. The website is an *optional* visual interface to the same teacher-owned domain services. Every ordinary website-visible **business operation and editable field** requires a matching tested MCP command or a justified secure browser approval path; absence is a product defect, not a “website-only” feature. Do not archive the change or publish the next release while gaps remain.

## Source inventory and automated tests

The [versioned machine-readable inventory](../scripts/mcp-website-parity.json) enumerates **61 app/api routes**, **17 teacher pages** and **49 teacher components**. Of the **43 teacher-business API route surfaces**, **3 now have merged CI-verified MCP adapters**, **3 have partial coverage** and **37 are missing full MCP parity**. Some existing individual actions (e.g. workplace rename) work; route-level parity requires *all* actions and fields on that route, not one. Other route surfaces include auth, parent portal, webhooks, browser push and UI-only functions and are marked separately.

Run `npm run mcp:parity:audit` to validate that the inventory tracks every actual route/page/component, that listed HTTP methods match code, and that any claimed live MCP tool exists in the real catalogue. This **passes while explicitly reporting gaps** so normal CI stays green. Run `npm run mcp:parity:strict` to require zero missing/partial teacher-business routes; it **must currently fail** and is the GitHub Release publication gate. Strict success is necessary but **not sufficient**: the behavior and security cases below need synthetic database/browser OAuth integration tests and merged-main evidence. Every new feature PR MUST update the inventory and add website↔MCP behavioral tests; a changed route method/new page/new component with no inventory entry fails regular CI.

## Concrete browser ↔ MCP test cases

Legend in the third column: **Live tool** = present in current MCP catalogue but this exact parity test remains unchecked; **Gap** = absent/incomplete MCP capability; **Protected** = requires narrow scope, explicit confirmation or safe browser handoff. Tick a row only when a test exercises the website action and the same record via authenticated MCP under the same teacher, checks revisions/storage/output, and verifies cross-teacher denial. Some rows are multi-step workflow tests.

### Workplaces / coaching

Website reference: `/coaching, /api/agent/v1`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [ ] | List all teacher workplaces and read details | **Tool/reference:** `ccp_v1_workplaces_list` — implemented tool; needs E2E |
| - [ ] | Create workplace with correct timezone/currency | **Tool/reference:** `ccp_v1_workplaces_create` — implemented tool; needs E2E |
| - [ ] | Rename workplace without changing historical reports | **Tool/reference:** `ccp_v1_workplaces_update` — implemented tool; needs E2E |
| - [ ] | Edit timezone, locale, currency, validated policy with revision | **Tool/reference:** `ccp_v1_workplaces_update` — implemented tool; high-impact schedule preview missing |
| - [ ] | List workplace enrollments | **Tool/reference:** `ccp_v1_workplaces_enrollments` — implemented tool |
| - [ ] | Enroll student | **Tool/reference:** `ccp_v1_workplaces_enroll` — implemented tool |
| - [ ] | Unenroll or archive student/workplace without rewriting lesson history | **Gap/protected** — MCP gap |
| - [ ] | List and edit all workplace material defaults/history | **Gap/protected** — MCP gap |

### Students and progress

Website reference: `/students, /students/[id], /api/students`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [ ] | List entire student roster without query and paginate | **Gap/protected** — MCP gap: search currently requires nonempty query |
| - [ ] | Search by Hebrew full name, English aliases and nicknames | **Tool/reference:** `ccp_v1_students_search` — partial: name only; alias resolution missing |
| - [ ] | Create student, canonical full Hebrew name | **Tool/reference:** `ccp_v1_students_create` — implemented basic creation |
| - [ ] | Rename student (reports preserve canonical full name) | **Tool/reference:** `ccp_v1_students_update` — implemented basic name edit |
| - [ ] | Edit inherited free-form level | **Tool/reference:** `ccp_v1_students_update` — implemented basic level edit |
| - [ ] | Add/edit/remove English and Hebrew aliases | **Gap/protected** — MCP gap |
| - [ ] | Read/edit optional birthdate and practice start date | **Gap/protected** — MCP gap, privacy-sensitive |
| - [ ] | Read/edit teacher notes with private-data scope | **Gap/protected** — MCP gap; website has direct Supabase write |
| - [ ] | Read/edit hourly rates/travel fees | **Gap/protected** — MCP gap; finance-sensitive |
| - [ ] | Archive/unarchive or review deletion impact | **Gap/protected** — MCP gap; protected workflow |
| - [ ] | Manage 1–10 teacher strength and goals/history | **Gap/protected** — MCP gap |
| - [ ] | Manage Lichess/Chess.com usernames and per-time-control ratings/history | **Gap/protected** — MCP gap |
| - [ ] | Read attendance, lesson notes and existing skill observations | **Tool/reference:** `ccp_v1_chess_observations_list` — partial, two teaching history models |
| - [ ] | Add/correct dimension skill assessments, preserving 1–5 history | **Gap/protected** — MCP gap |

### Groups and classes

Website reference: `/coaching, /api/agent/v1`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [ ] | List groups and memberships | **Tool/reference:** `ccp_v1_groups_list / ccp_v1_groups_members` — implemented |
| - [ ] | Create and rename group | **Tool/reference:** `ccp_v1_groups_create / ccp_v1_groups_update` — implemented |
| - [ ] | Add/remove group participant with workplace validation | **Tool/reference:** `ccp_v1_groups_enroll / ccp_v1_groups_unenroll` — implemented |
| - [ ] | View archived group roster without changing history | **Gap/protected** — missing historical projection tests |
| - [ ] | Attach default lesson studies to group/workplace | **Gap/protected** — MCP gap |

### Schedule and attendance

Website reference: `/schedule, /api/schedule`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [ ] | List/create/edit/disable/delete recurring slots | **Gap/protected** — MCP gap; website supports these |
| - [ ] | Resolve local schedule, DST, holidays and student workplace slots | **Gap/protected** — MCP gap |
| - [ ] | Create one-off or makeup legacy lesson | **Gap/protected** — MCP gap (different table from MCP sessions) |
| - [ ] | Create single-student/new group teaching session | **Tool/reference:** `ccp_v1_sessions_create` — implemented with alternate teaching_sessions model |
| - [ ] | Capture a single ad-hoc lesson for arbitrary 3 students | **Gap/protected** — MCP gap |
| - [ ] | List dates/sessions and frozen participants | **Tool/reference:** `ccp_v1_sessions_list / ccp_v1_sessions_participants` — implemented new session model only |
| - [ ] | Reschedule or cancel teaching session | **Tool/reference:** `ccp_v1_sessions_reschedule / ccp_v1_sessions_cancel` — implemented in new model |
| - [ ] | Edit legacy calendar lesson start/end, home visit, status | **Gap/protected** — MCP gap |
| - [ ] | Read/record attendance for an individual teaching-session participant | **Tool/reference:** `ccp_v1_attendance_preview / ccp_v1_attendance_record` — implemented tool |
| - [ ] | Record/review bulk legacy attendance with exact roster | **Gap/protected** — MCP gap |
| - [ ] | Edit shared teaching session note | **Tool/reference:** `ccp_v1_sessions_note_update` — implemented tool |
| - [ ] | Edit private/shared legacy lesson notes | **Gap/protected** — MCP gap |
| - [ ] | Reconcile legacy lessons and new teaching_sessions (no double counting) | **Gap/protected** — critical data-model gap |
| - [ ] | Correct completed lesson/roster history with revision | **Gap/protected** — MCP gap |

### Chess learning and Lichess

Website reference: `/learning, /coaching, /students/[id]`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [ ] | List configured chess skill categories | **Tool/reference:** `ccp_v1_chess_categories_list` — implemented |
| - [ ] | Create/rename/reorder/delete skill categories | **Gap/protected** — website agent/v1 only; MCP gap |
| - [ ] | Read student chess observations | **Tool/reference:** `ccp_v1_chess_observations_list` — implemented |
| - [ ] | Propose unverified observation | **Tool/reference:** `ccp_v1_chess_observations_propose` — implemented |
| - [ ] | Correct observation and teacher-confirm/approve it | **Gap/protected** — website agent/v1 only; MCP gap |
| - [ ] | List saved study URLs linked to student/session | **Tool/reference:** `ccp_v1_chess_resources_list` — implemented limited links |
| - [ ] | Link permitted Lichess Study/HTTPS material to student/session | **Tool/reference:** `ccp_v1_chess_resources_link` — implemented URL only |
| - [ ] | Edit/unlink previously attached resource | **Gap/protected** — website agent/v1 only; MCP gap |
| - [ ] | Connect and revoke teacher Lichess study scopes securely | **Gap/protected** — MCP + website gap; secure browser consent |
| - [ ] | Search actual studies and chapter 32 by PGN metadata | **Gap/protected** — MCP gap |
| - [ ] | List **all material taught** by student over date range | **Gap/protected** — MCP gap; not equivalent to URL links |
| - [ ] | List **all material taught** at workplace, without group duplication | **Gap/protected** — MCP gap |
| - [ ] | Compare assigned vs taught vs reported completed material | **Gap/protected** — MCP gap |
| - [ ] | Review FEN from image and import approved puzzle PGN to Lichess | **Gap/protected** — MCP gap |

### Reports / exports

Website reference: `/coaching /api/coaching/report, /dashboard`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [ ] | Generate workplace-local date-range session and attendance summary | **New MCP tool:** `ccp_v1_reports_workplace_summary` with shared service; merged-main E2E in [PR #20](https://github.com/itshak/ChessCoachPal/pull/20); full scenario sign-off still open |
| - [ ] | Compute instructor teaching minutes once for simultaneous group lesson | **New MCP tool:** summary returns canonical instructor minutes; E2E/units verified; detailed checklist item still unchecked |
| - [ ] | Inspect attendance present/absent/late/excused/unmarked breakdown | **New MCP tool:** same attendance aggregates; merged-main E2E passed; full scenario sign-off still open |
| - [ ] | Produce CSV and text from exactly same calculation | **New MCP tool:** `format=csv|text` uses website `reportCsv/reportText`; merged-main E2E in [PR #20](https://github.com/itshak/ChessCoachPal/pull/20); full scenario sign-off still open |
| - [ ] | Report student progress, strength, skills and material coverage | **Gap/protected** — MCP gap |
| - [ ] | Report materials taught in workplace vs individual student coverage | **Gap/protected** — MCP gap |
| - [ ] | Expose dashboard summary via MCP | **Gap/protected** — MCP gap |
| - [ ] | Verify Hebrew RTL/timezone boundaries, no spreadsheet injection | **Gap/protected** — MCP report parity acceptance missing |

### Families and events

Website reference: `/families, /events`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [ ] | List/create/edit/delete guardian/family and assigned students | **Gap/protected** — website exists; MCP gap, protected PII |
| - [ ] | Rotate family portal token without disclosing token to model | **Gap/protected** — secure browser approval gap |
| - [ ] | List/create/edit/delete event and attendance/RSVP status | **Gap/protected** — website exists; MCP gap |
| - [ ] | Email event invitations with recipient/content preview | **Gap/protected** — send workflow gap |
| - [ ] | Parent portal RSVP/cancel is separate guardian authority | **Gap/protected** — excluded from teacher MCP impersonation |

### Billing, credits, invoice workflows

Website reference: `/billing, /api/billing`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [ ] | Read invoice list/details and totals | **Gap/protected** — MCP gap |
| - [ ] | Generate/regenerate invoices with period and rate checks | **Gap/protected** — MCP gap |
| - [ ] | Edit invoice draft/line items | **Gap/protected** — MCP gap |
| - [ ] | Mark invoice paid/add/reverse payment with audit | **Gap/protected** — MCP gap; finance scope required |
| - [ ] | Void and delete invoice drafts safely | **Gap/protected** — MCP gap; dedicated confirmation |
| - [ ] | Send one or bulk invoices after preview of recipient and amount | **Gap/protected** — MCP gap; communication/finance scopes |
| - [ ] | Create/update credit packages, redeem/undo credits | **Gap/protected** — MCP gap |
| - [ ] | Create payment checkout, inspect PDF, export ledger | **Gap/protected** — MCP gap; secure checkout link |

### Settings, account and data transfer

Website reference: `/studio, /account, /ai-connections`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [ ] | Read/edit studio timezone, scheduling, rates, billing and notification policy | **Gap/protected** — website policy API exists; MCP gap |
| - [ ] | Read/edit optional AI settings without disclosing keys | **Gap/protected** — protected browser approval/secret boundary |
| - [ ] | Edit display name, email/password and MFA | **Gap/protected** — browser secure reauthentication, not generic MCP |
| - [ ] | Manage delegated MCP connection grants/revoke | **Tool/reference:** `oauth revoke endpoint` — available consent route, but in-chat grant inventory/manage missing |
| - [ ] | Export full teacher data with consent/PII controls | **Gap/protected** — MCP gap |
| - [ ] | Preview/commit spreadsheet import and duplicate mapping | **Gap/protected** — MCP gap |
| - [ ] | Rotate calendar feed token without revealing secret to model | **Gap/protected** — secure browser approval gap |
| - [ ] | List/mark notifications; configure browser push per device | **Gap/protected** — notifications MCP gap; push device browser-only |
| - [ ] | Open subscription billing portal/checkout | **Gap/protected** — secure browser portal, not direct chat payment |

### Cross-cutting safety and quality

Website reference: `Every business website page`.

| Checklist | Test/action | Current evidence / blocker |
| --- | --- | --- |
| - [ ] | Read-only MCP cannot expose write tools | **Tool/reference:** `current OAuth` — must test |
| - [ ] | Teacher B cannot read/update teacher A records by UUID/cursor | **Tool/reference:** `RLS` — must test for each new table |
| - [ ] | Stale record expectedUpdatedAt and idempotency replay safely reject | **Tool/reference:** `current RPC` — test every mutation |
| - [ ] | Every new website field/action has tested MCP counterpart or secure exception | **Gap/protected** — mandatory CI/review gap |
| - [ ] | Report and website use same deterministic service, not different formulas | **New shared service:** `lib/server/coaching-report-service.ts`; merged-main E2E passed; full scenario sign-off still open |
| - [ ] | Real read/write MCP actions tested through delegated OAuth plus website readback | **Tool/reference:** `current subset only` — future integration suite |
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
