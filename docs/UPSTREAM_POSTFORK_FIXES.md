# Technical disposition — upstream CogNote PRs #142–#145

> **Deployment terminology (ADR-0018):** ChessCoachPal is operator-only SaaS; any "self-hosting" references here describe our infrastructure/CI, never customer-hosted product support. [Current policy](adr/0018-operator-only-saas-and-tenant-scaling.md).

**ChessCoachPal change:** `selectively-adopt-cognote-post-fork-fixes` · **Date:** 2026-11-15

These upstream changes were reviewed against ChessCoachPal's current canonical schema and shared teacher website/MCP domain operations. No CogNote code history, private commercial strategy or backward-compatibility shims have been merged.

| Upstream | Disposition | ChessCoachPal implementation |
|---|---|---|
| #142 Draft payments | **Adopt behavior, reimplement** | Existing `teacherManualPaymentRecord` and `ccp_manual_payment_commit` accept partial/full draft payments. The browser saves visible edits first. Draft paid-floor, non-erasing deletion, prepaid-credit reversal guards and post-payment regeneration enforce money safety at the SQL boundary. Never-sent paid invoices reopen to draft; the family portal requires `sent_at`. PDFs, preview and emails show total/paid/balance and Stripe links use the remainder. New `ccp_invoice_send_claim` checks the exact snapshot and balance under an invoice lock. |
| #143 Migration target | **Already explicit; add preventive guard** | There is no plain deployed `supabase db push` in existing workflows. Local GitHub integration uses `supabase start` + `supabase db reset`, and self-hosted deployment uses explicit host/port via `docker/supabase/migrate.sh`. CI now rejects implicit `supabase db push` targets, and remote pushes without project-reference verification. The pre-v1.0 single canonical SQL baseline remains the only migration. |
| #144 Vitest patch | **Adopt** | Upgrade Vitest/`@vitest/mocker` and linked test bundler locks to 4.1.12. Automated `npm ci`, typecheck, unit and browser tests are the acceptance gate. |
| #145 Founding Stripe | **Applicable; adopt** | Hosted entitlements already include `founding`. A newly observed billable subscription for a founding teacher is immediately cancelled; retryable webhook errors fail rather than silently keep charging. The dry-run-first `scripts/grant-founding.mjs` grants founding and cancels matching customer subscriptions with an explicit `--apply` action. Founding customers retain access to the Stripe billing portal. No historical refunds are issued automatically. |

## Operator and safety procedures

- For draft payments, save and review the invoice's present line items first. Use **Record payment** for cash already received (partial or full) or **Mark paid** to settle the current remaining balance, with teacher confirmation. The action never charges a card or sends the invoice. Use the same receipt key for a genuine retry; use a new key for a separate real payment.
- An unsent draft and an invoice paid without sending remain inaccessible in the family portal. Sending is an independent, explicit action; the send claim rejects stale balances. If a Stripe checkout was already created, reconcile or expire its state before changing amounts or recording manual funds.
- Remove incorrect manual payments via the existing teacher website or MCP correction tool. Payment removal on an unsent paid invoice restores its draft status; sent invoices remain sent when reopened. Provider Stripe payments require a provider refund, not direct deletion.
- To grant a hosted founding entitlement, first run `node --env-file=.env.local scripts/grant-founding.mjs <email-or-teacher-id>` and review the matching customer and billable subscriptions. Re-run with `--apply` only after authorization. Verify subscription cancellation in Stripe, preserve audit logs and assess any existing charges separately. Do not print credentials.
- Database migrations are destructive on a fresh-install pre-v1.0 schema. CI synthetic local reset must never be repointed at hosted production. If introducing `supabase db push`, explicitly select `--local` or validated `--remote` with `SUPABASE_PROJECT_REF`; the CI guard will reject unscoped commands.

## Verification status — accepted on 2026-11-15

- [PR #75](https://github.com/itshak/ChessCoachPal/pull/75) merged as [`394592c`](https://github.com/itshak/ChessCoachPal/commit/394592c446e23767459b79ca226d0101d3c4dc3c); the identical source passed all five required workflows both before and after merge.
- [Merged-main CI](https://github.com/itshak/ChessCoachPal/actions/runs/43683559454) — 458 unit tests passing in 56 files, typecheck/lint passing, 93/93 strict MCP parity checklist and explicit migration-target guards passing.
- [Merged-main browser/delegated MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43683559483) — 258 passed, 5 intentionally skipped, 0 failed (including draft partial payment, paid floor, replay, privacy, correction, and paid-before-send delivery).
- [Security-history audit](https://github.com/itshak/ChessCoachPal/actions/runs/43683559491), [self-host Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43683559463), and [database+file backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43683559488) all succeeded.
- Release pipeline checked existing `v0.1.0` and did not reissue it: [release workflow](https://github.com/itshak/ChessCoachPal/actions/runs/43683559530).

Synthetic tests do not imply live external Stripe billing/refund, real ChatGPT/Claude client verification, or further production release approval; those remain separate safeguards.
