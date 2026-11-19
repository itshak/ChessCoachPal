# Agent-safe student enrollment and reactivation: design and acceptance

Status: design amendment required before production cutover. This document records observed Coolify data and the schema/behavior gaps; it is **not** proof of completed implementation or CI.

## Verified operational observations (2026-11-19)
SentinelX read-only queries of Coolify deployment `chesscoachpal-live-private-beta` (environment label `staging`) found 28 students (11 active, 17 archived), three workplaces (Yatmal, Marshal, Private coaching), zero workplace enrollments, and 167 Yatmal historical attendance evidence rows across 27 students (11 active, 16 archived). A separate `supabase_db_chesscoachpal` container had five students and five enrollments. Do not confuse the environments or infer a student's current enrollment from attendance alone. No live writes were authorized or performed.

## Critical discovered defect
The existing `ccp_student_bulk_lifecycle` RPC explicitly refuses archiving while a workplace enrollment exists. `workplace_enrollments` stores only current links; unenrollment deletes the link. Consequently **the last workplace cannot reliably be recovered from this table**. Historical attendance is a useful hint, not an authoritative last-enrollment ledger. Merely changing the MCP tool description cannot solve this.

## Canonical data model amendment (requires OpenSpec/ADR/schema freeze amendment)
Add an owner-scoped append-only `student_workplace_membership_history` relation with `teacher_id`, `student_id`, `workplace_id`, `started_at`, `ended_at`, `end_reason` (unenrolled, archived, transfer), `source` (explicit, import, approved repair), `created_at`, and request/actor provenance. Never mutate or delete a closed interval; close an active interval transactionally, and create a new interval on return. Enforce teacher-scoped composite foreign keys, RLS, no cross-tenant reference, one open interval per student/workplace, and indexes for the latest closed interval. For existing live rows, backfill only *verified current* links; do not invent historical start dates or retrospectively label attendance as membership.

Keep `workplace_enrollments` as the authoritative current link until a reviewed migration; all create/enroll/unenroll/archive paths must update current links and membership history in one transaction. An archived student has no current workplace enrollment but retains their most recent closed membership. Historic lesson attendance remains immutable.

## Reactivation protocol
1. Resolve student by stable ID. Search matches must be disambiguated; never choose by first name.
2. Preview `lastMembership` from the latest **closed explicit membership**, `currentMemberships`, and `historicalAttendanceWorkplaces` as distinct fields, with provenance and date. Check workplace still belongs to teacher and is active.
3. If exactly one last explicit workplace exists, offer it as a **suggested** workplace. Do not silently re-enroll: teacher must confirm that the pupil is returning to that workplace. If no explicit membership, multiple equally recent memberships, workplace inactive, or the user says a different workplace, return `CLARIFICATION_REQUIRED` with exact allowed workplace IDs and suggested candidate.
4. Preview active student quota, scheduled commitments, group membership, payer/contact state (no automatic billing/portal authority), and exact revision.
5. Atomic commit with explicit confirmation, idempotency key, preview digest and revision guard: reactivate and enroll selected workplace(s), open new membership interval, preserve all prior intervals and attendance. Replay is deterministic.
6. Return structured receipt with student ID, selected workplace IDs, provenance, status, history link and any blocked operations. Never claim success after partial writes.

## Mandatory MCP contract for all high-impact mutations
Use typed discriminated results: `OK`, `CLARIFICATION_REQUIRED`, `PREVIEW_CHANGED`, `CONFLICT`, `BLOCKED`, `NOT_FOUND`, `FORBIDDEN`. Clarification must include `missingFields`, `choices` (stable ID + display label), `reason`, `retryTool`, and an opaque validated preview token when applicable. Do not return an unstructured generic 500 for expected missing input. Never infer workplace from conversational context alone when ambiguous. Do not silently skip invalid import rows or assign payer, legal guardian, billing authority, portal access, group, or mastery.

Audit at minimum: student create (minimal and full), bulk lifecycle preview/commit, workplace enroll/unenroll, spreadsheet parse/preview/commit, historical attendance preview/commit, group enroll, sessions, billing assignment, contacts and import/restore. Shared website and MCP services must use the same checks; SQL is the final guard, not the model prompt.

## Acceptance gates before merge or deployment
- Unit tests for zero/one/many workplaces; unknown/foreign workplace; ambiguous names; mixed valid/invalid rows; archived student reactivation with last explicit workplace; different selected workplace; no history; inactive workplace; concurrent revisions and idempotent retry.
- SQL transactional tests: rollback of student/contact/enrollment/history on quota or validation error; no duplicate links; RLS cross-tenant; archive closure and reactivation opening; no implicit portal/billing grant.
- Authenticated website/MCP parity and E2E against disposable clean installs; no synthetic fixtures inserted into production.
- Schema checksum and OpenSpec freeze amendment, CI green, backup+restore verified, independent live data inventory, explicit operator-approved cutover. Production data repair must have row-level preview, approval, reversible transaction and post-commit reconciliation.

## Current PR #107 limits
It implements spreadsheet workplace fail-closed checks and current enrollment in the import RPC, but **does not yet implement durable membership history or the reactivation protocol**. The SQL baseline changes are not applied to either live database. Its checks have not been verified green. Keep PR draft until the above gates pass.
