# Tasks: automatic online ratings

> **Execution prerequisite:** First complete [`2026-11-19-freeze-unified-saas-schema-and-regressions`](../2026-11-19-freeze-unified-saas-schema-and-regressions/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


- [ ] Inventory current chess username editing, preview/commit consent, provider readers, student_rating_snapshots, chart/report projections and cron/queue infrastructure.
- [ ] Define provider-scoped durable permission and revision-trigger semantics; UI setting defaults safe/off for existing profiles, with explicit teacher enable/disable.
- [ ] Add consent/job/receipt/status schema to canonical baseline and approved live transition, tenant RLS/grants and generated types; preserve old snapshots.
- [ ] Route website and MCP handle saves through one service that schedules a fetch only when allowed; make manual consent and refresh available via both.
- [ ] Implement bounded worker/cron for active student handles, startup/resume/idempotency, backoff/quota controls and session-aware optional refresh; exclude archived records by default.
- [ ] Add provider status/provenance and stale indicator on student profile and reports; never conflate teacher-entered ratings with official observations.
- [ ] Add optional rate-limited historical fetch/backfill with explicit data completeness/estimated status, clear unsupported failure for Chess.com gaps.
- [ ] Test consent denial, handle change during queued work, archived/no-handle, provider 429/timeout/404, job retries, duplicate observations, monthly caps and cross-tenant denial.
- [ ] Add exact same field/action through MCP, tool registry and authenticated website↔MCP E2E with independent read-back.
- [ ] Run clean schema, restored-copy migration, CI, mock-provider, E2E, parity strict, security, Compose and backup/restore; document merged-main evidence before archive.
