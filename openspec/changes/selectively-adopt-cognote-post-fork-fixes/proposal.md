# Change: selectively-adopt-cognote-post-fork-fixes

**Status:** PROPOSED — not implemented. **Target:** post-v0.1.0 development (next release, not a rewrite of v0.1.0).
**Upstream:** andresjmorales/cognote merged PRs #142–#145, November 7–10, 2026.
**Policy:** selectively reimplement against ChessCoachPal's canonical services and schema; do not merge/cherry-pick upstream wholesale. No CogNote compatibility layer.

## Why
After ChessCoachPal diverged on November 6, upstream CogNote made four merged PRs. The highest-value user-facing change is partial/manual payment on draft invoices. ChessCoachPal currently rejects partial draft payments in `lib/server/teacher-manual-payments.ts`, but already has stronger atomic SQL receipts, idempotency, and provider reconciliation that must not regress. Other upstream changes are migration targeting, Vitest patch updates, and free founding-member Stripe cancellation.

## Scope and decisions
1. **Adopt #142 behavior, not implementation:** permit a teacher to record partial/full manual payments on *saved draft* invoices without sending email or exposing drafts in the family portal; always save/review the current draft total before collecting payment. Enforce at the database transaction boundary that total >= paid; block edits/regeneration/deletion that would invalidate existing payments or redeemed prepaid credits. Removing a mistaken payment returns a never-sent invoice to draft and a sent invoice to sent; never refund Stripe through a manual-payment removal. Invalidate/expire old Stripe Checkout links when invoice totals change or a manual payment is recorded, and fail closed if provider state is uncertain. Preserve tenant ownership, revisions, idempotent receipts, race safety, and all-or-nothing DB semantics.
2. **Review #143 migration-targeting defect:** inventory ChessCoachPal workflows/scripts for `supabase db push`; explicitly target the intended local or linked remote database, never infer the target from `supabase link`. Change only if applicable; add a guard/test against accidental production migrations.
3. **Review #144 dependency:** assess Vitest 4.1.12 versus the current ^4.1.11 range and lockfile, security/advisory impact, and CI compatibility. Upgrade only if needed, with reproducible lockfile and test run.
4. **Conditionally adopt #145:** determine whether ChessCoachPal actually grants lifetime/founding hosted entitlements alongside billable Stripe subscriptions. If yes, make the grant and webhook cancel billable subscriptions in Stripe with retries/idempotency and maintain billing portal access; if no, record N/A and do not introduce CogNote-specific founding tiers.

## MCP-first invariants
Every new website-visible invoice/payment action, validation, status, or teacher-editable field must be available through a teacher-scoped MCP route using the *same* domain service. Browser-only explicit payment/Stripe approval is permitted only with a documented safe handoff and parity evidence. Register the corresponding MCP tool contracts, authorization, audit, and strict parity catalogue in the same implementation PR.

## Acceptance
- Automated unit + authenticated browser↔MCP E2E: draft partial/full payment, edit/regenerate below paid refusal, simultaneous writes, exact replay/conflict, stale Checkout expiration and failure, payment removal, credit redemption dependency, cross-tenant denial, draft visibility/email safety.
- No duplicated business rules across website and MCP; shared service and atomic SQL tests; strict MCP parity gate green.
- Validate local and production-targeting semantics of migration scripts; pin/update dependencies only with CI verification.
- Run typecheck, lint, unit, authenticated E2E, security, Compose and backup/restore workflows on the integrated main SHA.
- Update canonical OpenSpec specs, release notes, docs and archive this change only after evidence is recorded; no changes to the published v0.1.0 tag.
- Record an explicit disposition (adopt / already covered / not applicable) for each upstream PR.

## Non-goals
No bulk upstream merge; no new CogNote branding, music features, legacy data compatibility, automated Stripe refunds, or unreviewed billing-provider mutations.
