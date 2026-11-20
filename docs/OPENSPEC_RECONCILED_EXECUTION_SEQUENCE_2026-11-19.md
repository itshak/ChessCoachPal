# Reconciled remaining OpenSpec execution sequence (2026-11-19)

**Status: staged schema candidate on draft PR #108; no live database writes or production migration.** Repository base `feature/openspec-contacts-20261118` currently has 11 active OpenSpec changes. This roadmap reconciles their dependency order; it does not mark unfinished changes complete. PR #104 is the draft contact/schema branch; PR #106 is a separate draft import proposal; PR #107 is a draft spreadsheet safeguard implementation based on #104. Avoid merging independent schema baselines out of order.

## Critical path
**0. Inventory and reconcile** `2026-11-19-freeze-unified-saas-schema-and-regressions`: use it as the schema governance umbrella, NOT a declaration that the candidate baseline is already frozen. Audit actual live and staging schema, current PRs, credits/finance, enrollment, all 11 active proposals, migrations and data-preservation gates.

**1. Amend the one canonical schema before freeze** with `2026-11-19-temporal-enrollment-credit-safe-lifecycle`: temporal multi-workplace enrollment, cancellation audit, archive/reactivation, credits entitlement and funded/unused accounting constraints. Coordinate DDL with `2026-11-18-replace-families-with-contacts`, `2026-11-18-add-workplace-context-and-retire-studio`, `2026-11-18-implement-workplace-compensation-and-billing`, `2026-11-18-scope-student-contact-portal`, `2026-11-18-introduce-fide-national-ratings`, `2026-11-18-automate-online-rating-sync`, and professional lesson/recurrence changes. **No per-feature production migrations.** Finalize schema, typed contracts, security, fixtures and regression tests; independently approve freeze.

**2. Foundation domain workflows:** implement shared temporal enrollment and archive/reactivation/credit-safe preview/commit; complete `2026-11-18-replace-families-with-contacts` and `2026-11-18-add-workplace-context-and-retire-studio`; fold PR #106 intent and PR #107 import safeguard into this service after verifying exact-head CI. Preserve contacts/payers and school/private multi-workplace membership.

**3. Financial truth:** `2026-11-18-implement-workplace-compensation-and-billing`, including verified paid-vs-invoiced credit entitlement, credit ledger/refund/transfer controls, no double-charge and school group compensation. Integrate existing package/redemption/return receipts; never treat archiving as refund or forfeiture.

**4. Teaching workflows:** `2026-11-18-improve-daily-coach-workflows` then `2026-11-18-extend-professional-coach-workflows` (session lifecycle, future commitments, recurring exceptions, credit redemption eligibility, close/reopen and reports). Depend on stages 2–3 where finance is involved.

**5. Scoped sharing:** `2026-11-18-scope-student-contact-portal` after contact and payer foundation, with explicit scoped grants and privacy tests.

**6. Chess rating identity/evidence:** `2026-11-18-introduce-fide-national-ratings` then `2026-11-18-automate-online-rating-sync` (provider-neutral evidence before background sync). Both rely on schema fields decided at stage 1.

**7. Experience:** `2026-11-17-introduce-multilingual-support` (en/he/ru, RTL, reports/MCP); `2026-11-18-explore-brand-and-redesign-coach-ui` (design lab first, then approved rollout). Can be developed in parallel after schema freeze, but merge against validated domain contracts.

**8. Release gates and operator cutover:** full website/MCP functional parity, unit/SQL/tenant/CI/E2E, exact-head checks, off-host backup+restore rehearsal, row-level live inventory, explicitly approved one-time production migration or verified rebuild/reimport, post-cutover reconciliation. Do not infer current enrollment from historic attendance.

## Explicit conflict resolutions
- Existing freeze proposal says freeze FIRST: reinterpret as **inventory/governance first, final freeze after incorporating this approved lifecycle/credit amendment**. Otherwise new DDL would violate freeze.
- PR #106 proposes workplace enrollment on import; #107 implements part of it. Both must target temporal membership, not insert-only current links, and require clarification on ambiguous workplace.
- Existing lifecycle RPC refuses archiving while enrolled. Replace with preview + explicitly approved atomic close/cancel, not blind deletion.
- Existing package workplace scope is not student membership; preserve independent financial entitlements. An archived student can retain unused credits but cannot redeem while archived.
- No automatic expiry pause on archive, no automatic refunds, no automatic transfer, no auto-reactivation from future dates.
- Work that has started (PR #86 localization, #104 contacts) is not equivalent to completed or green; inspect exact branch/checks before rebasing/merging.
- Release and schema transition remain operator-only under ADR-0017/0018. No production data reset or migration in this planning change.

## Open proposals accounted for
1. `2026-11-19-freeze-unified-saas-schema-and-regressions` — schema umbrella (stage 0/1).
2. `2026-11-19-temporal-enrollment-credit-safe-lifecycle` — NEW, stage 1/2.
3. `2026-11-18-replace-families-with-contacts` — stage 2.
4. `2026-11-18-add-workplace-context-and-retire-studio` — stage 2.
5. `2026-11-18-implement-workplace-compensation-and-billing` — stage 3.
6. `2026-11-18-improve-daily-coach-workflows` — stage 4.
7. `2026-11-18-extend-professional-coach-workflows` — stage 4.
8. `2026-11-18-scope-student-contact-portal` — stage 5.
9. `2026-11-18-introduce-fide-national-ratings` — stage 6.
10. `2026-11-18-automate-online-rating-sync` — stage 6.
11. `2026-11-17-introduce-multilingual-support` — stage 7.
12. `2026-11-18-explore-brand-and-redesign-coach-ui` — stage 7.

## 2026-11-19 implementation progress (draft-only)

- PR #107 import protection is green in CI, authenticated E2E, security, Compose and backup/restore on exact commit `da9958156390cfc3115c45c34ef3dedd3e4da753`.
- PR #108 stages temporal workplace membership, enrollment interval constraints, typed credit adjustment evidence, schema manifest and OpenSpec delta; a schema-only candidate is **not** end-to-end credit-safe lifecycle completion.
- OpenSpec implementation/verification remains active. See `docs/SCHEMA_CANDIDATE_ACCEPTANCE_2026-11-19.md` for unverified operations and cutover gates; do not archive the umbrella or temporal proposal until independently accepted.

## 2026-11-20 follow-through (not source freeze)

Draft PR #108 now implements candidate shared temporal membership end, archived-student-safe reactivation, explicitly audited credit adjustments, revised credit allocation and English/Hebrew/Russian teacher review panels, with browser/MCP parity tests. The source changes are **not yet an accepted feature**, and no OpenSpec was archived in this step. The database refuses direct enrollment into an archived student's period, even if a client bypasses normal application checks. The last checks and the unresolved expiry-edit bypass are recorded in `docs/SCHEMA_CANDIDATE_ACCEPTANCE_2026-11-19.md`.

The correct sequence remains **#104 (Contacts/payer foundation) → #107 (workplace-safe import) → #108 (temporal/credit lifecycle)**. Before final schema freeze, reconcile old direct expiry edits with audited credit event semantics, all amendment owner/security rules and exact-head authenticated E2E; then inventory, test and approve the forward-only populated-data transition separately. Empty-install green checks never authorize a live data reset or OpenSpec archival while unchecked implementation tasks remain.
