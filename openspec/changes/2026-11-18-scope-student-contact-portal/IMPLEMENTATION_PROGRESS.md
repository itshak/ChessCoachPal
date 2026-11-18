# Scoped Student & Contact Portal — unaccepted implementation progress

**Status:** Draft PR #104, source implementation in progress. **NOT ACCEPTED / NOT ARCHIVED / NOT DEPLOYED.**
**Binding rule:** ADR-0017; no CogNote or ChessCoachPal pre-v1 backwards compatibility. One final operator-approved source-to-final transformation or clean baseline plus deliberate reimport. No old guardian token becomes a grant.

## Working source added to the draft

- `portal_access_grants` canonical schema, owner-composite foreign keys, typed validation, bounded explicit permissions and expiry, SHA-256 token digest, tenant-scoped grant metadata and mutable revision; browser-only issue/reissue, owner/MCP revoke with idempotency.
- Per-guest live read authorization rechecks active contact, student, relationship, workplace enrollment and payer. Contact link/archival alone never implies a permission.
- `StudentPortalSharingPanel` website UI and named `ccp_portal_grants_*` MCP operations share the domain service; only the signed-in browser can see the private link.
- Narrow guest portal page/calendar, source-backed approved lesson notes, eligible invoices only when **every** line has exactly the requested student/workplace attribution; fail closed otherwise. Guest cancellation uses the new `ccp_scoped_portal_cancel` atomic SQL function, including teacher-notification write and token/revocation/resource checks in the same transaction.
- Events have an optional explicit workplace; events with no workplace cannot be externally shared. Per-grant explicit `portal_event_invitations`, per-event website/MCP create/list/revoke and guest RSVP `ccp_scoped_portal_rsvp` rechecking grant, active relationship, owner, workplace, student roster, invitation, expiry/revocation under row locks. No automatic invited contacts, no email side effect.
- Browser event invitation controls, locale catalogs en/he/ru, `Referrer-Policy: no-referrer`, no-store sensitive pages, unit and authenticated website/delegated-MCP E2E scenarios. A passed static parity audit is **not** proof that the guest and schema tests pass.

## Remaining blockers — do not archive

- **Remove original guardian/Family/Studio routes, tables, tokens, event RSVP SQL and old invoice/notification/send paths** from the final canonical schema and business services. Do not keep a dual model for compatibility.
- Verify all read/write guest actions, exact payer/credit scope, event delivery permissions and contact revocation, archived learners, cross-workplace notes, token rotation, replay/race, checked contact/student ownership and encrypted backups against fresh database.
- Remove the per-feature production migration chain and adopt one final baseline plus the separately approved final direct data mapping **or** verified clean rebuild/reimport. The obsolete historical convergence comparison is expected to fail until replaced with appropriate final-cutover testing; do not bypass backup/restore.
- Complete remaining associated Contacts, workplace context, finance, events, tests and professional workflows. Archive only when required exact-head and merged-main GitHub CI, E2E, security, Compose and restore acceptance pass, then separately verify real-client and operator gates.

Historical PR #104 source was previously at 210 tools / 85 route families; new metadata/event operations update this inventory. Retest against the latest exact commit before recording completion.
