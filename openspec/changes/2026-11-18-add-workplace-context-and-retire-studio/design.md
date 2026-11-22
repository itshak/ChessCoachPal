> **2026-11-21 schema-ownership handoff:** All anticipated physical persistence in this design is owned by the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** under ADR-0019. This design remains a downstream feature contract. Superseded old freeze references below are historical; no independently staged feature DDL or live database change is authorized.

# Design: durable workplace context without duplicate domain identities

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


## Existing touchpoints
components/teacher/TeacherNav.tsx and app/(teacher)/layout.tsx render navigation without persistent workplace selector. app/(teacher)/dashboard/page.tsx uses global data; components/teacher/ChessCoachWorkspace.tsx, CoachingReportPanel.tsx and UnifiedLessonHistoryPanel.tsx maintain separate local selections. app/(teacher)/schedule/page.tsx, students/page.tsx and Learning surfaces must participate. Workplaces currently have id/name/timezone/currency/locale/policy; groups require workplace_id; student memberships use workplace_enrollments. studio_policies are teacher-global.

## Context contract
Selected workplace = null/All or one authorized workplace UUID. Preference is a view/use-default hint, never permission or a destructive relationship. Read from server-backed durable teacher preference, validated against owner workplaces and accessible via ccp_teacher_context_get (or equivalent compact focused tool) and profile update. On absent/deleted/archived workplace: fall back to All with a visible, localized notice rather than leaking results.

Define common SQL/service query scopes:
- Current student roster: students in workplace_enrollments for selected workplace; All dedupes by canonical student ID. Archived students remain discoverable in a separate explicit view and do not count in active quota.
- Lesson history: original teaching_sessions.workplace_id, not inferred from student's current membership. Historical external imports retain original workplace.
- Upcoming schedule: canonical sessions/workplace slots matched by exact workplace ID; All includes all and never double counts one group session.
- Reports/materials: use associated recorded workplace/timezone and explicit filter, return counts and context metadata in website and MCP.
- Creation: selected workplace may be a default and must be confirmed in high-impact flows; no implicit group or unapproved new membership.

## Separate Studio settings
Refactor teacher-global timezone fallback, notification settings, account name, credential integrations and UI locale into teacher/settings as appropriate. Workplace-local timezone, currency, language/output locale, cancellation/makeup policy and future compensation are typed/validated settings, with explicit precedence teacher default -> workplace override -> session snapshot. No legacy studio concept in final clean schema; inherited studio_policies values are mapped into teacher preferences and Personal workplace defaults in the one-time transition. Preserve historical session timezone/currency and future scheduling behavior.

## Entitlement planning
A seed- or transactional-create Personal Teaching workplace is available to every new teacher. Existing named beta workplaces are never silently deleted/hidden in a rollout; implement safe grandfathering or defer enforcement until terms and impact are approved. Groups remain included in Free and are tied to one workplace. Do not market unapproved quotas or prices.

## Implementation and parity
Shared typed workplace-context service, no arbitrary JSON policy mutation beyond validated domain fields. Website GET/edit and all ccp_* teacher context/workplace tools forward identical selected IDs with independent read-back. Same-PR parity registry and authenticated browser/MCP E2E cover one-vs-multiple workplaces, group memberships, revisions, tenant isolation, archived history and local timezone.
