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

## 2026-11-19 security fixes (still unaccepted)

- Commit `823fa97` applies the failed-token lookup guard to the primary guest portal page as well as the existing API/ICS endpoints. The current in-process limiter is **best-effort**, not sufficient evidence of distributed brute-force resilience in multi-instance hosting; finish shared enforcement before acceptance.
- Explicitly teacher-shared **session-wide** notes are now visible to a contact only when the original frozen roster contains exactly one learner. For multi-student groups only notes attributed to the granted student can appear. The query reads the frozen roster per scoped session instead of trusting the portal's already filtered calendar data.
- Added `lib/server/portal-scope-service.test.ts` coverage for group, one-to-one, wrong-learner and missing-roster cases. Local TypeScript + targeted ESLint passed. The remote host's Vitest binary exited with SIGILL (132); GitHub CI must verify actual test execution.
- Follow-up commit `b2f1045` removes a dead redirect from the genuine `/settings` page to the empty `/studio` route and removes the Contacts UI's legacy Family escape link.
- These targeted security/navigation corrections do **not** complete the one-time contact/finance/portal cutover: the strict final-cutover source audit still reports **18** categories of legacy dependencies. All associated OpenSpec tasks remain unchecked; do not archive or merge based on passing ordinary parity and TypeScript checks.


## 2026-11-19 direct canonical cutover (WIP — not accepted)

- The obsolete Family web/API/MCP surface was removed in \`022a248\`; the final-cutover source audit now reports **zero** legacy violations locally (not the earlier 18), without editing or suppressing the audit.
- Current SQL replaced guardian-based invoices and event RSVP, added workplace-local/effective-dated payer verification, removed old public portal token SQL and deprecated functions, and made prepaid packages immutable per workplace. Website/MCP billing, invoices, credit purchases, PDF, Stripe notification and exports use current Billing Accounts and Contacts. Portal guest cancel/RSVP RPC callers use the scoped-grant parameter.
- Two disposable Supabase installs/reset+seed and four synthetic SQL probes passed. Local TypeScript, en/he/ru, strict MCP parity, canonical-schema guard/checksum and cutover unit source tests pass.
- **NOT green or ready to archive yet:** many existing authenticated E2E cases still rely on retired guardian test contracts. Older invoice/credit/funding fixture migrations, synthetic restored-copy reconciliation, multi-tenant negative cases, exact PR head CI/Compose/backup/E2E and merged-main gates remain to be completed. Old financial evidence requires separately authorized operator restore. Do not close OpenSpec tasks or merge from source-only evidence; no live DB touched.
