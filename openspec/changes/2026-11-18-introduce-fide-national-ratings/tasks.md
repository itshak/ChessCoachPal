> **2026-11-21 schema-ownership handoff:** All outstanding physical DDL, source schema/type/RLS changes and schema-generated regression tasks in this checklist are now tracked under the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/tasks.md)** (ADR-0019). Keep this proposal's functionality, UI, MCP and acceptance tasks open until independently verified. Historical SQL implementation instructions here are not independent migrations. Do not mark work complete solely because merged code exists.

# Tasks: FIDE and Israeli national ratings

> [Exact source evidence and remaining gates](IMPLEMENTATION_PROGRESS.md). Composite lines stay open if any required part is not independently verified.

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


- [ ] Review the [shared rating-provider boundary](../../../docs/RATING_PROVIDER_BOUNDARIES.md) before adapter implementation; document source approval, provider-specific execution paths, and parity evidence.
- [ ] Inventory current students.chess_ratings, student_rating_snapshots, profile history, reports, exports, direct DB writes and source provenance in website and MCP.
- [x] Specify federation registry, FIDE ID validation, default national-federation suggestion/explicit none and per-student multiple national memberships; distinguish FIDE federation from membership.
- [x] Reference P0 freeze evidence for canonical snapshot source/category checks, history, indexes, RLS/grants, table types and tenant constraints. Do not implement these as independent feature DDL.
- [ ] Create reviewed one-time live transition to the exact baseline target preserving historical manual/online ratings; restore/reconcile before production authorization.
- [ ] Implement typed student identity and federation membership CRUD in shared services, website and MCP; linked public provider pages, no inferred identity match by similar names.
- [ ] Verify FIDE official data source version/terms, implement Standard/Rapid/Blitz parser, monthly list-aware sync, provenance, source digest, failure/backoff and stale states.
- [ ] Verify Israeli federation API/access permission, provider ID lookup and terms; only after success implement automated sync, otherwise manual source-attributed rating and clear not-automated state.
- [ ] Integrate current/latest/history display, optional date-effective report, missing/unrated categories and no strength/mastery side effects.
- [ ] Test invalid/ambiguous IDs, federation default without membership, same player ID across teacher tenants, snapshot idempotency, list changes, outdated data, source downtime and migration preservation.
- [ ] Add website/MCP parity registry, field propagation and authenticated E2E; Hebrew/Russian/English formatting and RTL.
- [ ] Run fresh schema, restored-copy migration, mock-provider tests, security, Compose, strict parity, E2E and backup/restore; merged main evidence before archive.
