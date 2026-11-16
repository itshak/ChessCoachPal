# Canonical-domain cutover: ChessCoachPal remains a private beta

**Operator state, 2026-11-16:** PREPARED IN GIT; LIVE CUTOVER NOT YET COMPLETED. This is a runbook, not approval to launch publicly; invite-code registration and waitlist remain mandatory. Use the existing Coolify Git-based Compose application and preserve its named database and Storage volumes. The user has confirmed there are no teachers to migrate and explicitly does **not** want a `beta` redirect, Vercel rollback window or duplicate hosting environments. This does not authorize deleting any application records, secrets, or backups.

## Target

| Hostname | Destination |
| --- | --- |
| `chesscoachpal.com` | Existing Coolify Compose `app:3000`; website, `/mcp` and `/oauth/*` |
| `www.chesscoachpal.com` | The same site (canonical app origin remains apex) |
| `api.chesscoachpal.com` | Existing Coolify Compose `gateway:8000`; Auth, PostgREST and Storage |
| `beta.chesscoachpal.com` | **Remove** DNS and Coolify routing after successful cutover; no redirect |
| `api-beta.chesscoachpal.com` | **Remove** DNS and Coolify routing after successful cutover; no redirect |
| Vercel project | **Delete** only after new hostnames are confirmed functional; no rollback period |

No new database, new Supabase project, new application container network or independent MCP backend is needed. DNS-only changes are **insufficient** because the site/API URLs are embedded in the Next.js build, Supabase GoTrue Auth configuration and OAuth discovery.

## 1. Preflight before changing public DNS

