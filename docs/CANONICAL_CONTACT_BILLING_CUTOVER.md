# Canonical Contacts, Billing Accounts, and scoped portal — cutover evidence

**Pre-v1 source candidate only.** No in-place production migration, no automatic upgrade, no migration of historical children or financial data without a separately authorized operator and verified backup/recovery. See ADR-0017 and the three active 2026-11-18 OpenSpec changes. The current final-cutover **source** audit has zero violations, but this alone does not demonstrate functional acceptance or authorize archival/release.

## One canonical, fresh-install schema

The only migration is \`supabase/migrations/20261107000000_chesscoachpal_baseline.sql\`, checked by SHA-256 in \`scripts/schema-transition-manifest.json\`. No guardian/Family/Studio tables, old public household tokens or old RPCs are installed. The current tables are:
- \`contacts\` (independent identity), \`student_contacts\` (dated relationship plus distinct legal/messaging permissions), \`billing_accounts\` (separate financial identity).
- \`student_billing_assignments\` (workplace/learner/effective-date payer, overlap prevented), \`invoices.billing_account_id\` (explicit debtor), \`credit_packages.workplace_id\` (immutable original workplace).
- \`portal_access_grants\` and \`portal_event_invitations\` (exact student/contact/workplace, expiry, permission, and optional payer; only browser-approved issuance; no implicit grants).
- \`compensation_agreements\`, \`financial_obligations\`, \`received_payments\`, \`payment_allocations\`, \`financial_reversals\` (different meanings; immutable ledger with audit reasons). These do **not** represent a payment-provider integration or tax receipt.

The website and MCP share current Contacts, Billing Accounts, student-contact relationships, student-specific payer assignments, grant metadata, finance-ledger, and teacher policy services. The former Family screens, \`/api/guardians\` and seven guardian MCP operations are gone.

## Payer and credit invariants

An invoice preview computes payers from explicit effective-dated assignments at the **actual lesson workplace and local date**. Absent and ambiguous assignments never silently default to a named contact or the present-day payer. SQL invoice line guards revalidate original participant and payer. Creating prepaid credit packages requires a selected enrolled workplace, precisely one active assigned billing account, and a draft invoice for that debtor. Credit package workplace is immutable; redemptions must be for an actual session of the same student and workplace. Previously posted invoice/payments, refunds and ledger evidence are not silently rewritten when an assignment changes.

An authenticated invoice PDF shows the Billing Account name. Email send requires an explicitly selected account contact with an active, teacher-attested \`may_receive_messages\` relationship for **every student** represented by invoice lines. No payment receipt is inferred from teacher email, lessons, or Stripe link creation. Stripe settlement relies on a verified webhook; old household portal links are never included in checkout redirects, invoice sends or previews. Portal invoice visibility additionally checks the exact original student/workplace attribution and scoped grant.

## Source-to-final one-time mapping

For any original installation, the operator must first take a verifiable full physical/database backup, perform an independently verified restoration and compare record inventories, then select **one** authorized path:
1. Direct source→final mapping, with teacher-reviewed person/organization contacts (including multiple contacts), historical relationships and messaging/legal status, active student/workplace membership, explicit historical payer periods, invoice debtor identity, immutable received payment and credit history, event invitations/RSVPs, financial provenance, and migration exceptions requiring reconciliation; **no** inferred legal guardian, messaging consent, payer or portal access.
2. Clean final-baseline install followed by deliberately reviewed importer feeds. Legacy family names may become unprivileged contacts; old tokens must remain invalid. Old invoices, payment records, RSVP, delivered emails and settled financial history require explicit verified mapping or documented unresolved manual work, not deletion or fabricated success.

Token digests are omitted from portable exports, so restored grants are initially unissued and require fresh, independently approved browser issuance. Portable backups can include financial and delivery receipts for operator use but do not let ordinary teacher web/MCP import forge immutable evidence: they fail closed with a supervised-restore requirement. Never promise a backup has been restored if protected data is pending.

## Test evidence and release gates

- Two clean local Supabase fresh installs/reset+seed completed on disposable \`supabase_db_chesscoachpal\`, not staging/production.
- SQL checks: \`scripts/schema-final-baseline-synthetic.sql\`, \`scripts/financial-ledger-synthetic.sql\`, \`scripts/finance-native-rpc-synthetic.sql\`, and \`scripts/schema-transition-contact-student-create.sql\` passed in the isolated container.
- Local TypeScript, three i18n catalogs, lint (warnings only), strict MCP parity, one-baseline schema checksum guard, and final pre-v1 source audit passed.
- **Still required before acceptance:** refactor legacy E2E cases onto these new contracts, run authenticated browser+MCP E2E on the exact PR head and merged main, complete deterministic credit/Stripe/recipient/import/restore tests with populated historical records, check RLS across foreign tenants and concurrent grant revocation, verify full protected-record restore with operator approval, and prove CI/Compose/backup-restore all green. Local Vitest runner currently exits SIGILL; only actual CI success counts. Real ChatGPT/Claude live smoke remains a separately authorized pre-publication gate.

This document is a current *status and migration plan*, not authorization for live database operations or OpenSpec archival.
