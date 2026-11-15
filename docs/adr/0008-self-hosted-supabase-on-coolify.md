# ADR-0008: Retain Supabase and target a trimmed self-hosted deployment on Coolify

- **Status:** Accepted
- **Date:** 2026-11-15
- **Scope:** ChessCoachPal's backend, website authentication, teacher-owned data, MCP authorization, and production hosting
- **Related:** [ADR-0001: pre-1.0 breaking changes](0001-pre1-breaking-changes.md), [ADR-0003: MCP/website parity](0003-mcp-website-business-parity.md), [hosting architecture and decision record](../HOSTING_ARCHITECTURE.md), [self-hosting and recovery](../SELF_HOSTING.md)

## Context

ChessCoachPal already integrates deeply with Supabase Auth (GoTrue), Supabase JavaScript clients, PostgREST, PostgreSQL row-level security (RLS), and Supabase Storage. Its authenticated website and remote MCP tools use shared teacher-owned data and business logic. The existing MCP OAuth endpoints implement discovery, dynamic client registration, consent, authorization-code + PKCE exchange, rotating refresh tokens, scopes, and revocation; they currently bind grants to and verify Supabase teacher sessions. Real interoperability with each target AI client remains a separate acceptance gate.

The repository already contains a **trimmed self-hosted Supabase Compose installation** (`docker-compose.example.yml`): PostgreSQL, GoTrue, PostgREST, Storage, an Nginx API gateway, and the Next.js application (which also serves `/mcp`). Migration and optional backup/cron/restore jobs are ancillary. The stack intentionally excludes unused components such as Studio, Realtime, Analytics, Edge Functions, Supavisor, and image transformation.

We considered replacing Supabase with standalone PostgreSQL and SuperTokens (including Google sign-in), but that would require replacing existing auth/session integration, Supabase query clients, RLS identity wiring, MCP session verification, Storage integration, migrations, and tested recovery paths. A smaller theoretical container footprint would not, by itself, justify this risk. A complete independent review of the separate reference project's implementation was not completed and is not a prerequisite for this decision.

## Decision

1. **Keep Supabase as ChessCoachPal's canonical backend platform**: PostgreSQL (including RLS), GoTrue authentication, PostgREST, and Storage where used. Retain the existing `supabase-js` and `@supabase/ssr` integration rather than rewrite working domain code solely to switch backend providers. Supabase's database is ordinary PostgreSQL; its JavaScript query APIs do not prevent use of SQL or direct database connections where appropriately authorized.
2. **Target self-hosting the trimmed stack on the existing Coolify-managed server** for a production-ready, recoverable deployment. Run the website and `/mcp` through the same Next.js application and domain authorization. Do not provision a second application PostgreSQL instance beside the PostgreSQL already included in the Supabase stack.
3. **Keep managed Supabase and the current development hosting temporarily** while MCP hardening and release work continue. This ADR selects the desired deployment architecture; it does **not** assert that the OVH/Coolify migration is complete or make a premature cutover mandatory. Proceed only after operational acceptance checks pass.
4. **Retain the existing ChessCoachPal MCP OAuth authorization layer** unless a separately reviewed improvement is justified. Supabase authenticates teachers; our application authorizes delegated MCP clients, binds their grants to teacher identity, and enforces scopes. Do not conflate Google sign-in with OAuth authorization of ChatGPT/Claude, and do not add a second paid OAuth/authentication service to solve a problem already supported by the architecture.
5. **Do not migrate to SuperTokens + standalone PostgreSQL** without a new ADR supported by a demonstrated blocker or measured, material benefit (e.g., unacceptable resource use, security/maintainability issue, or critical missing capability) that outweighs the rewrite and regression risk. Neither a theoretical reduction in image count nor preference for a dedicated authentication product is sufficient.
6. **Preserve MCP-first parity and safety** across hosting moves: the website and MCP must use shared teacher-scoped services and permissions, not independent authority models. Keep RLS and application-layer ownership enforcement, isolated credentials, consent/revocation, idempotency, and audited write paths.

## Rationale and alternatives

| Option | Benefits | Costs and decision |
| --- | --- | --- |
| Managed Supabase + app hosting | Proven development setup, fewer operations during active development | **Temporary bridge**, not the target for our server deployment |
| **Trimmed self-hosted Supabase + Next.js/MCP on Coolify** | Reuses current code, authentication, RLS, query and Storage APIs, MCP grant model, and tested Docker/backup tooling; no backend platform subscription needed | **Selected**; we accept operating the components ourselves |
| Standalone PostgreSQL + SuperTokens | Dedicated auth system and flexibility to adopt an ORM/direct SQL; potentially fewer runtime services | **Rejected for now**: substantial application and security refactor for an unproven net benefit, and MCP OAuth still requires verified delegated authorization |
| Supabase Cloud Auth + separate standalone app PostgreSQL | Possible separation of concerns | **Rejected**: adds identity/RLS and operational complexity while splitting otherwise integrated data |
| Full default Supabase distribution | Broader built-in features | **Not selected**: unused services are excluded from our existing trimmed Compose stack |

The fact that Supabase is a multi-component architecture is **not** an argument for adding another auth provider. SuperTokens and standalone PostgreSQL would still require patching, email/OAuth configuration, backups, monitoring, access controls and integration tests. For ChessCoachPal, **change risk and total ownership cost matter more than theoretical minimalism**.

## Operational constraints and acceptance criteria

- **Capacity:** Check actual available host storage before deployment using `df -h`, `docker system df -v`, and, after a test build, image/volume measurements. Published full-stack SSD recommendations are not measurements of this trimmed stack. Prior rough footprint estimates are *planning hypotheses*, not validated image sizes or deployment guarantees; allow headroom for image pulls/unpacking, build layers, PostgreSQL WAL/data, uploads, logs, upgrades, and restore.
- **Private services:** Keep database, GoTrue, PostgREST, and Storage services internal unless exposure is deliberately required and secured. Route only intended application and API endpoints through Coolify's HTTPS proxy. Review the example Compose file's published development ports before production use; avoid publishing PostgreSQL and service-role credentials.
- **Auth:** Verify Google OAuth (if enabled), email verification/recovery and SMTP configuration, session refresh, CSRF/cookie configuration, redirect URI allowlists, account disablement, and consistent teacher identities across website/MCP.
- **MCP:** Verify discovery, registration restrictions/rate limits, consent, PKCE, token refresh/revocation, scopes, tenant isolation and real supported client interoperability. Never put Supabase service keys in agent clients or logs.
- **Recovery:** Schedule encrypted, access-controlled **off-machine** backups of PostgreSQL, Storage objects and essential private configuration. Keep the tested second-empty-instance restoration workflow; demonstrate login, private data, uploads, reports and MCP access after a restore. Local backups alone are insufficient.
- **Lifecycle:** Pin compatible component images; update as a tested set with backups, rollback/recovery plans, health monitoring, image/log cleanup and disk-alert thresholds. Record performance and usage before sizing the beta cohort.
- **Data safety:** No automatic reset/migration of a deployment containing real records; obtain explicit approval and preserve backups. Release gates continue to require cross-teacher/RLS, website/MCP parity, and privacy checks.

## Consequences

We avoid a large, unnecessary backend rewrite and protect the MCP hardening work, while accepting the operational responsibility of self-hosting Supabase. This is a **hosting and architecture decision**, not evidence of an already deployed production-ready Coolify installation or fully measured resource footprint. An alternative requires a new reviewed decision, migration plan, and regression evidence.
