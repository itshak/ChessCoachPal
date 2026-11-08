# Disposable hosted MCP acceptance — Vercel + Supabase (v0.1.0 final gate)

**Run only immediately before release, from the maintainer's own computer.** This is an optional alternative to a local synthetic Docker instance exposed through a temporary HTTPS tunnel. The hosting is *staging*, not a v0.1.0 GitHub release or evidence of production suitability. Keep package version at 0.0.0, use fictional students and a separate Supabase database, and do not touch a real user database.

## Before starting

- Check client eligibility **first**. Current OpenAI guidance limits ChatGPT custom MCP **write** connections to Business and Enterprise/Edu on the web; an individual Pro custom connection may be read-only. Claude currently supports custom remote MCP connectors across individual and organization plans. Codex CLI is a useful *extra* MCP client but cannot replace the actual ChatGPT and Claude acceptance.
- Use two isolated staging resources: a fresh hosted Supabase project and a Vercel project dedicated to ChessCoachPal staging with a **stable HTTPS hostname**. A Vercel Preview deployment protected by Vercel Authentication will prevent remote ChatGPT/Claude OAuth unless its access is deliberately configured; a synthetic-only staging project with its own stable domain is simpler.
- No real student records, no production secrets, no public screenshots of tokens/authorization codes, and no automatic reset of an existing database. Do not publish a GitHub release or merge a package-version bump for this test.

## 1. New, empty Supabase staging project

Create a **new** project in Supabase Dashboard and obtain the project URL, public/anon key, server-only service role key and project ref from its project settings. Enable the required Data API/auth services and review teacher RLS. In Supabase Auth, set the Site URL to your actual staging hostname; allow that hostname's auth callback URLs (for example `https://YOUR-STAGING-HOST/**`). For this disposable account, configure email confirmation or test-account onboarding in a way that lets you sign in reliably.

Use a separate local checkout of current, CI-green main, then apply **only to this newly created staging project**:

```bash
npm ci
npx supabase login
npx supabase link --project-ref YOUR_NEW_PROJECT_REF
npx supabase db push --dry-run --remote
# Inspect the target and pending two canonical migrations, then:
npx supabase db push --remote
```

Never use db reset or clear-data.sql against existing, non-synthetic data. The app's canonical schema lives under supabase/migrations. Hosted behavior is not yet live-verified; if migrations fail, stop and fix via a GitHub PR with green synthetic CI.

## 2. Dedicated Vercel staging project

Import the ChessCoachPal GitHub repo into a **new** Vercel project, configured as Next.js. Choose a stable staging hostname (Vercel domain/alias or a controlled staging subdomain) and make sure ChatGPT and Claude can reach its HTTPS paths. Deploy current main (version 0.0.0); no version tag or GitHub Release is involved. Vercel project **Environment Variables** must contain:

| Variable | Value / exposure |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | New Supabase project URL; browser-visible |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | New Supabase public/anon key; browser-visible |
| SUPABASE_SERVICE_ROLE_KEY | New staging service-role key; **server-only** |
| TOKEN_ENCRYPTION_KEY | Fresh independent 32 random bytes / 64 hexadecimal characters; **server-only** |
| MCP_SESSION_ENCRYPTION_KEY | Different fresh 32 random bytes / 64 hexadecimal characters; **server-only** |
| NEXT_PUBLIC_SITE_URL | Exact `https://YOUR-STAGING-HOST` |
| MCP_PUBLIC_ORIGIN | Exact `https://YOUR-STAGING-HOST`, **without /mcp or trailing path** |

Generate each encryption key locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`; do not put the output in a chat, PR, screenshot or repository. Do not set CHESSCOACHPAL_DEPLOYMENT=hosted; leave self-hosted mode. Configure Vercel firewall/rate limits especially for public /oauth/register and signup, and set environment variables for the correct deployment environment. **Redeploy after env changes.** Avoid broad public exposure beyond the short synthetic-data test.

## 3. Preflight the MCP origin

From your local computer verify:

```bash
curl -i https://YOUR-STAGING-HOST/.well-known/oauth-protected-resource
curl -i https://YOUR-STAGING-HOST/.well-known/oauth-authorization-server
curl -i -X POST https://YOUR-STAGING-HOST/mcp -H 'Content-Type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

