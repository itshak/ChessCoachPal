# Adaptive Home and Calendar — Agent 2 handoff

Base: 35413fa0989e3d92cc4875798947bafdf0179563. Branch: redesign/adaptive-home-calendar. Presentation-only candidate; keep draft until coordinated acceptance.

## Implementation

Home composes existing sessionsList, teacherDashboardSummary and teacherDailyLessonPreparation reads. It uses the selected workplace or teacher civil timezone, orders recorded future scheduled sessions by instant, groups nonempty dates, offers seven-day navigation, retains exact daily cursor links, and separates recorded completion from elapsed scheduled time. No attendance, homework, mastery or billing status is inferred. Existing verified follow-up links and daily queue remain available. Calendar uses the existing canonical window reader and materializer with date/view presentation controls; existing mutation handlers and services are unchanged. No schema, logo, package, shared token or navigation changes.

## Integration

- Agent 1: consume existing semantic theme tokens in both pages; validate the actual Graphite/Iris/Champagne shell and responsive widths together. No new shared component dependency.
- Localized additions are the exact en/he/ru maps in dashboard/home-agenda.ts and components/teacher/schedule/calendar-view.ts. Integrate as new dashboard.adaptive and calendar.adaptive namespaces in shared catalogs (copy keys/values unchanged, then switch helper lookups to those namespaces). No shared catalog files edited here.
- Agent 3: existing preparation, lesson, student and follow-up routes remain authoritative.
- The existing parity PR guard mechanically requires MCP adapter/registry deltas for teacher page changes, even for presentation-only changes. Coordinate guard review or substantive shared-contract changes with the integration owner. Do not weaken or bypass the gate or add meaningless registry edits.

## Outstanding limitations

sessionsList is capped at 100 descending records. The complete future prefix is used only if provable; otherwise daily reads and earliest-date hints are used. When all six earliest unfiltered hints are non-scheduled and the actual next lesson falls beyond the verified dates, Home explicitly reports that the next lesson cannot be verified. A guaranteed unbounded next-scheduled read requires a coordinated typed server/MCP contract. Recent history can also be limited. The existing canonical window reader excludes records without participant rosters; this branch does not replace that domain behavior. The mobile detail is a dedicated in-page state rather than a separate URL; its Close action restores list, scroll and focus. Browser Back behavior is not a dedicated detail navigation contract. No new domain operations are added.

## Verification

- lib/adaptive-home-calendar-presentation.test.ts: unit cases for workload, next outside seven days, no upcoming, status, cap/unavailable, timezone and fractional ordering, calendar ranges and leap/DST dates.
- e2e/parity-daily-coaching.spec.ts: existing signed website/MCP assertions preserved; adds far-future Home and responsive calendar view/selection checks and synthetic screenshot outputs (desktop Home, desktop/tablet Calendar, mobile detail).
- Existing scheduling and parity suites remain required. CI and screenshots must be verified from actual runs; the current workflow uploads test-results only on failure, so success screenshot artifact collection needs coordinated CI integration.
- Hebrew/Russian and final theme visual inspection, browser accessibility, dense day visual review and full regression acceptance remain pending until executed. No deployment, merge or OpenSpec archive authorized.
