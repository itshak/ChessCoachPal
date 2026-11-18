# Tasks: FIDE and Israeli national ratings

- [ ] Inventory current students.chess_ratings, student_rating_snapshots, profile history, reports, exports, direct DB writes and source provenance in website and MCP.
- [ ] Specify federation registry, FIDE ID validation, default national-federation suggestion/explicit none and per-student multiple national memberships; distinguish FIDE federation from membership.
- [ ] Modify canonical baseline, snapshot source/category checks, history triggers, indexes, RLS/grants, generated types and tenant composite constraints.
- [ ] Create reviewed one-time live transition to the exact baseline target preserving historical manual/online ratings; restore/reconcile before production authorization.
- [ ] Implement typed student identity and federation membership CRUD in shared services, website and MCP; linked public provider pages, no inferred identity match by similar names.
- [ ] Verify FIDE official data source version/terms, implement Standard/Rapid/Blitz parser, monthly list-aware sync, provenance, source digest, failure/backoff and stale states.
- [ ] Verify Israeli federation API/access permission, provider ID lookup and terms; only after success implement automated sync, otherwise manual source-attributed rating and clear not-automated state.
- [ ] Integrate current/latest/history display, optional date-effective report, missing/unrated categories and no strength/mastery side effects.
- [ ] Test invalid/ambiguous IDs, federation default without membership, same player ID across teacher tenants, snapshot idempotency, list changes, outdated data, source downtime and migration preservation.
- [ ] Add website/MCP parity registry, field propagation and authenticated E2E; Hebrew/Russian/English formatting and RTL.
- [ ] Run fresh schema, restored-copy migration, mock-provider tests, security, Compose, strict parity, E2E and backup/restore; merged main evidence before archive.
