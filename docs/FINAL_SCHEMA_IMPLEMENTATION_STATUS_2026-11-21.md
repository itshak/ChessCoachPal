# Consolidated final schema — implementation status (2026-11-21)

**Status: IN PROGRESS / NOT FROZEN / NOT ARCHIVED / NOT DEPLOYED.**

Authoritative OpenSpec: `openspec/changes/2026-11-21-consolidate-final-preproduction-saas-schema`. Design and ADR-0019 are merged to `main` in planning PR #114. This document records source-only work on draft implementation PR #115, not acceptance.

## Source-only work completed in draft PR #115

- 12 normalized platform capability, plan, entitlement, grant, audit, usage and provider-neutral subscription tables added to the one pre-v1 SQL baseline.
- Tenant owner-read RLS, restricted direct mutation grants, provider-event uniqueness, type contracts, canonical manifest/checksum and static schema guard.
- Synthetic SQL-backed E2E probe added for grant isolation, unauthorized writes and event replay; this is not evidence until exact-head CI completes.
- No public price, quota policy, provider checkout, live deployment or private data migration.

## Acceptance blockers — do not archive

1. **Single authority:** existing `teachers.hosted_*`/Stripe-specific authority, env capacity checks and teacher counter still exist. Implement effective entitlement resolution, atomic teacher-row capacity lock and data-mapping decision. Remove dual authorities and verify every student/workplace write path.
2. **Full field-level schema:** finish Personal/Professional workplace lifecycle, verified enrollment and archive behavior, finance/portal/credit constraints, extensible rating categories and evidence, justified recurrence exception and immutable report publication snapshots. Review all 87 prior physical tables plus new ones.
3. **Security:** add cross-tenant composite FK, negative RLS and SECURITY DEFINER probes for each changed relation. Audit immutable records, provider-event ordering, idempotency, time-bounded grants and over-quota downgrade.
4. **Application:** regenerate verified database types, seed and fixtures; repair already-implemented website/MCP behavior and prove identical premium/limit errors and readback.
5. **Validation:** full exact-head tests, SQL-backed concurrency, browser/MCP parity, security, Compose, fresh install and independently restored synthetic second instance must be green. Record exact run links and skips.
6. **Cutover:** populated target database remains separately authorized under ADR-0017. Do not run destructive migration or infer an empty beta database.

## Related branches

- PR #114: merged **documentation-only** consolidated proposal.
- PR #115: draft schema foundation; **must not merge until all above gates pass**.
- PR #113: separate archived-student concurrency test; its own exact-head acceptance is required.

**Archival rule:** check off the consolidated OpenSpec only when all Phase 0–2 acceptance items are evidenced on the merged source commit. Phase 3 live cutover is an independent operator gate and must not be claimed.
