# Consolidated final schema — implementation and acceptance status (2026-11-21)

**Status: SOURCE IMPLEMENTATION CANDIDATE / NOT FROZEN / NOT ARCHIVED / NOT DEPLOYED.**

Authoritative OpenSpec: `openspec/changes/2026-11-21-consolidate-final-preproduction-saas-schema`, ADR-0019, ADR-0017/0018. All source work remains on draft [PR #115](https://github.com/itshak/ChessCoachPal/pull/115). This document distinguishes source implementation from acceptance, external billing activation and independent production cutover.

## Implementation committed on the draft branch

- **One fresh-install canonical SQL baseline.** The 87 original public tables have been retained/reviewed as the historical baseline. Added 12 normalized product/plan/capability/grant/usage/subscription relations and six cross-domain relations: a provider and rating-category registry, slot occurrence exceptions, approved report publications, explicit report audiences and canonical session-amendment history. No competing feature migrations.
- **One hosted-capacity authority.** Removed inherited `teachers.hosted_plan`, hosted opt-out, trial/founding/Stripe-specific identity fields and their legacy capacity counter from the target SQL/types. Added a versioned published plan catalogue, independent individual boosts, time-bounded grants, a consistent effective-capability evaluator, owner-visible SQL summary, tenant-serialized student and professional workplace counters, reconciliation and immutable entitlement audit. Baseline limits remain deliberately unlimited until an approved public commercial configuration exists.
- **Student lifecycle.** An archived student preserves the same canonical ID/history and does not count toward the active roster cap. SQL remains final for create, archive/reactivate and direct writes; existing future-commitment guards are preserved. App services and MCP surface the normalized capacity error. Full concurrent lifecycle acceptance remains pending.
- **Workplaces.** Exactly one provisioned Personal workspace per teacher, distinguished from Professional scope; archive/revision guard and active-only default selection. Existing workplace records/session attribution are not overwritten; future scheduling, membership and portal obligations block premature professional archive.
- **Chess ratings and learning evidence.** Approved extensible provider/category registry with tenant-scoped category foreign keys and external source provenance; teacher-verified introduced/practiced/demonstrated/needs-review evidence is distinct from materials taught, ratings and inferred mastery.
- **Recurring lessons and published reports.** Tenant-owned revocable occurrence exceptions and a canonical session amendment audit; immutable report approval/supersession and explicit portal-grant audiences. No public report sharing is activated by the existence of the schema.
- **Application contracts.** SQL provisioned onboarding, TypeScript table contracts, updated website account plan/capacity view, MCP subscription handoff and archived workplace filtering. Inherited hosted Stripe checkout/portal/webhook routes deliberately return 503 until a verified provider-neutral subscription adapter is separately reviewed. No provider redirect or unverified event grants Pro.
- **Security and CI contracts.** RLS and restricted grants on new relations, append-only/revision guards, signature-event identity protection, same-PR website/MCP parity registry review, synthetic fixtures and SQL negative probes, schema manifest SHA-256 and static contract tests.

## Verified GitHub Actions evidence (2026-11-22)

The implementation commit `0f8d283a0a78a749c5709271777a86668d3b5906` completed **all five** GitHub Actions workflows successfully. This verifies the automated gates on that exact code revision, **not** every independent field-level or live deployment acceptance item:

| Workflow | Run | Result |
| --- | --- | --- |
| CI | [44955791714](https://github.com/itshak/ChessCoachPal/actions/runs/44955791714) | success |
| E2E (authenticated Playwright) | [44955791630](https://github.com/itshak/ChessCoachPal/actions/runs/44955791630) | success |
| Security history audit | [44955791627](https://github.com/itshak/ChessCoachPal/actions/runs/44955791627) | success |
| M5 self-host Compose smoke | [44955791648](https://github.com/itshak/ChessCoachPal/actions/runs/44955791648) | success |
| M5 backup-restore smoke | [44955791696](https://github.com/itshak/ChessCoachPal/actions/runs/44955791696) | success |

These runs are attached to the prior code commit. Subsequent documentation or code commits require their own exact-head checks before merge. The OpenSpec Phase 2 scenario-specific matrix, formal inventory/crosswalk signoff, live provider behavior and separate ADR-0017 private beta operational gate remain outstanding.

## Additional scenario coverage added after the verified implementation commit

The current draft branch now adds synthetic authenticated/privileged E2E regressions for (a) zero active-student capacity and counter rollback, (b) independently issued, expired and revoked additive capacity boosts, denied self-issued grants and grandfathered existing roster after revocation, and (c) provider-event idempotent identity, immutable signed-event provenance, private event access and absence of checkout-derived entitlement elevation. These new tests were **not** part of the five green workflows on `0f8d283`; their final exact-head results must be checked before acceptance. They are targeted proof, not a substitute for the complete OpenSpec scenario matrix.

## Release-blocking acceptance still to be established

1. **Exact-head SQL:** clean first and second-instance bootstrap/restore, non-privileged tenant/SECURITY DEFINER probes, plan/grant expiry, parallel student and professional workplace capacity changes, and a deterministic catalog/replay test. Fix all newly discovered failures in PR #115 rather than waiving the checks.
2. **End-to-end:** existing authenticated website/MCP behavior and archived-student concurrency, capability summary readback, group-session accounting, report audience boundaries, historical/financial safety and safe downgrades on the final source revision. A passing source audit is not independently verified functionality.
3. **CI:** All five workflows passed on implementation commit `0f8d283` (links above). Recheck the final branch head after any subsequent changes, and verify scenario-specific skips and scope separately.
4. **Field and inventory verification:** final read-only table/constraint/index/function and generated type coverage, documented remaining schema-only capabilities, tenant-scoped retention/erasure, pricing and provider decisions. The separate 13-proposal crosswalk still needs formal signoff.
5. **Independent operational gate:** actual deployed database, historical records, grants and financial/portal identities must receive separate operator-approved inventory, off-host backup/restore and target-specific mapping under ADR-0017. Do not run `db push` to populated production, do not publish commercial terms and do not represent these storage contracts as activated premium features.

Related PR #113 carries archived-student concurrency E2E evidence and must be reconciled against this final schema independently. Source implementation does not authorize deployment, plugin publication, billable subscriptions, or marking every OpenSpec checklist item complete.


## Additional 2026-11-22 schema-integration work (unaccepted candidate)

- Ported archived-student concurrent reactivation + lesson commit regression from the pre-consolidation hosted-plan columns in PR #113 onto PR #115's SQL `teacher_entitlement_state` and normalized synthetic plan. One winner/one `CAPACITY_EXCEEDED` loser, same-ID history, one session and idempotent retry are the expected assertions.
- Preserved bounded synthetic invoice-fixture overlap retry instead of weakening the real schedule conflict guard.
- Added SQL append-only plan-baseline, independent grant-issue/revocation, and platform subscription state-change audit triggers, with the canonical baseline SHA-256 regenerated. Audit events carry reason and revision, not payment payloads. Grant and subscription authorization remain service-side.
- Added authenticated/privileged regression scenarios for one Personal workplace plus parallel Professional capacity writes, archive/reactivation, extensible new federation/category rating evidence, exact student/workplace report audience scope, revoked guest grants and immutable entitlement audit.
- Fixed static final-schema inventory of quoted PostgreSQL column types; its previous parser reported empty columns for quoted legacy tables.
- Candidate physical inventory: **105** public tables, **60** explicit TypeScript table contracts, **45** tables requiring a documented type/internal-ownership decision. This is a source inventory, not a declaration that all 45 are intentionally internal or that every effective RLS policy is safe.

**Acceptance remains pending:** exact final-head green CI/E2E/security/Compose/restore (not a predecessor SHA), complete contract/crosswalk and tenant/financial/privacy/recurrence checks in the published matrix, and source freeze signoff. The independent ADR-0017 operator-owned real-data inventory/backup/cutover is explicitly outside source freeze and is **not** authorized by this PR.

## Final-source inventory ownership and tenant-boundary regression (2026-11-22)

The source inventory now has an explicit, fail-closed decision for **all 105 physical tables**: 60 direct TypeScript `Tables` declarations and 45 intentionally SQL-only contracts tracked by name in `scripts/final-schema-source-inventory.mjs`. Strict inventory and its unit test reject newly introduced tables without a type-ownership decision, or stale entries that became typed or were removed. **SQL-only does not mean security-exempt**: every such table remains subject to RLS, restricted grants and service/RPC review. This is a static ownership declaration, not independently generated type-equivalence or complete call-site verification.

Added `e2e/schema-freeze-boundaries.spec.ts` cross-tenant authenticated report publication checks: two independent teacher accounts, composite FK rejection for foreign student/workplace and RLS rejection of foreign read and forged write. The immediately preceding head `69de719922c5c9ef4cd119fdeb60c160ea944059` passed all five GitHub workflows ([CI](https://github.com/itshak/ChessCoachPal/actions/runs/44980521429), [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/44980521457), [security](https://github.com/itshak/ChessCoachPal/actions/runs/44980521428), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/44980521430), [restore](https://github.com/itshak/ChessCoachPal/actions/runs/44980521427)). The inventory ownership changes were made *after* this revision and need fresh exact-head checks.

**Remaining source-freeze acceptance** is scenario-specific: exhaustive privileged and nonprivileged access to new tables/functions, commercial event ordering and subscription state, financial and temporal integrity, complete website/MCP parity, and approved source crosswalk. No automated success should be represented as evidence for an untested matrix row. Populated-data cutover remains a separate, unauthorized operational gate.
