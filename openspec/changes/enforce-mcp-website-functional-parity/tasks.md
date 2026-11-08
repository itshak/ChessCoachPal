# Checklist — full website ↔ MCP equality

**Status:** Active. Do not archive until every item and the [93 acceptance scenarios](../../../docs/MCP_WEBSITE_PARITY_CHECKLIST.md) pass against merged main.

## A. Foundation and first slice
- [ ] A1. Accept ADR-0003; cross-reference OpenSpec, contribution policy and current baseline.
- [ ] A2. Add PR teacher-surface change guard, strict 93-case release validation and evidence references for complete routes, with CI unit tests.
- [ ] A3. Share website report domain service with MCP `ccp_v1_reports_workplace_summary`; support JSON, CSV and text.
- [ ] A4. GitHub synthetic OAuth/website E2E: same report results, group teacher minutes once, invalid ranges and cross-teacher denial; merge on green CI and record SHA/runs.

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

Tasks above remain unchecked until implementation, merged-main validation and evidence.
