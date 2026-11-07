# Remote ChatGPT and Claude MCP connector — Milestone 2 (in verification)

**Important:** This server implementation is not yet an accepted interoperability claim. Automated HTTP and browser tests are separate from the **required real ChatGPT and real Claude client demonstrations**. No production approval or voice-initiated tool support is implied.

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

## Available tools (limited safe subset)

- \`ccp_v1_workplaces_list\`, \`ccp_v1_students_search\`, \`ccp_v1_groups_list\`, \`ccp_v1_groups_members\`
- \`ccp_v1_sessions_list\`, \`ccp_v1_sessions_participants\`, \`ccp_v1_attendance_preview\`
- \`ccp_v1_attendance_record\`: **one student** per call with explicit session/student IDs, preview's \`updated_at\`, a new UUID idempotency key and a confirmed status. Bulk changes are deliberately **not exposed**.
- \`ccp_v1_sessions_note_update\`: updates an identified session's topic/note against its exact revision and an idempotency key.

All tools read and write through a real delegated teacher session, Postgres row-level security, and the existing coaching tables. The two SQL mutation functions atomically record a minimal receipt and reject stale revisions or duplicate-but-different payloads. Receipts contain IDs, operation and revision, not full student notes or model prompts. A user can edit the resulting record in \`/coaching\`.

**Deliberately not exposed yet:** creation/editing of students, groups or workplaces; session scheduling or rescheduling; bulk attendance; destructive actions; financial operations; family notifications; resource linking; provider voice mode. Do not treat the proposal's broader initial catalogue as implemented.

## Troubleshooting and security

- \`401\`: not connected, expired, or revoked authorization; reconnect and reapprove if necessary.
- \`FORBIDDEN\`: insufficient \`coach:read\` or \`coach:write\` scope.
- \`NEEDS_RESOLUTION\`: multiple matching student or lesson names; select a listed stable ID rather than guessing.
- \`CONFLICT\`: a stale revision or changed idempotency payload; re-read the record and ask the teacher before trying a new operation.
- The website is always available without either provider; provider outages cannot commit unconfirmed writes.

**Security caveats:** The first-release code is still undergoing tests and review. Before allowing real children's data, confirm externally accessible HTTPS, origin/cookie behavior behind your proxy, registration abuse limits, token encryption key custody, cross-teacher isolation, and revocation with real client versions. Do not log access/refresh tokens, OAuth codes, model prompts, or student notes. Use only synthetic data in integration trials.
