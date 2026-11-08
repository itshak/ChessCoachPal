# Design — same domain service, website adapter and MCP adapter

The canonical teacher-owned business service must be called from both website and `/mcp`. Do not add a separate reporting connector or parallel formulas. Use delegated teacher JWT and RLS for MCP; reject foreign/unknown IDs indistinguishably.

For the first slice, `lib/server/coaching-report-service.ts` centralizes bounded Supabase queries and workload limits. The existing website `GET /api/coaching/report` and new `ccp_v1_reports_workplace_summary` both call it. Calendar-local inclusive dates are validated; teacher minutes count sessions once, attendance counts participants. CSV and text use the existing sanitized `lib/coaching-report.ts` formatters. This read-only tool requires `coach:read`, returns no learner PII, and supports optional `format=json|csv|text`.

`scripts/mcp-parity-audit.mjs` verifies route/page/component inventory, HTTP methods, real MCP names, complete-route E2E references and 93 scenario count. PR CI runs `scripts/mcp-parity-pr-guard.mjs` on the merge-base diff: business UI/API changes must include registry, MCP catalogue and authenticated E2E changes in the same PR. Release `--strict` additionally checks all 93 cases are marked verified and all routes fully covered.

The PR gate is a structural minimum: reviewers must still evaluate *all* fields, behavior and scopes; a reference to a test file does not itself prove it passes. Continue implementation by domain in reviewable increments. Do not call an incremental slice "full parity".
