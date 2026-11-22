> **2026-11-21 schema-ownership handoff:** All outstanding physical DDL, source schema/type/RLS changes and schema-generated regression tasks in this checklist are now tracked under the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/tasks.md)** (ADR-0019). Keep this proposal's functionality, UI, MCP and acceptance tasks open until independently verified. Historical SQL implementation instructions here are not independent migrations. Do not mark work complete solely because merged code exists.

# Tasks: automatic online ratings

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


- [ ] Review the [shared rating-provider boundary](../../../docs/RATING_PROVIDER_BOUNDARIES.md) before adapter implementation; document source approval, provider-specific execution paths, and parity evidence.
- [ ] Inventory current chess username editing, preview/commit consent, provider readers, student_rating_snapshots, chart/report projections and cron/queue infrastructure.
- [ ] Define provider-scoped durable permission and revision-trigger semantics; UI setting defaults safe/off for existing profiles, with explicit teacher enable/disable.
- [ ] Reference P0 freeze evidence for the existing online-only consent/job/receipt schema, tenant RLS/grants and table types. Preserve old snapshots; any separately approved live transition remains an operator gate.
- [ ] Route website and MCP handle saves through one service that schedules a fetch only when allowed; make manual consent and refresh available via both.
- [ ] Implement bounded worker/cron for active student handles, startup/resume/idempotency, backoff/quota controls and session-aware optional refresh; exclude archived records by default.
- [ ] Add provider status/provenance and stale indicator on student profile and reports; never conflate teacher-entered ratings with official observations.
- [ ] Add optional rate-limited historical fetch/backfill with explicit data completeness/estimated status, clear unsupported failure for Chess.com gaps.
- [ ] Test consent denial, handle change during queued work, archived/no-handle, provider 429/timeout/404, job retries, duplicate observations, monthly caps and cross-tenant denial.
- [ ] Add exact same field/action through MCP, tool registry and authenticated website↔MCP E2E with independent read-back.
- [ ] Run clean schema, restored-copy migration, CI, mock-provider, E2E, parity strict, security, Compose and backup/restore; document merged-main evidence before archive.
