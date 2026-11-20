# ADR-0018: Operator-only SaaS, tenant ownership and scale-out architecture

- **Status:** Accepted
- **Date:** 2026-11-19
- **Supersedes/clarifies:** ADR-0008's deployment audience and any older customer self-hosting interpretation; does **not** reverse its decision to retain Supabase/PostgreSQL or operator-managed Coolify as a target.
- **Related:** [ADR-0008](0008-self-hosted-supabase-on-coolify.md), [ADR-0017](0017-pre-v1-single-final-cutover-no-compatibility.md), [hosting architecture](../HOSTING_ARCHITECTURE.md), [operator runbook](../SELF_HOSTING.md)

## Binding product boundary

ChessCoachPal is a **centrally operated SaaS**, delivered to coaches via the ChessCoachPal website and authenticated MCP integrations. **There is no customer self-hosted, on-premises, per-coach installation, downloadable deployment, or supported customer-operated server edition.** The project may operate its *own* infrastructure, including PostgreSQL/Supabase and application containers, instead of buying a managed backend. This is **operator-managed infrastructure**, not a self-hosting product. Docker, Compose, source archives, restoration procedures and CI fixtures are internal operator/developer tooling and grant no customer deployment support or license. Proprietary licensing and third-party rights remain governed by ADR-0002 and LICENSE.

## Tenant model: one logical schema, owner UUIDs, database-enforced isolation

- The **authenticated teacher UUID (`teacher_id`) is the current tenant key** for teacher-owned student, workplace, lesson, contact, billing, rating and audit data. A workplace is a grouping/filter, **not** an authorization boundary or independent tenant. Do not infer authority from an object UUID or client-supplied `teacher_id`.
- Use **shared PostgreSQL tables** and one canonical versioned application schema across tenants, **not** a database/schema per coach. Every tenant-owned table must have explicit owner semantics; require tenant-scoped composite foreign keys `(resource_id,teacher_id)` for cross-table ownership where applicable, and appropriate owner-leading indexes and uniqueness constraints.
- Enforce **PostgreSQL RLS** for normal authenticated database roles, plus server-side tenant authorization and MCP scope checks. RLS policies must cover read/write paths, deny cross-teacher and anonymous access, and include tenant-safe update/insert checks. UUIDs alone are identifiers, **not security**. Service-role credentials, table owners, SECURITY DEFINER functions and other RLS bypass routes are privileged boundaries requiring strict server-only handling, minimal privileges and audited tests.
- Keep browser and MCP on shared domain services and permissions. Test owner A/B cross-tenant reads, writes, linked-resource injection, exports, portal grants, OAuth delegation, service-role call sites, and cross-workplace behavior with negative acceptance cases.
- The teacher UUID is the current logical tenant key, **not an immutable claim that every future enterprise organization maps one-to-one to a teacher**. A future multi-coach organization tenant would require a separate explicit ADR and reviewed ownership migration, not an ad hoc overloaded workplace ID.

## Application scaling and state

- Start with a single **writable PostgreSQL primary** and one or more **stateless application instances** behind an HTTPS load balancer/reverse proxy. Any instance can serve website and `/mcp` requests, provided OAuth/session/token and background-job state is shared and durable; never depend on one instance's local memory/filesystem for persistent user state.
- Shared auth, file/object storage, rate limiting, queues/jobs, scheduled work and idempotency must be coordinated across replicas. Avoid duplicate cron execution, lost notifications and cross-instance races; protect writes transactionally and use idempotent durable jobs. Scaling application replicas does **not** require duplicating the database.
- Production reliability requires tested encrypted off-host backups, restore, monitoring, secrets, least privilege, recovery objectives and incident response. A standby can provide failover; read replicas may help eligible reads but may lag, cannot accept normal primary writes and do not replace backups. Choose these based on measured requirements, not assumptions.

## Future database scaling (design compatibility, not current implementation)

- Retain globally unique UUID identifiers, tenant-local ownership relations and an identical canonical schema suitable for **future tenant-based sharding** across multiple database clusters.
- If a measured scaling/regulatory need arises, add a trusted tenant-routing directory mapping authenticated tenant UUID to a database cluster; all operations for one tenant should normally route to its authoritative cluster. Routing is not authorization: enforce RLS and owner constraints inside each cluster. Cross-shard joins/transactions, analytics, migrations, backups, tenant moves, consistency and global identity are separate design/acceptance challenges.
- **Do not implement sharding, per-tenant databases, per-tenant schemas, distributed writes or microservices now.** Database-per-tenant is reserved for a separately approved exceptional isolation requirement; a shared-table design is not a claim of physical isolation.
- Separate background workers for rating refresh, notifications and reports may be introduced when useful, without splitting the authoritative coaching database. Use explicit queues, bounded access and audit trails.

## Rollout and constraints

1. Preserve existing operator-only Supabase/Coolify deployment and CI/restore capabilities; update their **labels** and documentation to remove customer self-hosting ambiguity. Historical archived ADRs/specs remain intact with current-policy pointers rather than rewritten history.
2. Implement any missing schema/RLS/index/tenant test work through the pre-v1 **single canonical baseline** and OpenSpec schema-first plan; do not reset or migrate real data without ADR-0017's separately authorized final cutover and independent financial/history reconciliation.
3. Add horizontal app replicas, DB failover, read replicas or tenant routing only after load/reliability evidence and an explicit design/operational acceptance gate.

## Consequences

A single schema makes migrations and multi-instance app scaling simpler and lowers operational overhead. It also means shared-resource contention, RLS mistakes and privileged bypasses are material risks; defense in depth, tenant-safe constraints, rate limits and tests are mandatory. No current production topology, failover SLA, replica, sharding deployment or completed live cutover is asserted by this ADR.
