# Remote ChatGPT and Claude MCP connector — expanded synthetic CI coverage; live clients release-only

**Important:** The initial server-side MCP/OAuth foundation passed GitHub automated CI/E2E and is archived as development work. This **does not** establish real ChatGPT/Claude interoperability. Do **not** test real provider clients during development milestones; both live client tests are required **only once, immediately before publishing v0.1.0, on the maintainer's machine**, using a synthetic locally controlled HTTPS-reachable instance. Record sanitized evidence via [LOCAL_CLIENT_ACCEPTANCE.md](LOCAL_CLIENT_ACCEPTANCE.md). No production approval or voice-tool support is implied.

## Host configuration

1. Deploy a **fresh pre-1.0 ChessCoachPal database** and web app behind HTTPS. Do not reset or migrate an existing production database during verification. Follow the application self-hosting guide.
2. Set \`MCP_PUBLIC_ORIGIN=https://coach.example.org\` (your actual public origin, no trailing path) and \`MCP_SESSION_ENCRYPTION_KEY\` to 32 cryptographically random bytes encoded as 64 hex characters. Keep it **server-only** and backed up securely. Neither it nor your Supabase service-role key belongs in a client prompt.
3. Ensure the public HTTPS origin can serve \`/mcp\`, \`/.well-known/oauth-protected-resource\`, \`/.well-known/oauth-authorization-server\`, \`/oauth/register\`, \`/oauth/authorize\`, \`/oauth/token\`, \`/oauth/revoke\`. Reverse proxies must not cache OAuth responses. Configure per-IP registration and authorization rate limits at the reverse proxy; **registration is public** in this pre-release implementation.
4. Log into ChessCoachPal as your normal teacher account. For OAuth connection consent, if you reach a page asking you to sign in, open the normal \`/login\` in that browser, sign in, then revisit/refresh the pending authorization page. Verify the redirect hostname and permissions before approving.
5. To revoke an AI connection immediately, visit **Account Settings → Manage ChatGPT / Claude connections** (or \`/ai-connections\`), then click **Revoke access**. You can continue using the website with no AI account.

The MCP endpoint URL is \`https://coach.example.org/mcp\` (replace the example origin). It provides stateless Streamable HTTP JSON-RPC (protocol 2025-06-18), OAuth 2 authorization-code + S256 PKCE, public dynamic client registration, and short-lived opaque access tokens with rotating refresh tokens. Discovery schemas come from one Zod catalogue; \`/api/agent/openapi\` supplies a developer reference generated from the same definitions.

## Claude

On a supported Claude plan, in **Customize → Connectors**, choose **Add custom connector**, enter the HTTPS **/mcp** URL, use the connector's detected OAuth settings and **Register automatically** (dynamic client registration), and sign in/authorize as the teacher. Enable the connector for the conversation. Anthropic's public instructions are [Custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

**Not yet tested against a real Claude account.** Exact controls and client behavior may vary by plan and product version. Claude's remote service needs to reach the public HTTPS endpoint; localhost does not work for this cloud-managed connection.

## ChatGPT

An authorized organization/workspace developer or administrator can create a custom MCP app/connection by supplying the **/mcp** URL and configuring OAuth authorization through the server's advertised discovery endpoints. Enable write-capable tools only on a plan/workspace that supports full MCP write actions. ChatGPT's current [custom MCP server guidance](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt) notes that full write-capable MCP is available in beta on eligible Business, Enterprise or Edu workspaces; Pro custom connections can be read-only. **Do not assume every consumer ChatGPT account has write tools.**

**Not yet tested against a real ChatGPT account.** The endpoint is a proposed integration, not an asserted compatible connector. Remote HTTPS reachability or a supported secure tunnel is required; direct localhost is not available to ChatGPT cloud clients.

## Available delegated MCP tools (v0.1.0 development candidate)

The server exposes the following **exact tool names**, backed by the same teacher-owned data as the website. These have synthetic OAuth/MCP + fresh-Supabase GitHub tests; this is **not** a claim that a live ChatGPT or Claude client has passed.

| Area | Read tools | Write tools |
| --- | --- | --- |
| Workplaces | `ccp_v1_workplaces_list`, `ccp_v1_workplaces_enrollments` | `ccp_v1_workplaces_create`, `ccp_v1_workplaces_update`, `ccp_v1_workplaces_enroll` |
| Students | `ccp_v1_students_search` | `ccp_v1_students_create`, `ccp_v1_students_update` |
| Groups | `ccp_v1_groups_list`, `ccp_v1_groups_members` | `ccp_v1_groups_create`, `ccp_v1_groups_update`, `ccp_v1_groups_enroll`, `ccp_v1_groups_unenroll` |
| Sessions | `ccp_v1_sessions_list`, `ccp_v1_sessions_details`, `ccp_v1_sessions_participants` | `ccp_v1_sessions_create`, `ccp_v1_sessions_reschedule`, `ccp_v1_sessions_cancel`, `ccp_v1_sessions_note_update` |
| Attendance | `ccp_v1_attendance_preview` | `ccp_v1_attendance_record` (one student per call) |
| Chess learning | `ccp_v1_chess_categories_list`, `ccp_v1_chess_observations_list`, `ccp_v1_chess_resources_list` | `ccp_v1_chess_observations_propose`, `ccp_v1_chess_resources_link` (propose/link only; teacher review in website) |

**Required guardrails:** Use stable UUIDs discovered from an authorized list/search; duplicate names return `NEEDS_RESOLUTION`, not a guessed write. Each new coaching mutation uses a UUID `idempotencyKey`; replay the **same** key and payload on transport retry, and use a **new** key only for a distinct intentional operation. Updates and reschedules/cancellations additionally require `expectedUpdatedAt` from the latest record revision (or `updated_at` returned by list/details). Group membership removal, rescheduling and cancellation require `confirmed: true` for a specific record. Session start times must be ISO 8601 instants with an explicit UTC offset. Session writes reject overlapping teacher time; group-session rosters remain historically frozen when live membership changes.

New coaching writes use a single transactional database mutation that binds the teacher identity to the delegated OAuth session, enforces owner IDs, returns a minimal `operation`/`entityId`/`revision`/`actorId`/`clientId`/`idempotencyKey` receipt, and rejects stale writes or mismatched idempotency-key replays. Existing attendance/note and learning operations retain their separate preexisting validated contracts and scopes. Receipts must not contain student names, notes, prompts, or OAuth secrets. `coach:read` clients cannot discover or invoke write tools.

**Not exposed:** broad SQL/database access, bulk attendance edits, deletion of students or lesson history, family notifications, financial mutations, observation approval, remote chess-provider content fetching, or live voice-tool entry. The standalone `/coaching` website remains available without AI accounts or during provider outages.

## Troubleshooting and security

- \`401\`: not connected, expired, or revoked authorization; reconnect and reapprove if necessary.
- \`FORBIDDEN\`: insufficient \`coach:read\` or \`coach:write\` scope.
- \`NEEDS_RESOLUTION\`: multiple matching student or lesson names; select a listed stable ID rather than guessing.
- \`CONFLICT\`: a stale revision or changed idempotency payload; re-read the record and ask the teacher before trying a new operation.
- The website is always available without either provider; provider outages cannot commit unconfirmed writes.

**Security caveats:** The first-release code is still undergoing tests and review. Before allowing real children's data, confirm externally accessible HTTPS, origin/cookie behavior behind your proxy, registration abuse limits, token encryption key custody, cross-teacher isolation, and revocation with real client versions. Do not log access/refresh tokens, OAuth codes, model prompts, or student notes. Use only synthetic data in integration trials.