1. Take a recoverable PostgreSQL/Auth dump, Storage volume copy, and separately encrypted configuration/key backup **outside the host**. Verify a restore/checksum in a second isolated instance before inviting real teachers. Never run `docker compose down -v` or erase the existing named volumes.
2. Record current GitHub Release tag/SHA, Coolify application UUID, deployment state, current Compose volume names and relevant configuration **without copying secrets to issues, chats, CI logs or Git**. Confirm sufficient free disk space, healthy database, Auth, Storage, gateway and app, and the intended release commit. Leave unrelated Coolify projects untouched.
3. Establish authenticated **administrative access to Coolify or the OVH host**. The `ccpdeploy` forced-command SSH account used by Actions is intentionally limited to `status` and `deploy <tag> <sha>` and **cannot** change domains, settings or environment variables. Do not weaken this restriction merely for cutover.
4. Confirm that existing app Auth data does not require user migration; domain change will invalidate/re-authorize some existing provider OAuth/MCP sessions. Never regenerate `JWT_SECRET`, `POSTGRES_PASSWORD`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY` or `MCP_SESSION_ENCRYPTION_KEY` during a hostname-only migration.

## 2. Edit the existing Coolify resource (not a new installation)

1. Register `https://chesscoachpal.com:3000` and, if served as a direct alias, `https://www.chesscoachpal.com:3000` for the `app` service. Register `https://api.chesscoachpal.com:8000` for the `gateway` service. These are **Coolify internal target ports**, not externally exposed ports; visitors still use port 443. Keep other apps' routes intact.
2. Set environment values: `APP_URL=https://chesscoachpal.com`, `SUPABASE_PUBLIC_URL=https://api.chesscoachpal.com`, `SUPABASE_HOST_ALIAS=api.chesscoachpal.com`. The Compose configuration derives `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `MCP_PUBLIC_ORIGIN`, GoTrue `GOTRUE_SITE_URL`, `GOTRUE_JWT_ISSUER`, `API_EXTERNAL_URL` and Storage public URL from these values. Check `ADDITIONAL_REDIRECT_URLS` for obsolete beta origins; keep only approved canonical callback destinations.
3. **Maintain private beta enrollment:** preserve `NEXT_PUBLIC_BETA_ONLY=true`, the existing nonempty server-only `BETA_ACCESS_CODE`, the invite-code field, and `/api/auth/waitlist`. Never change the flag to `false` or turn registration into a public self-service flow. Current `DISABLE_SIGNUP=false` allows legitimate web signup but may also permit bypassing the code by calling public Supabase GoTrue directly; **block the cutover until the direct-Auth bypass is fixed and tested**. Do not set `DISABLE_SIGNUP=true` alone, because that would also break legitimate beta-code signup with the current code. Keep existing email confirmation behavior unchanged until a separately tested SendPulse/email change.
4. **Force a full new build** (not a container restart) so Next.js public Supabase URL and any public beta flag are compiled with the new values. Observe the one-shot migration without resetting Auth or public data; confirm preserved named volumes and service health. Keep the HTTPS proxy and TLS mode compatible with Auth and OAuth callback URLs.

## 3. Update DNS, issue certificates and test

1. In the existing Cloudflare zone, remove the two Vercel apex A records and create **one** A record to the same Coolify origin IP currently serving the beta hostnames. Replace the Vercel `www` CNAME with a CNAME to `chesscoachpal.com` or a consistent A record to the Coolify origin. Create `api.chesscoachpal.com` A to that same origin. Use DNS-only initially if necessary for origin ACME issuance, with correctly configured TLS and no secret leakage.
2. Verify valid public trusted TLS certificates and correct SNI/service routing for apex, `www` and API. Check HTTPS from an independent client; do not disable certificate verification in acceptance checks. If ACME issuance follows DNS rather than preceding it, accept the short no-user cutover window but do not claim completion before TLS is valid.
3. Validate site root and browser assets; `/.well-known/oauth-authorization-server`, protected-resource discovery, `/oauth/register` and `/oauth/token` contract (without leaking tokens); Supabase `/auth/v1/health`, `/rest/v1/` and Storage health; an authenticated **synthetic** teacher/student/lesson write-read-correction; MCP authentication/scopes and read/write parity; invite-code signup, waitlist persistence, and rejection of direct Auth signup without a code. Check links and callback origins contain no `beta` or Vercel URLs.
4. Run the manual [canonical-beta smoke workflow](../.github/workflows/check-coolify-beta.yml), and verify the restricted published-release workflow deploys the tested tag and reports the exact running SHA. Manual live ChatGPT/Claude MCP tests remain required; record them as **pending** unless actually performed.

## 4. Remove the obsolete domains and Vercel immediately after verification

1. Delete `beta.chesscoachpal.com` and `api-beta.chesscoachpal.com` DNS A records and their Coolify domain bindings. **Do not** install redirects, aliases or grace-period hosting for beta.
2. Delete the old Vercel `chess-teaching-assistant` project and detach any remaining Vercel custom domains. Before deletion verify that any legacy auxiliary `*.vercel.app` hostname in that project has no unrelated consumer. Do not touch other Vercel projects or non-ChessCoachPal apps.
3. Delete the now-obsolete repository Vercel deploy token from GitHub Actions secrets and retire Vercel-specific project settings once the GitHub release workflow deploys only to Coolify. GitHub Releases/tags and the strict synthetic CI gate remain unchanged.
4. The old `vercel.json` has a daily `/api/cron/event-reminders` schedule. Enable the Coolify optional `cron` service or a secured Coolify scheduled task **when reminder emails are enabled**, with `CRON_SECRET` set and endpoint reachability tested. Until SendPulse is configured, explicitly document reminder emails as unavailable; do not pretend they migrated automatically.
5. After verified access, rotate/rename the historically named `COOLIFY_STAGING_*` GitHub environment variables/secrets and server status labels as a separate coordinated change; the same restricted key/resource can be used temporarily. Do not create a second deployment just for naming aesthetics.

## Acceptance record

- [ ] Coolify administrative access established; existing volumes/data backed up and integrity checked
- [ ] Canonical site and API URLs saved in **existing** Coolify app; full rebuild completed
- [ ] Cloudflare apex/www/API DNS on Coolify, public TLS valid for all three hosts
- [ ] **Beta remains invite-only:** signup with code works, without code fails, direct GoTrue bypass is blocked; waitlist insert works; Auth callbacks, synthetic data workflow and MCP/OAuth checked
- [ ] Restricted GitHub release deployment and canonical-beta smoke workflow passed
- [ ] Beta domain bindings/DNS removed with **no** redirect
- [ ] Old Vercel project, deployment workflow dependency and secret removed
- [ ] Cron/reminder behavior explicitly re-homed or kept off pending SendPulse
- [ ] SendPulse SMTP verification and email delivery **pending owner setup**

Keep unchecked items unchecked until live evidence exists. Avoid mentioning unapproved pricing or private strategy in public documents.
