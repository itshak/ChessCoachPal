# Applied specification — teacher invoice payment safety

**Scope:** Manual payments, invoice drafts, external checkout, teacher website/MCP parity, and hosted founding cancellation. All operations belong to the current canonical fresh-install schema.

## Requirement: Draft manual payments SHALL preserve privacy and money

A teacher SHALL be able to record real-world manual partial or full payments on an existing saved invoice while it is still draft, through the same confirmed teacher-scoped services used by website and authenticated MCP. The operation SHALL never email or reveal the invoice to the family. The teacher's visible edits SHALL be saved before accepting a payment; an unsuccessful save SHALL prevent recording funds.

### Scenario: Partial draft payment and stable replay
**WHEN** the teacher records partial payment on a saved draft **THEN** the invoice remains draft and private, and both surfaces show the same payment receipt, remaining balance, owner and idempotent replay.

### Scenario: Settling an unsent draft
**WHEN** the invoice balance is paid in full without sending **THEN** it may be marked paid, but family visibility still requires a separately recorded sent timestamp.

## Requirement: Invoice money SHALL have transaction-level accounting guards

The canonical SQL writer SHALL lock owner-scoped invoices and prevent the draft subtotal from being edited or regenerated below recorded payments. A draft/void with existing funds or prepaid packages SHALL NOT be silently deleted. Manual payment reversal SHALL preserve historical sent state, reject Stripe-payment deletion, and prevent used prepaid-credit loss.

### Scenario: Paid-floor and correction
**WHEN** an edit, regeneration or direct SQL write reduces a draft below funds received **THEN** the whole operation SHALL be rejected with the original invoice and ledger unchanged. **WHEN** a paid invoice has a mistaken manual payment removed **THEN** it SHALL reopen as draft if it was never sent, or as sent if it was sent.

## Requirement: Sending SHALL reconcile an exact paid balance

The shared send path SHALL verify the current revision and paid sum under a database invoice lock before claiming a draft for delivery. It SHALL not email a stale PDF or issue an incorrect Stripe Checkout. PDF, preview and delivery content SHALL present the correct total, already paid and balance due.

### Scenario: Send versus concurrent payment
**WHEN** a payment is recorded after the invoice preview was assembled **THEN** the send claim SHALL fail without mailing the stale balance. A successful partial-invoice send SHALL offer payment of only the outstanding amount.

## Requirement: Founding entitlements SHALL not be billed

When the hosted database marks a teacher as founding, recurring Stripe billable subscriptions SHALL be cancelled rather than reattached by delayed webhooks; non-retryable provider errors SHALL fail closed, and billing portal history remains available.

### Scenario: Delayed subscription webhook
**WHEN** a subscription-created or updated webhook arrives for a founding teacher **THEN** it SHALL cancel the subscription or recognize an already-cancelled subscription, without promoting that teacher to Pro or restarting billing.
