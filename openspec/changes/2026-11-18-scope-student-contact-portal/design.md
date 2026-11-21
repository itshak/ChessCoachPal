> **2026-11-21 schema-ownership handoff:** All anticipated physical persistence in this design is owned by the **single [consolidated schema P0](../2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** under ADR-0019. This design remains a downstream feature contract. Superseded old freeze references below are historical; no independently staged feature DDL or live database change is authorized.

# Design: scoped capability grants, not guardian-as-identity

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


## Current source inventory
app/portal/[token]/page.tsx uses createServiceClient() and guardians.portal_token to list every linked student; derives canonicalCalendarWindow across workplaces. app/api/portal/[token]/calendar/route.ts, .../sessions/[id]/students/[studentId]/cancel, .../events/[id]/rsvp and lib/server/canonical-portal-service.ts authorize token/guardian, not a per-contact/student/workplace permission grant. components/teacher/FamilyDetailActions.tsx copies/rotates portal token. External access must be redesigned before deleting the old guardian model.

## Scoped grant
portal_access_grants(id, teacher_id, subject_type=contact|student, subject_id, scope_student_ids, scope_workplace_ids, permission_bits/typed grants, linked_billing_account_ids, expiry_at, revoked_at, issued_at, last_used_at, grant_revision). Store only a digest of a cryptographically random bearer secret with deliberate rotation and access logs; the raw secret appears only at mint/copy in the secure teacher browser and must not enter routine MCP tool outputs, logs or generated docs. Avoid deriving permissions from mutable student_contacts alone. Use explicit rules for students under legal guardianship and never grant financial data solely on relationship.

The portal backend does NOT trust an upstream browser supplied student/workplace/account filter. It resolves the grant against tenant-owned records and validates each canonical session's original workplace, frozen student participant, note's shared status and exact invoice debtor account before any read or mutation. Restrict shared session-wide notes that could expose other children's information. Use read and action permissions separately; RSVP/cancel mutations use scoped atomic DB checks. Reuse canonical lesson and finance sources without privileged broad queries leaking unfiltered rows.

## Cutover and security
Inventory existing token issuance, email links, calendar subscriptions, currently issued portals and family records on a restored copy. A legacy token SHALL NOT silently turn into a grant for all current and future contacts/workplaces. Coordinate a planned replacement link experience with teacher notice and explicit review; existing token is invalidated once an equivalent reviewed grant is issued and tested. When there is no safe automatic mapping, default to no new share rather than broad inferred rights. Keep current live customers' relevant messages and paid invoices safe in storage regardless of grant status.

Limit per-token attempts with uniform 404/403 responses, no-store headers, server-side validation, audit and consistent rate limiting on calendar/RSVP/cancellation/page. Enforce access at DB/RPC boundary for privileged mutation; ensure tokens do not leak in analytics/referrers, previews, SMTP logs or AI messages. Localized en/he/ru and RTL. Test exact session workplace and invoice account, not mutable current student group membership.

## Teacher and external contracts
Authenticated teacher website and ccp_* MCP tools manage grant metadata/rotation/revocation through common services, redact bearer secret in MCP (secure web approval/copy handoff when necessary). External guest portal is intentionally NOT a teacher MCP endpoint and has independently tested authorization. Scope and lifecycle of grants appear in teacher Contact and Student profile, not top-level Studio.
