# Archive decision — selective CogNote post-fork fixes

**Outcome: IMPLEMENTED AND ACCEPTED after exact-main automated checks (2026-11-15).**

**OpenSpec change:** `selectively-adopt-cognote-post-fork-fixes` was the sole active implementation proposal. It is archived because all its technical tasks and automated acceptance checks are complete. The existing published v0.1.0 release is unchanged.

## Implementation and decisions

[PR #75](https://github.com/itshak/ChessCoachPal/pull/75) was merged by squash to `main` at [`394592c446e23767459b79ca226d0101d3c4dc3c`](https://github.com/itshak/ChessCoachPal/commit/394592c446e23767459b79ca226d0101d3c4dc3c).

- **Upstream #142 — adopted as ChessCoachPal behavior, not a direct fork merge.** Full or partial real-world manual payment is supported on saved draft invoices via the shared website/MCP service and atomic SQL ledger. A draft remains private until sent; an unsent paid invoice can be deliberately shared with zero balance and no second payment request. Draft updates/regeneration cannot go below funds received; erasure and redeemed-credit guards preserve history. Provider links and emailed PDF values are balance-aware and send claims hold the invoice lock.
- **#143 — guarded existing explicit local/self-host migration destinations.** Future `supabase db push` commands require an explicit local/verified remote target.
- **#144 — Vitest and test-related packages patched to 4.1.12** with a reproducible npm lockfile and successful CI.
- **#145 — applied existing hosted founding entitlement billing protections.** Webhook and explicit operator grant paths cancel recurring Stripe subscriptions safely and preserve portal access. No automatic refund or public plan/pricing promise was introduced.

## Accepted test evidence

The complete five-workflow matrix passed on PR head `291a72cd9380be9a874df1efe8dbcb0cb01aae83` and **again on the exact merged-main SHA `394592c446e23767459b79ca226d0101d3c4dc3c`**:

| Gate | Merged-main run | Result |
|---|---|---|
| CI: schema, migration guard, TypeScript, ESLint, Vitest, strict MCP parity | [43683559454](https://github.com/itshak/ChessCoachPal/actions/runs/43683559454) | Pass: 458 unit cases across 56 files; 93/93 parity |
| Authenticated synthetic Playwright browser/MCP | [43683559483](https://github.com/itshak/ChessCoachPal/actions/runs/43683559483) | Pass: 258 cases; 5 intentional skips |
| GitHub history/security | [43683559491](https://github.com/itshak/ChessCoachPal/actions/runs/43683559491) | Pass |
| Self-hosted Compose smoke | [43683559463](https://github.com/itshak/ChessCoachPal/actions/runs/43683559463) | Pass |
| Database/upload backup+restore smoke | [43683559488](https://github.com/itshak/ChessCoachPal/actions/runs/43683559488) | Pass |

**PR-head evidence:** [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43683059434), [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43683059438), [security](https://github.com/itshak/ChessCoachPal/actions/runs/43683059437), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43683059474), [restore](https://github.com/itshak/ChessCoachPal/actions/runs/43683059462) — all green.

## Explicit remaining boundaries

No direct real-money Stripe charge/refund was attempted; no real vendor ChatGPT/Claude subscription client acceptance was performed in this change. Those are separate release/operational gates. Synthetic tests do not authorize real production billing, live-client publication, or changes to the existing [v0.1.0 release](https://github.com/itshak/ChessCoachPal/releases/tag/v0.1.0). No private commercial strategy/pricing or customer data was published.
