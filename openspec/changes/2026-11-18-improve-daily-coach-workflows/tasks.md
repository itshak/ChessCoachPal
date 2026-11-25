> **2026-11-21 schema-ownership handoff:** All outstanding physical DDL, source schema/type/RLS changes and schema-generated regression tasks in this checklist are now tracked under the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/tasks.md)** (ADR-0019). Keep this proposal's functionality, UI, MCP and acceptance tasks open until independently verified. Historical SQL implementation instructions here are not independent migrations. Do not mark work complete solely because merged code exists.

# Tasks: daily coaching actions

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


- [ ] Inventory existing dashboard queries, coach-briefing, lesson capture preview/commit, attendance, homework, materials, historical import receipts, teacher profile/local timezone and current agent tool inventory.
- [ ] Define teacher-owned daily queue service with workplace filter, date/zone, pagination, stable reason codes and no N+1 student queries; design provider errors and missing evidence states.
- [ ] Implement website dashboard action cards for next lesson, Prepare/Record/Complete, missing attendance, due homework and failed/stale rating lookups; keep existing summary links.
- [ ] Reuse deterministic coach briefing for per-student and group preparation; show exact source evidence/unknowns and never expose another student's private notes.
- [x] Add fast read-only lesson-close preview and atomic approved commit through canonical session/frozen-roster/attendance/material services; distinguish shared vs participant note and teacher observation vs provider rating.
- [x] Add student overview and optional import reconciliation review with explicit alias disambiguation, archived history and provenance preservation; refuse automatic duplicate student merges.
- [ ] Supply task-oriented ccp_* MCP actions and shared typed root schemas; avoid overwhelming default tool discovery, keep full domain tool parity and independent read-back.
- [ ] Add website/MCP parity registry and authenticated E2E: upcoming private, school group, ad-hoc multi-student, archived student, school+personal history, missing homework, rating failure and unmarked attendance.
- [ ] Test timezones/DST, materials assigned vs taught vs mastered, idempotency and stale/replay, cross-tenant denial, group hour deduplication and mixed Hebrew/Russian aliases.
- [ ] Run typecheck/lint/unit, strict parity, E2E, security, Compose and backup/restore; document exact merged-main evidence before archive.

## Archived learner recovery in lesson capture (verified source)

- [x] Wire read-only lesson intent resolution to owned active+archived exact IDs/aliases; show archived indicator and disambiguate duplicates before confirmation, including one-on-one and mixed group workflows.
- [x] Add localized website and MCP “reactivate and create / keep archived / choose another / historical review” outcomes using temporal lifecycle's shared preview/atomic commit; verify consent and no-write decline.
- [x] Test one-session group semantics, quota and workplace blockers, stale previews, all-or-nothing failed lesson writes, replay, authorized/foreign identities and no automatic group/credit/billing changes with independent persisted read-back.
- [x] Preserve and test archival corrections and historical imports without activating students; sync tool descriptions, parity checklist and release gate before marking complete.

Source verification for these checked items is recorded in [Implementation progress](IMPLEMENTATION_PROGRESS.md). The combined dashboard item stays open for Online Ratings freshness policy; no native-client release or operator acceptance is claimed.
