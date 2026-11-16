# ChessCoachPal hosting architecture: self-hosted Supabase on Coolify

**Decision:** Adopt a **trimmed self-hosted Supabase backend** for ChessCoachPal's target server deployment, using Coolify for application orchestration. Do **not** replace Supabase with SuperTokens and standalone PostgreSQL solely to reduce the theoretical number of services.

**Status:** Architecture selected on 2026-11-15; production-ready migration **not yet completed or accepted**. Formal decision: [ADR-0008](adr/0008-self-hosted-supabase-on-coolify.md). Operational steps: [SELF_HOSTING.md](SELF_HOSTING.md).

## Purpose and boundary

ChessCoachPal is **MCP-first**: ChatGPT/Claude and other compatible clients operate on teacher-owned records through `/mcp`, while the Next.js website provides the same business capabilities and secure visual review. Both must reach the same domain logic, authenticated teacher identity and permissions. Hosting changes must not split the website and MCP into distinct data or authorization systems.

The target is a **Coolify-managed Docker Compose deployment** containing the trimmed Supabase services and the ChessCoachPal application. Existing Vercel/managed-Supabase development and synthetic staging can remain in use while compatibility, security, backup and real-client acceptance are completed. Self-hosting is a controlled deployment transition, **not** a backend rewrite.

## Target service topology

```text
Teacher's browser                  ChatGPT / Claude / remote MCP client
      |                                            |
      +------------------- HTTPS ------------------+
                           |
                   Coolify reverse proxy
                           |
              ChessCoachPal Next.js application
             website + /mcp + /oauth/* endpoints
                           |
                  Shared teacher services
                           |
                Supabase API gateway (Nginx)
                        /   |    \
                       /    |     \
                GoTrue  PostgREST  Storage API
                 Auth       |          |
                    \       |         /
                     PostgreSQL database
                   (teacher data + auth + RLS)
                           |
               Managed backup/restore workflow
                           |
                Encrypted off-host backup copy
```

The precise Docker networking and proxy routing must be configured and tested before exposing the stack publicly; this diagram describes responsibilities rather than a claim that all traffic takes exactly this hop sequence.

The current repository's [`docker-compose.example.yml`](../docker-compose.example.yml) uses these **runtime** components:

| Service | Current pinned image / source | Role |
| --- | --- | --- |
| `db` | `supabase/postgres:17.6.1.136` | One PostgreSQL instance for application records, Supabase Auth metadata and Storage metadata |
| `auth` | `supabase/gotrue:v2.197.0` | Teacher sign-in, sessions, optional Google OAuth and email flows |
| `rest` | `postgrest/postgrest:v14.17` | Database REST API used by Supabase clients |
| `storage` | `supabase/storage-api:v1.79.31` | Private file/avatar uploads |
| `gateway` | `nginx:1.30.6-alpine` | API routing |
| `app` | Multi-stage `Dockerfile` / Next.js standalone output | Website, agent MCP gateway and app-specific OAuth endpoints |

A one-time `migrate` job, plus optional `backup`, `restore` and `cron` jobs, are **not independent application backends**. Jobs based on the same PostgreSQL image reuse the locally cached image layers. We intentionally exclude Supabase Studio, Realtime, Edge Functions, Analytics, Supavisor and `imgproxy` because the current app does not require them. The compose file—not an unreviewed generic full Supabase template—is the deployment starting point.

## Why keep Supabase?

### Already integrated and working

- Website code already uses `@supabase/ssr` and `@supabase/supabase-js` for sessions and access to records.
- PostgreSQL RLS, teacher-owned identifiers and query/authorization patterns are already established.
- MCP's current delegated OAuth flow implements client discovery/registration, teacher consent, authorization-code + PKCE, short-lived tokens, refresh rotation and revocation. Its session verification presently depends on Supabase authentication.
- Supabase Storage is already part of the repo's self-hosted data/backup story.
- The project has synthetic end-to-end tests and backup/restore workflows built for this stack. They must continue to pass after moving hosting.