The two discovery URLs should return metadata for **this exact hostname**. An unauthenticated POST to /mcp should return 401 with a WWW-Authenticate challenge; this is correct. GET /mcp returns 405 by design. Confirm the app website opens, a synthetic teacher can sign in, and the coaching page can create a fictional workplace, student and lesson.

## 4. Connect the real products (not substitutes)

**ChatGPT web:** In an eligible Business or Enterprise/Edu workspace, open Plugins, use the plus / Add custom MCP server action, supply `https://YOUR-STAGING-HOST/mcp`, follow OAuth discovery/registration and explicitly approve only expected `coach:read` and `coach:write` permissions. Review the tool list and write permissions. Select the resulting plugin in a new conversation via @ or the plugins picker. If ChatGPT offers read-only tools or cannot get OAuth write scope, record it as a failed release gate. Current guide: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt

**Claude:** In Customize > Connectors > Add custom connector, enter the same HTTPS /mcp URL. Choose Sign in now/when needed and OAuth client **Register automatically** (this server supports dynamic registration), then sign in to the synthetic teacher account and authorize. Enable the connector in the conversation. Current guide: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp

**Codex CLI (supplemental, not ChatGPT):** Configure on your machine, not in the repository, and authenticate the same test teacher:

```bash
codex mcp add chesscoachpal --url https://YOUR-STAGING-HOST/mcp
codex mcp login chesscoachpal
codex mcp list
```

Inside Codex use /mcp to verify tools; follow its consent flow and never paste a bearer token. Codex adds useful troubleshooting evidence but does not satisfy either required real ChatGPT/Claude browser test.

## 5. Required behavior per actual ChatGPT and Claude

1. **Read first:** List your fictional workplaces/students/sessions, verify stable IDs, and verify the connected teacher cannot see a second synthetic teacher's records.
2. **Create:** Explicitly approve one synthetic student creation (e.g. a fictional name) using `ccp_v1_students_create` with a fresh UUID idempotency key. Check the receipt and the website.
3. **Revision-checked edit:** Read the latest record revision, then explicitly approve `ccp_v1_students_update` using the exact student ID, expectedUpdatedAt, and a new UUID idempotency key. Verify stale changes are rejected.
4. **Attendance/lesson:** Prepare one fictional lesson, preview its frozen roster, and approve one student's attendance or a shared lesson note update. No bulk mutation.
5. **Website correction:** Modify the same record via the /coaching website; refresh and read back in the AI client to verify a single shared source of truth.
6. **Revoke:** In /ai-connections on the website, revoke the client's grant. Repeat a read with the old connection; it must no longer access any data.
7. **Evidence:** Record tested main SHA, date, vendor plan/product, staging hostname (without query parameters), scopes, high-level success/failure, redacted receipt IDs, website correction and revocation. Never preserve token/code/student data or unredacted prompts. Use docs/LOCAL_CLIENT_ACCEPTANCE.md and docs/STATUS.md to record acceptance.

Repeat the full create/edit/correction/revoke procedure **once in real ChatGPT and once in real Claude**. A Codex or HTTP simulation never substitutes for either. If provider OAuth metadata/refresh behavior fails, keep release blocked, fix the implementation through GitHub CI/PR and repeat the live check. After success, revoke grants and remove the temporary Vercel deployment, database and secrets or explicitly isolate them for later staging use.

## Release rule

Only after the historic privacy/license decision is approved and both real clients pass may the maintainer sign the manual checkbox. Only then prepare a reviewed 0.1.0 package/changelog PR; its merge starts GitHub release automation.
