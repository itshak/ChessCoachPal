# Design — remaining agent coaching actions

## Shared operation model

Extend the current Zod-typed MCP catalogue and existing teacher-scoped coaching service, not a second database/domain implementation. Require stable UUIDs for write targets; search and resolution return only authorized minimal candidates. Expose scopes through OAuth discovery and suppress tools not granted to that client. Keep teacher identity server-derived; RLS is enforced on domain queries/mutations.

## Bounded writes

Every write uses a fresh UUID idempotency key (retries reuse the key), expected revision for updates, a transactional receipt and conflict responses. For session scheduling validate workplace, participant membership snapshots, timezone/DST, start/end conflicts and group ownership. Reject ambiguous names or missing context. For resource links validate HTTPS/provider IDs and consent boundaries, and never server-fetch arbitrary learner-supplied links. High-impact bulk/destructive mutations remain unavailable unless a tested expiring payload-bound confirmation protocol is added. The web remains full manual fallback.

## Automated verification

Run real HTTP MCP/OAuth contract and browser tests against a **synthetic** GitHub Actions database, not ChatGPT/Claude APIs or real learner data. Cover two separate teacher accounts, read/write scopes, OAuth code/token replay and revocation, wrong-workplace targets, duplicate-idempotency scenarios, stale concurrency, invalid resource URLs and downstream outages. Test independent website corrections after each supported tool action and ensure receipts contain no student text/prompts/credentials.

## Manual release-only boundary

Neither a public deployment nor real AI vendor credentials are required to finish this change. Document connector setup and limitations. Actual supported ChatGPT/Claude client compatibility shall be checked by the maintainer using a locally controlled HTTPS-reachable synthetic instance **immediately before v0.1.0 publication**, with explicit sign-off in docs/RELEASING.md.
