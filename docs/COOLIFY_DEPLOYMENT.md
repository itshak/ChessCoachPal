# Coolify deployment runbook — ChessCoachPal

> **Permanent-domain transition:** See [PRODUCTION_DOMAIN_CUTOVER.md](PRODUCTION_DOMAIN_CUTOVER.md) for the canonical site/API hostnames, Vercel retirement and beta-domain removal. The historical staging sections below do not attest that this transition has finished.

**Status (2026-11-16):** Isolated staging responds successfully on public HTTPS. A direct reuse of its persistent Coolify application as the invitation-only production environment is planned, but the canonical hostnames, live Coolify configuration, and acceptance tests are **not yet verified**. See [production cutover](PRODUCTION_DOMAIN_CUTOVER.md). See [hosting architecture](HOSTING_ARCHITECTURE.md), [self-hosting](SELF_HOSTING.md), and [ADR-0008](adr/0008-self-hosted-supabase-on-coolify.md).

## Architecture and service exposure

Deploy the repository's **docker-compose.coolify.yml** using Coolify's **Git-based Docker Compose Application** build strategy. Do not paste it as an untracked Docker Compose Empty service. Keep the file versioned and reviewed alongside app code.

The stack runs the minimum Supabase components already used by ChessCoachPal: PostgreSQL 17, GoTrue, PostgREST, Storage API, nginx gateway, one-shot schema migration, and the Next.js site providing both website and /mcp plus /oauth routes.

- Public-facing service **app**: internal **3000** via Coolify HTTPS proxy only.
- Public-facing service **gateway**: internal **8000** via Coolify HTTPS proxy only. Gateway serves /auth/v1, /rest/v1, /storage/v1; it does not expose a database port.
- **db**, **auth**, **rest**, **storage**, and **migrate** join the private default Compose network only.
- **app** and **gateway** also join the existing external **coolify** Docker network so the Coolify proxy can route to them.
- **No Compose service publishes a host port.** The host's ports 3000 and 8000 may already be in use by unrelated workloads; never add mappings such as 3000:3000, 8000:8000 or 5432:5432.
- Three named volumes store PostgreSQL data, PostgreSQL config and Supabase Storage files. Do not delete these volumes during updates. The migration service is an intentional one-shot container, not a failed long-running service.
- The optional cron profile remains disabled until scheduled messaging is configured. The local backup/restore profiles in docker-compose.example.yml are omitted here because they depend on a private .env.local file and alone do not meet the off-host recovery gate.

**Do not deploy the generic development docker-compose.example.yml unchanged on a shared Coolify host.** It publishes conflicting host ports, uses a local secrets file, and defaults to email auto-confirmation.

## Coolify image packaging (required)

Coolify generates its Compose file outside the Git checkout. Relative file mounts for
SQL initialization, migrations and nginx templates can become missing directories
and break a fresh database. The staging Compose file now bundles the SQL and
migration scripts in Dockerfile.postgres-init, and the nginx template in
Dockerfile.gateway. Keep all images built from the release commit. Verify auth
role passwords, GoTrue, PostgREST, Storage and schema migration on fresh install.

## Coolify installation and target resource

