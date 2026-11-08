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
