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

### First source slice: existing on-demand transport

The shared service delegates its existing public Lichess and Chess.com HTTP reads to a server-only module. Provider URL/redirect/timeout/status behavior, normalization, preview consent, the reviewed digest and replay-before-fetch remain unchanged. Native simulated-response tests and the existing signed website/delegated MCP test exercise both provider paths and count requests. This is not automatic refresh, durable opt-in, provider authorization, or worker activation. The transport caps consumed response bodies at 80,000 bytes even with absent or inaccurate length headers, shares its existing ten-second request deadline with body reads, and discards rejected bodies without waiting for cancellation. The separate ADR-0029 activation and application adoption bind manual confirmation to the reviewed linked-account state without enabling durable consent or a worker.

### Online history is separate from federation evidence

Both website and MCP read only Lichess and Chess.com rows in the online rating history operation. The shared query applies provider and time-control predicates before counting and paging, and preserves the existing deterministic order. Official and manually entered FIDE/national evidence remain on the federation surface. Signed synthetic coverage puts federation rows ahead of online rows and checks count, continuation, labels, and real foreign-teacher denial. This does not add new browsing controls, report freshness, consent, or worker scheduling.

### Unwired single-lease worker acceptance fixture

The single-attempt orchestrator is source-only and defaults to no work. It exposes no route, scheduler, configuration, connectivity, or default provider/authority dependencies. A future reviewed caller must pass explicit activation, canonical claim/finalize, a fresh authoritative pre-egress binding check, and the existing fixed, bounded transport. No consent is granted here. The worker sends no provider request without current admitted work, writes only normalized evidence after canonical finalization, and returns no opaque errors or account identifiers. Malformed/missing/denied provider responses remain distinct from temporary failures; a single attempt never sleeps or retries, and canonical retry timing remains unchanged.

An operator pause observed after claim or provider response leaves the lease to expire without marking provider failure, recording a receipt, or writing evidence. Actual provider denial finalizes a distinct failure. Confirmed revocation before the fresh recheck blocks egress; if observed while a GET is already in flight, the canonical finalization gate rejects the evidence. Neither a process-side recheck nor a later revocation can claw back a transmitted GET. Worker archive–reactivate semantics, durable opt-in/enqueue, provider traffic policy/quotas, registration and actual scheduling remain separate requirements.

Native cases: node --test lib/server/online-rating-worker.test.mjs. For the real canonical fixture, run node --test e2e/fixtures/online-rating-worker-rpc.node-fixture.mjs against a freshly seeded disposable loopback Supabase environment only, with synthetic service configuration, followed by the signed worker role matrix and manual browser/MCP parity.

### Verified website/MCP permission and bounded queue selection

The reviewed source merge [#233](https://github.com/itshak/ChessCoachPal/pull/233) adds default-off, separate permission for Lichess and Chess.com. The same saved-account revision is reviewed on the website or by an authorized MCP client, and a confirmed enable queues one initial check. Exact replay does not re-enable a revoked account. The signed browser/OAuth test verifies scope, confirmation, queue read-back, revocation, cross-surface replay and absence of any provider attempt. The broader test suite and independent isolated repeat passed. No live deployment or automatic provider traffic was tested or enabled.

The internal batch helper can discover a bounded set of due or expired-lease jobs for each provider. Discovery is not permission: it returns only job and owner references, and a future caller must supply an active operator gate and an approved shared provider reservation before the worker attempts a claim. The individual worker still enforces claim, fresh admission and finalization. Unregistered discovery cannot enqueue recurring work, spend a lease, or make a request on its own. Real disposable PostgREST coverage verifies ordering, provider partitioning, and exclusion of future and unsupported backfill jobs.

Recurring enqueue, shared provider rate and cooldown authority, worker registration, freshness indicators, and any supported history still require separate acceptance. Do not infer live readiness from this source slice.

The public-rating transport exposes a typed, internal cooldown hint on a 429, without changing the website/MCP error or trying again. A valid longer wait is honored within the automatic ceiling; beyond that ceiling the hint requires an operator hold rather than shortening the upstream wait. Unusable or absent hints fall back to conservative provider-specific delays. This is parsing only: shared persistence and cross-process enforcement remain open, and no new provider requests or worker registration are enabled.

### Shared budget around one unregistered attempt

The preproduction schema stores a reservation and provider cooldown durably. The server-only one-candidate adapter acquires the exact provider reservation before claiming, checks matching provider and remaining send time at fresh admission and immediately before the simulated transport, and settles the exact token before finalization. A stale claim, expired reservation or mid-attempt pause still runs settlement. A missing settlement acknowledgement stops the attempt without evidence or a recorded provider result, so it cannot retry a request under unknown authority. This adapter has no registered caller, provider activation, schedule or live enablement. The synthetic PostgREST test uses two real provider-budget rows and a mock transport, including independent quota/cooldown and denied public access.

### Bounded recurring runner (source only)

A single unregistered pass uses the existing service-role recurrence RPC to enqueue at most eight jobs per explicitly permitted provider, then discovers and submits at most two existing due or expired jobs per provider. It replaces the unused boolean reservation stub with the exact shared request-budget adapter and authoritative claim/admit/finalize. Neither constructing the adapters nor omitting a gate starts anything. A failed or unrecognized enqueue result prevents worker submission for that provider. A withheld reservation, uncertain settlement, or temporary retry ends that provider's submissions without preventing the other provider from running. Results contain aggregate counts only.

Database eligibility enforces the rolling 24-hour wait from the later relevant consent/job timestamp and prevents overlapping pending work. The disposable PostgREST fixture checks recent versus due, the currently permitted provider, revoked learners, in-flight work, denied public callers, exact mock receipt/evidence, and a repeated pass. No timer, endpoint, network dispatch, service registration or automatic backfill is added here. The production task stays open.
