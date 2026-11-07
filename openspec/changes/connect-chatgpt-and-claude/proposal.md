# Change: connect-chatgpt-and-claude

- **Status:** IN PROGRESS / NOT ACCEPTED OR ARCHIVED — release milestone 2 of 5
- **Target:** ChessCoachPal v0.1.0
- **Depends on:** Shared coaching domain/service in [complete-coaching-workflows](../archive/2026-11-07-complete-coaching-workflows/proposal.md); security/authorization testing in [remove-cognote-legacy-and-secure-data](../remove-cognote-legacy-and-secure-data/proposal.md)
- **Release roadmap:** [OpenSpec v0.1.0](../../ROADMAP-v0.1.0.md)

## Why

ChatGPT and Claude are the **primary entry interface** of ChessCoachPal. A website-only port does not satisfy the product vision. PR #1's experimental /api/agent/v1 route accepts Supabase user sessions but does **not** implement delegated AI-client authorization, MCP transport or tested connectivity. Calling it ChatGPT/Claude integration would be inaccurate.

## Change

Deliver a real self-hosted **MCP-compatible tool server** and, where useful, OpenAPI schemas produced from the same typed operation contract. Connect supported ChatGPT and Claude clients using delegated, revocable teacher authorization. Implement safe discovery, search, disambiguation, confirmation, idempotent operations, revision conflict handling, minimal audit receipts and structured errors. Agents perform common scheduling and attendance writes; website and agents see identical data.

## Initial implementation checkpoint — partial delivery in PR #5

The first gateway is implemented and verified by [CI 42410931916](https://github.com/itshak/ChessCoachPal/actions/runs/42410931916) and [synthetic E2E 42410931858](https://github.com/itshak/ChessCoachPal/actions/runs/42410931858). It provides remote MCP HTTP transport, discoverable typed tools/OpenAPI, delegated OAuth PKCE, teacher-bound scopes, grant revocation, privacy-minimized transactional receipts, student/workplace/group/session reads, single-student attendance writes and shared lesson-note updates.

**This is not the complete milestone.** Full create/edit and scheduling operations, resource linking, independent MCP two-teacher and client security checks, and actual supported ChatGPT and Claude client demonstrations remain outstanding. Bulk attendance commits are intentionally not exposed. Keep this change open, preserving the original acceptance conditions; never archive it as accepted based only on a synthetic HTTP client.

## Initial tool scope

List/create/edit workplaces and students; list/create/enroll class groups; find and create/reschedule sessions; preview and record group attendance; upsert notes; list/link selected learning resources. Limit tools to implemented domain methods with passing security tests. Reports can be read-only preview for v0.1.0.

## Exclusions

No in-site proprietary chatbot, unrestricted SQL, service-role credential exposure, provider voice-mode promises, payment mutations, or mass family notifications. External AI accounts are not needed to use the website.

## Acceptance

From **one real authenticated ChatGPT-compatible client and one real authenticated Claude-compatible client**, the teacher can find a lesson, record a group's attendance and topic, see a receipt, and correct the same records in the website. Another teacher's data is inaccessible. Duplicate retries do not duplicate writes. Ambiguous names produce a question, not a guess. Authorization revocation immediately blocks subsequent tool calls. Provide precise client setup documentation and captured sanitized test evidence.

