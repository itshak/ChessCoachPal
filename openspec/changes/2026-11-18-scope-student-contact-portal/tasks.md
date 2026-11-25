> **2026-11-21 schema-ownership handoff:** All outstanding physical DDL, source schema/type/RLS changes and schema-generated regression tasks in this checklist are now tracked under the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/tasks.md)** (ADR-0019). Keep this proposal's functionality, UI, MCP and acceptance tasks open until independently verified. Historical SQL implementation instructions here are not independent migrations. Do not mark work complete solely because merged code exists.

# Tasks: scoped Student & Contact Portal

See [exact merged source evidence](SOURCE_ACCEPTANCE.md). Unchecked mixed tasks retain their operational or unverified clauses; source evidence is not deployment authorization.

> **Execution prerequisite:** First complete [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


- [ ] Inventory /portal page, calendar, cancel RPC, event RSVP, notes, invoice/credits/payment QR/Checkout, token rotation, all email templates, logs, shared-note flags and available live tokens.
- [x] Specify grant audience and per-resource scope by contact/student/workplace/financial-account; ensure school contact never sees private lessons/invoices and parent access is explicitly approved.
- [ ] Update canonical baseline for grants/token digests/audit, tenant RLS, secure token mint/revoke and RPC authorization; prepare the final one-time cutover or clean rebuild/reimport plan: old tokens must be invalid, new grants explicitly approved and narrowly scoped.
- [x] Use scoped authorization for ordinary page/ICS and SQL cancel/RSVP, and exact authorized invoice attribution; no service-role wide result is exposed.
- [x] Add teacher contact/student sharing controls on website and parity ccp_* MCP metadata operations; secure browser-only token display and approved rotation/reissue.
- [x] Add optional portal enablement, expiry/revoke and recoverable replacement link flow; no student/contact creation side effect.
- [x] Verify approved notes, event/RSVP, calendar, exact invoice/prepaid purchase history, same-scope renewal and safe eligible payment handoff in current source.
- [ ] Reimport selected legacy content only through an authorized cutover, not a guardian-token adapter. Invoice-specific configurable payment instructions/QR need separate review if desired.
- [x] Verify signed group-note visibility on a frozen two-learner roster, including scoped sharing, private text redaction, overlapping reads and denial of new requests after revocation.
- [ ] Complete the combined acceptance matrix: student in two workplaces; mother vs school vs sponsor; many contacts; archived student; merged/removed contact; expired/revoked token; uninvited RSVP and fake cancellation IDs.
- [x] Verify no-store/no-referrer on ordinary guest responses, serialized replay and multilingual guest UI.
- [x] Verify actual database row-lock contention in both revocation/cancellation orders on a disposable target.
- [x] Verify an isolated shared ingress budget across multiple proxies and that ordinary paths are logged without logging test portal URLs.
- [ ] Review and verify the selected live ingress trust chain, shared rate limit, and access-log/trace handling with the operator. Review durable access audit and retention separately.
- [x] Verify teacher grant website/MCP parity, signed guest E2E and exact merged source CI.
- [ ] For a future populated cutover, verify independently restored legacy data and operator acceptance. The [owner-only beta reset](../../../docs/PRIVATE_BETA_RELEASE_0_2_0_BETA_1.md) did not reimport legacy portal records or tokens. Before archival, verify the remaining live ingress and audit criteria.
