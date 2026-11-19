# Tasks: scoped Student & Contact Portal

> **Execution prerequisite:** First complete [`2026-11-19-freeze-unified-saas-schema-and-regressions`](../2026-11-19-freeze-unified-saas-schema-and-regressions/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


- [ ] Inventory /portal page, calendar, cancel RPC, event RSVP, notes, invoice/credits/payment QR/Checkout, token rotation, all email templates, logs, shared-note flags and available live tokens.
- [ ] Specify grant audience and per-resource scope by contact/student/workplace/financial-account; ensure school contact never sees private lessons/invoices and parent access is explicitly approved.
- [ ] Update canonical baseline for grants/token digests/audit, tenant RLS, secure token mint/revoke and RPC authorization; prepare the final one-time cutover or clean rebuild/reimport plan: old tokens must be invalid, new grants explicitly approved and narrowly scoped.
- [ ] Implement central authorizePortalAction read+write service and refactor every page/API/ICS/cancel/RSVP/finance query to enforce grant, original session workplace and exact invoice debtor; avoid exposed service-role broad result.
- [ ] Add teacher contact/student sharing controls on website and parity ccp_* MCP metadata operations; secure browser-only token display and approved rotation/reissue.
- [ ] Add optional portal enablement, expiry/revoke and recoverable replacement link flow; no student/contact creation side effect.
- [ ] Implement current approved-note, event, RSVP, payment/history and calendar semantics natively in the scoped portal; reimport selected old content only through the authorized cutover, not a guardian-token adapter.
- [ ] Test student in two workplaces; mother vs school vs sponsor; many contacts; archived student; merged/removed contact; expired/revoked token; shared group note privacy; uninvited RSVP and fake cancellation IDs.
- [ ] Test brute force, rate limiting on all portal endpoints, no-store/referrer leakage, replay and mutation under concurrent revocation; multilingual guest screens.
- [ ] Add website/MCP teacher grant parity, guest security E2E, baseline+restored-copy migration, regression/recovery and exact merged-main CI evidence before archive.
