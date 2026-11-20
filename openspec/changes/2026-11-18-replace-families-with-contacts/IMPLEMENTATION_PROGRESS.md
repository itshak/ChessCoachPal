# Contacts cutover — implementation progress

**Status: WIP / not accepted.**


## 2026-11-19 direct canonical cutover (WIP — not accepted)

- The obsolete Family web/API/MCP surface was removed in \`022a248\`; the final-cutover source audit now reports **zero** legacy violations locally (not the earlier 18), without editing or suppressing the audit.
- Current SQL replaced guardian-based invoices and event RSVP, added workplace-local/effective-dated payer verification, removed old public portal token SQL and deprecated functions, and made prepaid packages immutable per workplace. Website/MCP billing, invoices, credit purchases, PDF, Stripe notification and exports use current Billing Accounts and Contacts. Portal guest cancel/RSVP RPC callers use the scoped-grant parameter.
- Two disposable Supabase installs/reset+seed and four synthetic SQL probes passed. Local TypeScript, en/he/ru, strict MCP parity, canonical-schema guard/checksum and cutover unit source tests pass.
- **NOT green or ready to archive yet:** many existing authenticated E2E cases still rely on retired guardian test contracts. Older invoice/credit/funding fixture migrations, synthetic restored-copy reconciliation, multi-tenant negative cases, exact PR head CI/Compose/backup/E2E and merged-main gates remain to be completed. Old financial evidence requires separately authorized operator restore. Do not close OpenSpec tasks or merge from source-only evidence; no live DB touched.

## 2026-11-19 cutover CI remediation continuation (still WIP)

- `4fbd566` fixed two invalid `max(uuid)` payer aggregations, frozen-participant fixture replay, website payer presentation, and old portal/Auth/locale test selectors; exact-head CI and security history audit passed.
- Source now includes SQL producer-side teacher-localized RSVP notifications and fixture coverage for Contacts navigation authentication, workplace-scoped credit packages, unsupported guardian fields and explicit owner-only contact CSV export.
- A GitHub E2E attempt failed at transient runner Supabase port 54322 startup, before tests; rerun initiated. The prior full run had 35 failures and 273 passes; no E2E acceptance claim is made for the updated head.
- Final source cutover audit, local TypeScript and strict parity remain passing. Live data restore reconciliation, full E2E, Compose and independent backup/restore must still be accepted; do not archive or merge this change.
