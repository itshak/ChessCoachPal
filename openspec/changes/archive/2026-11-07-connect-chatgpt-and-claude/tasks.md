# Archived milestone 2 — verified MCP/OAuth foundation

**Archival disposition (2026-11-07):** The *verified initial MCP/OAuth gateway* is accepted as a GitHub-CI-tested development foundation, **not** a claim that every item in the original proposal has shipped. Main merge [PR #5](https://github.com/itshak/ChessCoachPal/pull/5), commit [77b307f](https://github.com/itshak/ChessCoachPal/commit/77b307fb6055fd55fd0d74519ff6e04ccea61ffe), post-merge [CI 42412035420](https://github.com/itshak/ChessCoachPal/actions/runs/42412035420) and [E2E 42412035415](https://github.com/itshak/ChessCoachPal/actions/runs/42412035415) (26 passed, 5 skipped) provide automated evidence. **Unimplemented CRUD/scheduling/learning-resource tools and additional automated hardening are transferred to [expand-agent-coaching-tools](../../expand-agent-coaching-tools/proposal.md); all actual ChatGPT and Claude client checks are moved to the *final local prepublication sign-off* in [Milestone 5](../../verify-self-hosting-and-release-v0-1-0/proposal.md).** Real client interoperability remains unverified. No local/manual tests are required to close development milestones; only the final v0.1.0 publication has that manual gate.

The original proposal's wider goals were **split**, not all ticked. This checklist covers only the archived, merged and automated-verified foundation. Unimplemented items are not marked done.

- [x] Stateless remote MCP JSON-RPC endpoint, typed Zod-based discovery and generated OpenAPI.
- [x] OAuth 2 authorization-code/S256 PKCE consent, registered callback allowlists, delegated teacher scopes, encrypted sessions, expiry/refresh and revocation.
- [x] Teacher-owned read tools for workplaces, student search, groups/members, sessions and frozen rosters.
- [x] Individual attendance preview/record and shared session-note update; optimistic revision conflicts and atomic idempotency receipts.
- [x] Ambiguous same-name students return NEEDS_RESOLUTION without an arbitrary write; unsupported bulk and destructive actions are not exposed.
- [x] Automated synthetic OAuth/MCP browser and security path, two-teacher isolation, token expiry/replay/revocation and website record parity on main.

**Transferred to [expand-agent-coaching-tools](../../expand-agent-coaching-tools/tasks.md):** creation/editing/enrollment and scheduling/rescheduling tools, learning-resource links, fuller read coverage, contract/negative tests, mutation receipts/auditing and further authorization/concurrency/abuse hardening, all automated in GitHub.

**Transferred to [final release](../../verify-self-hosting-and-release-v0-1-0/tasks.md):** actual ChatGPT and actual Claude authorization/record update/website-correction demonstrations, performed manually **once immediately before v0.1.0 publication** on the maintainer's machine with a locally managed, HTTPS-reachable synthetic test instance. No actual-provider session is a development-milestone requirement.

Original original-task IDs 2.1–2.14 were scoped more broadly than delivered; consult the Git history for their unchecked historical state. Archive status does not waive deferred requirements or authorize publishing.
