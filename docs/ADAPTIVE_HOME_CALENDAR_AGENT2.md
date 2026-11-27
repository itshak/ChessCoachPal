# Adaptive Home and Calendar — Agent 2 handoff

Base: 35413fa0989e3d92cc4875798947bafdf0179563. Branch: redesign/adaptive-home-calendar. Presentation-only candidate; keep draft until coordinated acceptance.

## Implementation

Home composes existing sessionsList, workplacesList, teacherDashboardSummary and teacherDailyLessonPreparation reads. It uses the selected workplace or teacher civil timezone, orders recorded future scheduled sessions by instant, groups nonempty dates, offers seven-day navigation, retains exact daily cursor links, and separates recorded completion from elapsed scheduled time. No attendance, homework, mastery or billing status is inferred. Existing verified follow-up links and daily queue remain available. Calendar uses the existing canonical window reader and materializer with date/view presentation controls; existing mutation payloads and domain services are unchanged; client editor selection is guarded against stale reads/writes across navigation. No schema, logo, package, shared token or navigation changes.

## Integration

- Agent 1: consume existing semantic theme tokens in both pages; validate the actual Graphite/Iris/Champagne shell and responsive widths together. No new shared component dependency.
- Localized additions are the exact en/he/ru maps in dashboard/home-agenda.ts and components/teacher/schedule/calendar-view.ts. Integrate as new dashboard.adaptive and calendar.adaptive namespaces in shared catalogs (copy keys/values unchanged, then switch helper lookups to those namespaces). No shared catalog files edited here.
- Agent 3: existing preparation, lesson, student and follow-up routes remain authoritative.
- The existing parity PR guard mechanically requires MCP adapter/registry deltas for teacher page changes, even for presentation-only changes. Coordinate guard review or substantive shared-contract changes with the integration owner. Do not weaken or bypass the gate or add meaningless registry edits.

## Outstanding limitations

sessionsList is capped at 100 descending records. The complete future prefix is used only if provable; otherwise daily reads and earliest-date hints are used. When all six earliest unfiltered hints are non-scheduled and the actual next lesson falls beyond the verified dates, Home explicitly reports that the next lesson cannot be verified. A guaranteed unbounded next-scheduled read requires a coordinated typed server/MCP contract. Recent history can also be limited. The existing canonical window reader excludes records without participant rosters; this branch does not replace that domain behavior. Mobile detail uses a dedicated full-content state on the same route, addressed by an exact canonical UUID in the fragment. Close/Back restore the list, scroll and focus; Forward/reload restore read-only overview, not private drafts. Signed coverage is added but not yet executed on the final head. No new domain operations are added.

## Verification

- lib/adaptive-home-calendar-presentation.test.ts: unit cases for workload, next outside seven days, no upcoming, status, cap/unavailable, timezone and fractional ordering, calendar ranges and leap/DST dates.
- e2e/parity-daily-coaching.spec.ts: existing signed website/MCP assertions preserved; adds far-future Home and responsive calendar view/selection checks and synthetic screenshot outputs (desktop Home, desktop/tablet Calendar, mobile detail, Hebrew/Russian mobile Home and Calendar). Includes browser Back/Forward/reload assertions.
- Existing scheduling and parity suites remain required. CI and screenshots must be verified from actual runs. The supplemental feature-owned adaptive-home-calendar-review.yml runs focused unit/typecheck and signed synthetic browser tests and uploads PNG evidence even on success. It does not replace any mandatory check or relax parity.
- Hebrew/Russian runtime and final theme visual inspection, browser accessibility, dense day visual review and full regression acceptance remain pending until executed. No deployment, merge or OpenSpec archive authorized.

## Continuation evidence and coordination

Prior exact head 7a779424fcc4fa380d90ad900c87d8a2c5a1b329: [security](https://github.com/itshak/ChessCoachPal/actions/runs/46008045954), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/46008045965), and [restore](https://github.com/itshak/ChessCoachPal/actions/runs/46008045744) passed. [CI](https://github.com/itshak/ChessCoachPal/actions/runs/46008045730) failed at the unchanged same-PR registry and MCP adapter guard before typecheck/unit. [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/46008045950) built the production app successfully, but was cancelled on superseding commits before complete suite evidence.

[Coordination request in PR #248](https://github.com/itshak/ChessCoachPal/pull/248#issuecomment-7219917554): the missing next-scheduled read must use one captured instant and owner/workplace scope, filter status scheduled, order starts_at then id and return one row independently of the agenda horizon. A typed shared read plus a bounded rolling agenda read, HTTP/MCP adapters and registered parity evidence need a single integration owner. No authorization to change shared service files has been received as of this handoff.

Agent 1's draft layout contract uses 800px and 1280px breakpoints; local Calendar and Home align with them without importing unmerged components. Integrate final shared MasterDetail and shell together, and validate combined screenshots. Capture and detailed lesson recording stay outside Agent 2's assigned pages.
