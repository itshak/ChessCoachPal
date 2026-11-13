# ADR-0003: Every teacher website feature has equivalent MCP functionality

- **Status:** Accepted — binding policy
- **Date:** 2026-11-08
- **Scope:** All teacher-owned business functionality, fields, data, queries, actions, reports, exports and future feature PRs
- **Related:** [ADR-0001](0001-pre1-breaking-changes.md), [parity OpenSpec](../../openspec/changes/enforce-mcp-website-functional-parity/proposal.md), [audit](../../scripts/mcp-website-parity.json), [93-case checklist](../MCP_WEBSITE_PARITY_CHECKLIST.md)

## Context
ChessCoachPal is **MCP/Plugin first**, with an optional website viewer/editor. The audited starting point had 43 teacher-business API surfaces: 40 missing complete MCP parity, 3 partial. Existing 28 MCP tools do not cover every operation, editable field or report. A tool-name inventory is not a behavioral test.

## Decision
**Each new or modified teacher website business feature SHALL have a discoverable, authorized, equivalent MCP operation through the existing `/mcp` gateway in the same PR.** This includes all ordinary readable/editable fields, aliases, search and pagination, create/update/clear, historical records, notes, attendance, corrections, schedule, settings, reports, CSV/text export, finance, notifications, import/export and lifecycle operations. The same rule applies to any newly added business UI route or component, even when it reads/writes Supabase directly rather than through an API route. The website is never the exclusive business interface.

1. Website and MCP MUST call the same teacher-scoped validated domain service, with matching result fields, date/timezone semantics, null-clears, optimistic revisions, idempotency and error handling. One MCP tool on a route is not sufficient if other actions/fields are inaccessible.
2. New business features MUST update the versioned parity registry and deliver MCP catalogue/tool implementation, website↔MCP synthetic integration tests and permission/tenant isolation tests in the same PR.
3. Add tools to the **existing ChessCoachPal `/mcp` connection**, not a separate report connector. Use typed allowlists, per-resource permissions and least-privilege OAuth scopes. Never expose arbitrary SQL, service-role credentials, auth tokens, or unrestricted table patches.
4. Sensitive guardian/finance/delete/bulk-export/communications actions MUST use purpose-limited permission and preview/confirmation/receipt patterns. Password/MFA/OAuth grant/payment-card entry may require a secure browser handoff; where appropriate MCP starts and tracks approval, but never receives the secret. External webhooks, guardian-originated actions and push-device registration belong to different principals, not ordinary teacher parity.
5. Functional equality MUST be tested on a fresh synthetic tenant via authenticated website and delegated MCP clients, comparing persisted state/results and rejecting unauthorized read-only, stale, foreign-tenant, invalid and revoked operations. Mutation retries SHALL be replay-safe.
6. **Normal CI** MUST audit new/changed API routes and teacher UI surfaces, MCP catalogue references, and linked parity evidence. **PR CI** MUST reject teacher UI/API code changes lacking concurrent registry, tool and E2E deltas. **Strict release validation** MUST reject any missing/partial teacher route OR any unchecked one of the 93 behavioral scenarios; green normal CI does not waive those blockers.
7. No claim of complete parity or acceptance without merged-main passing evidence. Do not close the active OpenSpec while gaps remain. Live ChatGPT/Claude provider testing remains the final local v0.1.0 release-only step.

## Consequences
All future business-feature PRs carry an MCP implementation and tests by default. A narrow security exception requires an explicit written rationale and reviewer approval, not a label that hides an ordinary missing business operation. Structural CI can detect omissions but does not replace full behavioral verification.

This ADR coexists with ADR-0001: pre-1.0 can break APIs/data formats without migrations, **never** at the expense of tenant safety or MCP-first equality. It is a project policy, not a claim that full parity already exists.


## CI enforcement of shared domain actions and live tool schema (2026-11-13)

The parity candidate on source `d8845cacc6ba06698397d304314a6138be656728` ([236 authenticated website/MCP E2E tests passed, five intentional skips](https://github.com/itshak/ChessCoachPal/actions/runs/43445246524), [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43445246195), [security](https://github.com/itshak/ChessCoachPal/actions/runs/43445246383), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43445246152), [restore](https://github.com/itshak/ChessCoachPal/actions/runs/43445246310)) enforces every teacher API route family in source against the MCP catalogue, also comparing imported domain operations rather than only matching tool names. A new delegated-OAuth E2E checks the live `tools/list` response for each of 59 teacher route mappings and validates representative chess profile input-schema and website/MCP mutation/clear readbacks. The indexed historical 93 and 26 additional named cases independently exercise sensitive workflows. CI requires the strict gate on the candidate. Reviewed exception: a full browser-export may contain portal credentials, while MCP must use a model-safe redacted export. Passwords/MFA, provider credentials and hosted card entry stay in narrowly approved secure browser handoffs. No new website-only teacher data field or action may bypass this rule. The merge-main and actual client release checks are separate, required acceptance events.
