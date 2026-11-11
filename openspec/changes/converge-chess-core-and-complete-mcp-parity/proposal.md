# Change: converge-chess-core-and-complete-mcp-parity

**Status: PROPOSED — orchestration and acceptance plan only. No implementation, test acceptance, OpenSpec archive, merge of functional branches, production data migration or release is authorized by this documentation PR.**
**Goal:** finish the retained ChessCoachPal website and MCP functionality together, **after** integrating the student-first chess model, in one coordinated implementation batch followed by an exhaustive validation phase.

## Why this change

ChessCoachPal is an **MCP / Plugin first** chess-coach assistant. The website is an optional editor/viewer of the same teacher-owned data. We have useful existing functionality inherited from CogNote, including invoicing, credits, payment reconciliation, families/guardians, events and administration. **Do not delete these modules just to make the parity numbers smaller**: coaches may need them, including optional professional-tier use cases. Preserve working business behavior and security boundaries, and improve the student-first experience without dropping useful capabilities.

Two streams overlap and must be integrated before more parity coding:

1. [`enforce-mcp-website-functional-parity`](../enforce-mcp-website-functional-parity/proposal.md) and draft [PR #44](https://github.com/itshak/ChessCoachPal/pull/44) cover broad teacher website/MCP parity, including legacy calendar, guardians, events, invoices, exports, Lichess and account/provider handoffs.
2. [`refocus-student-centered-chess-coaching`](../refocus-student-centered-chess-coaching/proposal.md), merged as specification [PR #47](https://github.com/itshak/ChessCoachPal/pull/47), with implementation candidates [PR #48](https://github.com/itshak/ChessCoachPal/pull/48) (typed materials) and [PR #49](https://github.com/itshak/ChessCoachPal/pull/49) (homework, student-first navigation), changes the canonical material, student/contact and lesson domain. [`support-conversational-lesson-and-lichess-workflows`](../support-conversational-lesson-and-lichess-workflows/proposal.md) also overlaps.

Completing/testing legacy implementations before choosing their canonical successor risks throwaway code, parallel writes and duplicated historical lessons. Conversely, calling a new page "chess-first" does not waive parity for retained optional billing/guardian/event functions.

## Verified baseline to reconcile, not assume accepted

As of 2026-11-11, draft PR #44 has 87 of 93 separately evidenced browser↔delegated MCP checklist scenarios. Its checklist prose claims 24 verified / 10 partial / 19 gap teacher route families (53 total); parsing the actual branch's `scripts/mcp-website-parity.json` gives **23 verified / 11 partial / 19 gap**. The acceptance agent SHALL reconcile this one-route classification discrepancy against source and executable evidence before changing any counts. Both snapshots mean **30 incomplete routes**, not a completed release. Subsequent source changes and branch merges may alter the route total and acceptance matrix. Preserve checked-case evidence only if the same behavior still passes on the integrated implementation.

PR #44's latest source head was `8535d06469e6f1087b767ccb02503b381400d74f` when this proposal was drafted; verify current heads and CI results before execution. PRs #48 and #49 are separate open implementation candidates, not accepted on merged main by virtue of being open. Neither this proposal nor ordinary green CI declares strict parity complete.

## Scope and binding decisions

1. **Keep supported functionality**: student, workplace, groups, calendar, lesson history, teaching time, reports, chess skills/materials, Lichess, optional contacts/guardians, events/communications, business policies, invoices, credits, payment and hosted account/subscription workflows. Preserve useful professional features; **no scope-based mass deletion or arbitrary weakening of parity**. Normal plan/entitlement checks must apply equally to website and MCP.
2. **Integrate the student-first canonical model first**: independent student/contact/payer authority; one canonical occurrence-based lesson history; typed learning material root plus chess games/puzzles/drills/study chapters; teacher-recorded assignments/attempts/reviews and source-linked briefing. Reuse existing data/history and domain services; do not create two competing write models.
3. **Repair every retained parity gap** against that final model, not merely against legacy pages; implement the six currently unchecked behavioral workflows and the full API/page/component/field/action inventory. No route becomes "verified" because it has a tool name or because the old UI was hidden.
4. **Retain secure browser exceptions** only for password/MFA, actual payment card entry, OAuth consent and other narrowly documented secret-bearing operations. MCP must be able to safely initiate/inspect allowed outcomes when appropriate; never send secrets to the model.
5. **Batch implementation before the full test campaign**. The applying agent performs one integrated implementation phase (writing code and tests, running only necessary cheap/local checks), then one comprehensive synthetic verification campaign. Avoid repeatedly pushing tiny fixes and starting five GitHub workflow families for each one. After full-suite failures, repair a coherent set of failures and rerun the necessary suite(s); do not suppress tests or fabricate evidence.
6. **Same-PR parity rule still applies.** Every new/modified website business operation from #48/#49/this integration gets equivalent typed authenticated MCP access, shared service and cross-interface tests in the final integrated change. ADR-0001 and ADR-0003 remain binding.

## Proposed one-agent execution contract

Read [design.md](design.md), [integration-matrix.md](integration-matrix.md), [tasks.md](tasks.md) and [specs/integrated-coaching-parity/spec.md](specs/integrated-coaching-parity/spec.md) in that order. Perform stages **A → B → C → D → E** (source reconciliation → integration → gap closure → test campaign → audited merge/archive). Do not start final acceptance testing while the agreed implementation backlog remains open; do not mark a scenario complete merely to get a green strict gate. Avoid unsolicited per-route PRs and CI churn: use one coordinated implementation PR/branch after resolving the candidate-branch topology.

Preserve all functional work from #44/#48/#49, resolving conflicts explicitly. Do not merge all branches blindly: #49 is stacked on #48, while #44 is an older, overlapping umbrella. Establish one canonical implementation and eliminate duplicate adapters only when the replacement behavior and historical preservation are proven. Any inability to finish is recorded as a real blocker with precise code/test evidence, not reclassified as a secure browser exception.

## Non-goals

- No removal of usable invoice/payment/credit, event or guardianship features simply to reduce the denominator.
- No exposure of private strategy, unpublished pricing, credentials or real student data in the public repository, PR descriptions, fixtures or logs.
- No new arbitrary SQL MCP surface, secrets-in-chat, bypassed consent, or direct provider billing charges in synthetic tests.
- No production migration/reset and no retroactive declaration of provider-live, ChatGPT-live or Claude-live acceptance.
- No v0.1.0 release, OpenSpec archive or feature-PR merge based on this documentation-only change.

## Acceptance

One integrated source tree with **zero uncovered/partial retained teacher operations or fields**, individually reviewed browser↔OAuth/MCP evidence for all 93 existing checklist cases **plus every newly added chess-first scenario**, safe functional equivalence across plans/permissions, unchanged trustworthy histories, all final synthetic GitHub workflows green, strict parity validation green on the final merged-main SHA, and truthful documentation. Separately retain the actual live ChatGPT/Claude prepublication gate. Archive only after independently verified merged-main acceptance.