Standalone PostgreSQL + SuperTokens could be a valid architecture for a new application. In this application it means replacing auth/session logic, query clients, identity/RLS integration, MCP grant-session handling, Storage, backups and tests, risking regressions precisely while website/MCP parity is being hardened. Google login in SuperTokens does **not** by itself solve the delegated OAuth requirements of remote MCP clients. A separate paid provider must not be assumed necessary while we already have an app-side OAuth implementation (whose security and client compatibility still require review).

### Not proprietary data storage

Supabase uses **PostgreSQL**; `supabase-js` accesses PostgREST and Auth/Storage endpoints. The application can use SQL or direct database access where appropriate. The integration has a migration cost, but the database itself is not a proprietary format.

### The actual downsides we accept

Self-hosting entails monitoring, coordinated component updates, patching, email delivery, HTTPS, data isolation, and recovering from database or host failure. We lose managed infrastructure operations and managed backup/PITR services. The backend uses several service containers rather than a single binary, but these are already provisioned in our trimmed stack. Those operations would **also** exist, in somewhat different form, for standalone PostgreSQL and SuperTokens.

## Disk footprint: estimate versus evidence

Do **not** use the published recommendation for a full Supabase installation as if it were a measured size for ChessCoachPal's reduced deployment. Equally, do not present rough image sizes as verified Docker output.

A preliminary **unverified planning estimate** for our trimmed Compose setup is approximately **2–5 GB unpacked running footprint** for images plus an initial small database/volumes, with **several additional GB** for building/pulling and retaining intermediate image layers. A **rough 10 GB initial budget** may be practical for a clean test, but must **not** be used as a production minimum, especially with live data or in-place upgrades. Actual disk use depends on image versions/architecture, database and WAL, Storage uploads, log retention, caches, backup policy and coexistence with other projects.

Measure a representative deployment rather than relying on these estimates:

```sh
df -h
docker system df -v
docker compose --env-file .env.local images
docker ps --size
```

Avoid Docker-wide cleanup that might affect other Coolify projects. Keep off-host backup retention and capacity separate from this runtime estimate. Include reserve space for at least one upgrade, build, troubleshooting and a restore test; verify available space **before** the production cutover.

## Migration sequence and operational gates

1. **Keep development stable.** Continue existing managed backend while feature hardening is in progress. Do not change database/Auth/MCP libraries as part of a hosting-only change.
2. **Prepare Coolify.** Deploy from the checked-in Compose and current version-pinned images. Review the example's published HTTP ports and convert to correctly isolated Coolify routing; keep Postgres and internal service credentials inaccessible from the public network.
3. **Test a fresh, disposable stack.** Check database migrations, sign-up/sign-in, Google OAuth if configured, email verification/recovery, website reads/writes, Storage upload/download, report accuracy, and complete authenticated MCP read/write, consent, refresh and revocation.
4. **Prove isolation and recovery.** Run two-teacher/RLS tests, website/MCP parity checks, simulate token errors, verify no sensitive log leaks, and restore encrypted off-machine backup into a **separate empty** installation with full login and data validation.
5. **Measure capacity and update behavior.** Check disk growth, RAM/CPU, response time, compatibility of pinned images, alerting, backup retention and rollback. Do not declare capacity from theory alone.
6. **Plan data cutover deliberately.** If replacing a managed Supabase project containing real accounts/data, devise and validate a migration for application rows, auth identities, Storage objects, secrets and pending MCP grants/sessions; arrange a write-free cutover window and preserve rollback/backups. Never silently reset live data.
7. **Authorize beta/production separately.** Correct OAuth redirect URLs, HTTPS/proxy headers and external-email settings; verify actual ChatGPT/Claude clients and all relevant privacy/release gates before admitting real teaching records.

## Explicit non-goals

- No SuperTokens replacement, standalone duplicate PostgreSQL, new ORM, or speculative database-query rewrite.
- No extra Supabase modules unless a verified feature requires them.
- No claim that a selected architecture has already been deployed or that backups alone constitute recovery.
- No student, credential, private host identifier, unpublished commercial strategy, or customer data in public GitHub documentation.

**Revisit only on evidence:** A measured performance/storage blocker, a security or maintenance failure, or an important absent capability may justify another architecture ADR. Until then, preserve the tested integration and invest in operational reliability and MCP parity.