1. Keep the existing Tongrix and all other projects untouched. Create a **new ChessCoachPal project** with **staging** environment in Coolify. A separate **production** environment should be created only after a staging acceptance review.
2. In staging, add a **Git Repository** application from the repository authorized by the owner (GitHub itshak/ChessCoachPal). Choose **Docker Compose** build strategy, **Base Directory /**, and **Docker Compose Location /docker-compose.coolify.yml**.
3. Select a reviewed commit/branch. Initially disable automatic deployments, PR previews, and wildcard domains. Review the generated Compose content before clicking Deploy; do not change its volumes or add host ports.
4. Configure two public HTTPS domains through Coolify **Domains**, selecting the receiving service and its *internal* port:
   - Site example: **https://beta.example.com:3000**, service **app**.
   - Supabase API example: **https://supabase-beta.example.com:8000**, service **gateway**.
   
   These are *Coolify domain settings*, not external browser ports. The user will visit https://beta.example.com; the proxy forwards to container port 3000. Pick and configure actual domains and DNS only for the approved deployment. Never reuse a production managed Supabase URL for the fresh self-hosted database.
5. Make two DNS A records (or equivalent) pointing at the Coolify server's current public IP, and check ACME certificate validation on ports 80/443. With Cloudflare DNS, use DNS-only at first if proxy/ACME redirects or OAuth origin checks are untested. Do **not** move the existing primary website from Vercel merely to test this stack.
6. Set the required variables below in Coolify's encrypted/restricted Environment Variables UI. **Do not commit any secret, upload .env.local to Git, or include tokens in screenshots.** Ensure build-time NEXT_PUBLIC values are passed as Docker build arguments. Changing the app or API public URL and anon key requires a fresh image build, not just restarting the container.
7. Confirm the app, gateway and private containers are healthy, migration exited successfully, domains resolve to the correct service, and the site/MCP origin is consistent.

## Required environment and security

Configure these values in Coolify before first deployment:

| Variable | Purpose |
|---|---|
| APP_URL | **https://** site origin, without trailing slash |
| SUPABASE_PUBLIC_URL | **https://** separate API gateway origin, without trailing slash |
| SUPABASE_HOST_ALIAS | Hostname only from SUPABASE_PUBLIC_URL (the app maps it to host-gateway to reach the proxy over HTTPS); test routing from inside the app container |
| POSTGRES_PASSWORD | Distinct random PostgreSQL credential |
| JWT_SECRET | Random self-hosted Supabase signing secret |
| ANON_KEY and SERVICE_ROLE_KEY | Pair of JWTs signed with exactly JWT_SECRET, generated by docker/supabase/generate-secrets.sh |
| S3_PROTOCOL_ACCESS_KEY_ID and S3_PROTOCOL_ACCESS_KEY_SECRET | Independent random credentials (required by Storage even though nginx denies its S3 protocol endpoint) |
| TOKEN_ENCRYPTION_KEY | Dedicated random 32-byte secret represented as 64 hex digits |
| MCP_SESSION_ENCRYPTION_KEY | **Different** random 32-byte secret for delegated session encryption |

The optional NEXT_PUBLIC_BETA_ONLY flag is passed to both the image builder and runtime. Enabling it requires a nonempty server-only BETA_ACCESS_CODE before opening signup. Changing NEXT_PUBLIC_BETA_ONLY requires rebuilding the Next.js image.

**Private-beta Auth invariant (security fix):** `NEXT_PUBLIC_BETA_ONLY=true` with `BETA_ACCESS_CODE` requires `DISABLE_SIGNUP=true` (so public GoTrue `/auth/v1/signup` / OTP cannot create an identity). The website's `/api/auth/signup` validates the code and then calls `auth.admin.createUser()` server-side using the existing private service-role key. The app receives `BETA_GOTRUE_SIGNUP_DISABLED` from the **same** Compose input as GoTrue; if that setting is not true, invited signup returns 503 rather than allowing a bypass. The private-beta admin creation flow currently requires `ENABLE_EMAIL_AUTOCONFIRM=true`: it does **not send verification email** and preserves the previously active test-beta semantics. If the operator turns off auto-confirm to enable real verification, signup deliberately fails closed until an actual confirmation/invite email flow has been implemented and tested. The waitlist does not depend on GoTrue signup.

**Do not confuse `DISABLE_SIGNUP=true` with disabling beta registration.** The GoTrue public endpoint is closed, but the verified-code server-only admin endpoint remains open. Do not switch back to `DISABLE_SIGNUP=false` as a workaround for a broken invite-code signup: that reopens the bypass. Verify GoTrue `/auth/v1/settings`, direct synthetic signup denial, valid-code `/api/auth/signup`, waitlist persistence and regular existing-user login after every deployment. Never print `BETA_ACCESS_CODE` or service-role JWT in tests/logs.

The checked-in script docker/supabase/generate-secrets.sh generates the six related Supabase stack values. Handle its output privately and set all of them as a consistent set; never post them to GitHub, Coolify logs, or a chat. Generate the other two encryption keys independently with a CSPRNG.

For the candidate deployment the Compose file deliberately defaults **DISABLE_SIGNUP=true** and **ENABLE_EMAIL_AUTOCONFIRM=false**. Do not open public signups until SMTP/email verification, abuse prevention, password policy, tenant/RLS checks and privacy controls are verified. Optional provider secrets are absent until configured. The ChessCoachPal site and /mcp remain a single Next.js process/domain, sharing tenant authorization.

Security checks before exposure:
- No publicly published DB or internal Auth/REST/Storage container ports; test with docker ps and ss.
- No service-role JWT in browser JavaScript, MCP client configuration, public logs or GitHub Actions outputs. The anon key is expected to be public but never treated as a privileged credential.
- HTTPS on both domains, redirect URIs for GoTrue and delegated MCP OAuth, correct forwarded protocol/host, and allowed CORS origin.
- Verify two unrelated teacher accounts cannot access one another's records, website edits and MCP writes enforce the same policies, and high-risk actions require proper consent.
- Verify Auth email/SMTP, account recovery, invite or restricted signup, session refresh, MCP discovery/PKCE/refresh/revocation, Storage uploads, and actual supported ChatGPT/Claude client connectivity.

## Backups, staging acceptance and rollbacks

**Do not admit real teacher data** until there is a durable encrypted off-server backup and a completed restore test of **all three**: PostgreSQL application and Auth data, Supabase Storage files, and essential private configuration/encryption keys. A database dump alone does not include uploaded files or decrypt application-encrypted columns.

A private Standard Cloudflare R2 bucket can receive encrypted backups once a bucket-scoped upload token and tested retention job exist. **R2 free usage is account-wide:** the 10 GB-month Standard allowance is shared with any other R2 buckets, including historical backups. It does not reset the stored object count or accrue every month. Under no circumstances assume Coolify imposes a hard budget cap; enforce a conservative upload size/total storage threshold and separately monitor Cloudflare usage and Class A/B operations before enabling automatic schedules. Never overwrite or rotate a backup until a second-empty-instance restore and checksum check pass.

For a fresh disposable staging database only: run the current single canonical Supabase baseline, verify storage/Auth migrations and schema, perform two-teacher cross-tenant tests, validate signed-in website and MCP CRUD and reports, confirm health/readiness, then test recovery to a **second isolated** instance. Migration/restore tooling must never silently clear a database with real records.

Keep Vercel and the current managed Supabase development instance unchanged during this staged rollout. For a future real-data cutover, migrate Auth identities, teacher tables, Storage objects, grants, encryption secrets and redirect URLs as a coordinated, tested operation. The current repository has pre-v1 breaking-schema constraints; avoid running historic migration chains against live data.

## Operator preflight

For a safe, repeatable static verification, run **`bash scripts/check-coolify-compose.sh`**. It uses only synthetic placeholder values and does not start Docker or access live databases. The checks below describe what it verifies:

- docker compose --project-name ccp-compose-check -f docker-compose.coolify.yml config --quiet
- docker compose --project-name ccp-compose-check -f docker-compose.coolify.yml config --format json and confirm no service exposes host ports, only app/gateway attach to coolify network, and db-data/storage-data volumes persist.
- Confirm the repository's Dockerfile is Next.js standalone and uses Node 24, with the supplied NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY build arguments.
- Confirm root volume free space includes reserves for image pulls/builds, upgrades, database WAL and a separate restore drill.
- Verify the existing Coolify proxy is healthy, and use domain routing rather than direct host ports. Back up live Coolify configuration before any proxy-wide configuration change.

**Acceptance gate:** A healthy initial deployment is only a technical smoke test; public beta readiness still requires domain ownership, secure signup/email, RLS/MCP parity evidence, monitoring, encrypted offsite backups, and a proven restore. Record actual measurements rather than assuming this config is production-safe solely because its static Compose validation passes.


## Release-triggered automatic staging deployment

The staging application is registered in Coolify as resource UUID `wu2pa46yyr4ssws9d1tah0ct`. It uses the private `staging` GitHub Actions environment. The existing GitHub release workflow invokes `.github/workflows/deploy-coolify-release.yml` after a new version passes all release gates and is published. Independently published releases also trigger the same reusable workflow through `release.published`.

- Only a published SemVer GitHub Release with a matching 40-character Git commit is accepted by the server-side forced-command script `scripts/coolify-release-gate.py`. Never deploy mere branch pushes or unverified tags.
- GitHub Actions has staging-scoped secret `COOLIFY_STAGING_DEPLOY_KEY` (dedicated ED25519 private key), secret `COOLIFY_STAGING_KNOWN_HOSTS` (pinned server host key), and variable `COOLIFY_STAGING_HOST` (server IP). These values are not shared with public PRs.
- The restricted SSH user `ccpdeploy` cannot execute arbitrary commands. Its `authorized_keys` entry uses `restrict` and a forced script; no root or sudo privileges are granted. The script accepts only `status` or `deploy vX.Y.Z SHA`, confirms the published tag and commit, then calls Coolify's API with a resource-scoped token for **this one staging application only**.
- Coolify's built-in push-based `is_auto_deploy_enabled` remains **false**. Release deployments explicitly pin the commit hash and update the branch/tag reference. Releases are serialized in GitHub Actions and the SSH gate reports Coolify's final deployment status.
- GitHub Actions `.github/workflows/check-coolify-staging.yml` is a **manual read-only smoke test** for the restricted SSH identity and the HTTPS site/Auth/REST endpoints. Run it after setting up secrets or rotating the server host key.
- The Coolify API token for the restricted deploy user expires after **12 months** from November 16, 2026 and must be rotated before expiry; keep the new token scoped to this staging resource and protect its `0600` file at `/var/lib/chesscoachpal-deploy/.config/coolify-api-token`. Regenerate an SSH key if leaked, delete the prior `authorized_keys` entry, and replace the staging GitHub environment secret.
- Private beta **requires** `NEXT_PUBLIC_BETA_ONLY=true`, a nonempty private `BETA_ACCESS_CODE`, `DISABLE_SIGNUP=true`, `ENABLE_EMAIL_SIGNUP=true`, and the current synthetic-beta `ENABLE_EMAIL_AUTOCONFIRM=true` until real email verification is implemented. Domain `https://beta.chesscoachpal.com` serves the site and `/mcp`; `https://api-beta.chesscoachpal.com` serves Supabase API. Moving canonical DNS or retiring Vercel is a **separate** change; this security fix does not authorize it.

The staging installation is a disposable acceptance environment. A passing smoke test is not a backup/restore rehearsal, and production migration must remain gated on authentication, MCP client testing, a verified encrypted PostgreSQL and Storage backup, and proper rollout controls.
