# Final-schema pre-production acceptance matrix (planned, not executed)

Status: **source acceptance in progress, not frozen**. The 2026-11-22 PR #115 source candidate includes new synthetic regressions for ENT-05, ENT-11, RAT-01 and TCH-03, plus new entitlement audit checks. Passing earlier implementation-commit workflows is not final-head acceptance; unexecuted scenarios remain open. This is a *test inventory*, not a report of successes or a publication claim. Website/MCP parity remains ADR-0003-required; real client acceptance is distinct.

> **2026-11-22 scope note:** The candidate is a fresh-install physical schema for 105 tables. This matrix requires both positive and negative authenticated checks. A synthetic test is not independent proof of a populated private database, customer entitlements or a production release.

| ID | Boundary / test | Deterministic expected result |
| --- | --- | --- |
| SCH-01 | Fresh empty baseline and manifest | All final objects, constraints, functions and migrations exactly match manifest |
| SCH-02 | Repeated install into a second disposable instance | No unknown dependency, duplicate physical model or missing extension |
| SCH-03 | Entire public table inventory | Every table has justified owner/security, RLS and matching type decision |
| SCH-04 | Tenants A/B cross-resource injection | Foreign student, workplace, contact, invoice, grant, subscription and evidence FKs rejected |
| SCH-05 | Authenticated direct SQL vs privileged RPC | No raw authenticated account plan, financial receipt, provider event or entitlement audit mutation |
| SCH-06 | Anonymous/portal token privilege | No raw private data, secret, unscoped family/student view or escalation |
| SCH-07 | SECURITY DEFINER function audit | Each definer's search path, auth.uid, owner, grants and replay boundaries proven |
| ENT-01 | New Free teacher provisioning | Immutable Personal workplace and enforced baseline grant state from first transaction |
| ENT-02 | Direct Free account insertion without trial | Cannot bypass active capacity from missing hosted_enforced toggle |
| ENT-03 | Two concurrent student creates | One slot not double-allocated; rejected transaction no student/receipt partial write |
| ENT-04 | Archived/reactivated same student | Stable ID, history, zero/one quota counted and atomic lifecycle |
| ENT-05 | Two archived lesson recovery commits (PR #113) | Exactly one winning committed lesson and activation for one slot, loser unchanged |
| ENT-06 | Batch spreadsheet import/restore/bulk | Multi-row quota reservation, owner scope, all-or-none rollback and exact replay |
| ENT-07 | Student in multiple groups/workplaces | Active count exactly one regardless of memberships and attendance |
| ENT-08 | Independent capacity override + temporary plan access | Pro expires, independent capacity boost remains, history unchanged |
| ENT-09 | Individual capability grant + separately paid Pro | Existing paid subscription remains valid, grant does not cancel it |
| ENT-10 | Paid Pro downgrade over Free student/workplace cap | Existing data and core lesson capture/edit/export survive; no new growth |
| ENT-11 | Professional workplace create/archive/reactivate | Correct professional-only count, one Personal protected, capacity SQL enforced |
| ENT-12 | Time boundary and concurrent grant edit | Transaction uses current valid effective grant and revision, not stale preview |
| ENT-13 | Unknown/invalid capability key and value | Denied, no malformed limit, explicit finite vs unlimited semantics |
| ENT-14 | Direct website/API/MCP premium write | Same typed UPGRADE_REQUIRED or CAPACITY_EXCEEDED, no unauthorized change |
| ENT-15 | MCP tool advertisement stale after downgrade | Actual invocation checks server entitlement and never grants access from tool list |
| ENT-16 | Two workflows duplicate usage request ID | One bounded metered unit only; not one charge per MCP sub-tool |
| PAY-01 | Webhook without provider authenticity | No writes, non-leaking denied request |
| PAY-02 | Replayed webhook provider event ID | At most once valid application; durable event receipt persists |
| PAY-03 | Old subscription deleted after newer paid subscription | No downgrade from stale event; source object/version checked |
| PAY-04 | Checkout return without verified subscription | No permanent premium grant |
| PAY-05 | Failed payment, grace, cancel at period end, refund | Exact effective time policy, no guessed paid state |
| PAY-06 | Two platform providers/merchant scopes | Unique IDs scoped correctly; provider migration doesn't mutate coach invoices |
| FIN-01 | One 90-minute multi-student group | One instructor session for hours; participant charges individualized only by agreement |
| FIN-02 | Coach received payment vs sent invoice | No fabricated income/cash receipt; separate immutable allocation/reversal |
| FIN-03 | Archived learner with credits/expired package | Hold preserves original funding/expiry, no automatic refund/transfer |
| FIN-04 | Historic payer/guardian data migration | No implicit portal privilege or incorrect debtor; numeric amounts reconcile |
| TCH-01 | Future cancelled unmaterialized slot occurrence | Persists one exception; no phantom future lesson on regeneration |
| TCH-02 | Recurrence this/future/all | Stable original-date identity, completed sessions/history untouched |
| TCH-03 | Published report and revoke | Approved snapshot, exact student/workplace audience and supersession |
| TCH-04 | Teacher-private notes in shared report | Never disclosed through guest view or generated publication |
| TCH-05 | Group learning observation for one student | No automatic assignment of review/maturity to other participants |
| RAT-01 | New federation/category registration | Can represent approved category without new student rating column/ALTER TABLE |
| RAT-02 | Provider returns missing or stale rating | Unknown stays unknown; historical immutable evidence survives |
| RAT-03 | Revoked rating sync consent mid-job | No new fetch/write; lease/revision/handle rechecked |
| OPS-01 | Public table RLS static guard | Required RLS-enable on all public tables; no stray disables/toggles |
| OPS-02 | Canonical legacy audit | No executable old Family/Studio or hosted bypass; no suppression |
| OPS-03 | Full TypeScript and authenticated web/MCP tests | Exact-head green with independent read-back and no missing routes |
| OPS-04 | CI/security/Compose and synthetic backup/restore | All required workflows green on same release candidate SHA |
| OPS-05 | Real beta source and independently restored copy | Separately authorized reconciliation of Auth, Storage, students, finance and portal |
| OPS-06 | Final operator cutover | Signed target-specific authorization, recovery plan and post-cutover counts; never inferred from PR |

**Exit gate:** only after every final requirement and test is evidenced may the consolidated schema OpenSpec be source-accepted and the manifest marked frozen. Private populated-data cutover and real payment activation remain later independent gates.

## Exact-head execution ledger — 2026-11-22

Candidate commit: [`99e143e8685bba448d42448e68cbb724efd93996`](https://github.com/itshak/ChessCoachPal/commit/99e143e8685bba448d42448e68cbb724efd93996). This evidence confirms workflow completion **only**, not that every row above has an executable assertion. These workflows ran automatically on push; do not treat them as a final post-freeze certification suite.

| Workflow | Exact-head run | Result |
| --- | --- | --- |
| CI | [44998982074](https://github.com/itshak/ChessCoachPal/actions/runs/44998982074) | success |
| Authenticated E2E | [44998982091](https://github.com/itshak/ChessCoachPal/actions/runs/44998982091) | success |
| Security history audit | [44998982028](https://github.com/itshak/ChessCoachPal/actions/runs/44998982028) | success |
| Fresh self-host Compose | [44998982014](https://github.com/itshak/ChessCoachPal/actions/runs/44998982014) | success |
| Synthetic second-instance backup/restore | [44998981999](https://github.com/itshak/ChessCoachPal/actions/runs/44998981999) | success |

### Concrete scenario evidence (partial; not blanket acceptance)

- **ENT-03/04/05, capacity:** `e2e/student-capacity.spec.ts` exercises simultaneous direct student writes, zero-cap rejection, archive/reactivation and concurrent archived lesson recovery; `e2e/schema-freeze-boundaries.spec.ts` covers professional workplace capacity. Full import/restore/bulk paths remain a separate cross-service acceptance obligation.
- **ENT-06, spreadsheet and backup capacity:** `e2e/parity-spreadsheet-commit.spec.ts` and `e2e/parity-import-atomic.spec.ts` exercise reviewed, over-cap multi-row writes through the real website and delegated MCP. Both must return typed `CAPACITY_EXCEEDED`, leave no earlier valid rows or receipts, preserve active counts, then support same-key/digest replay after a valid retry. Existing bulk lifecycle coverage is in `e2e/parity-historical-import.spec.ts`; reconciliation across every import/recovery workflow and the full Phase 2 checklist remain separate.
- **ENT-08/12, entitlement time:** `e2e/student-capacity.spec.ts` verifies expired plan access and independent capability boost/revocation. `e2e/platform-subscription-state.spec.ts` verifies paid-through expiry and a stale event cannot downgrade a newer valid subscription. Concurrent entitlement edits and cancellation/grace boundaries need a complete scenario-specific review.
- **PAY-02/03 and SCH-05:** `e2e/platform-billing-schema.spec.ts` proves provider event replay uniqueness, service-only writes and no entitlement elevation from an event receipt. `e2e/platform-subscription-state.spec.ts` covers stale subscription updates. This is not proof of an implemented authenticated provider webhook adapter or every provider ordering permutation.
- **SCH-04/06/07 and ENT-13:** `e2e/schema-final-saas-entitlements.spec.ts` and `e2e/schema-freeze-boundaries.spec.ts` check selected cross-tenant, commercial grant, report and operator catalog boundaries; `scripts/final-saas-schema-foundation.test.mjs` checks privileged function source grants. These do **not** yet establish an exhaustive per-table, per-function negative authorization matrix.
- **TCH-01/03, RAT-01:** `e2e/schema-freeze-boundaries.spec.ts` covers recurrence exception and report approval/scope, and extensible rating registry. Other temporal, consent, financial and guest scenarios require explicit linked evidence.
- **OPS-04:** all five workflows passed on the same SHA. **OPS-05/06** are separate populated-private-data operator gates and are not authorized or implied by this synthetic evidence.

### Freeze decision

**NOT FROZEN.** The unfulfilled Phase 0 source crosswalk/target comparison and remaining Phase 2 row-by-row security, finance, recurrence, subscription and website/MCP parity evidence are release blockers. The source schema must not be certified merely because five workflows are green. Final post-freeze tests, OpenSpec archive, merge and operational deployment remain distinct actions.

### Independent verification branch: scoped evidence, not signoff

- [`eca027dda79286ec3635b573aa4a098c3c1744fc`](https://github.com/itshak/ChessCoachPal/commit/eca027dda79286ec3635b573aa4a098c3c1744fc) in PR #115: five exact-head workflows completed successfully ([CI](https://github.com/itshak/ChessCoachPal/actions/runs/45028148129), [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45028148096), [security](https://github.com/itshak/ChessCoachPal/actions/runs/45028148098), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45028148115), [restore](https://github.com/itshak/ChessCoachPal/actions/runs/45028148149)). Those outcomes do not transfer to a subsequently updated branch.
- **SCH-01/02, OPS-01/02:** on the independent verification candidate, two isolated fresh bootstraps produced identical structural snapshots. The strict inventory confirmed 105 relations, 60 typed and 45 explicitly internal, with RLS enabled on all 105. The actual final-cutover source audit exited with zero violations. The comparison records its Postgres image and metadata coverage limits in the [structural evidence](SCHEMA_FREEZE_STRUCTURAL_COMPARISON.md).
- **ENT-03/04/05/14, SCH-05:** the six focused student-capacity cases passed in independent disposable runtime checks, including an authenticated Chromium roster at zero cap, a matching delegated MCP result, SQL write rejection, and unchanged persisted counter. This does not certify every premium path. Fifteen separate API cases on the verification branch covered selected entitlement, billing, recurrence, and audience boundaries; other rows remain open.
- **Post-freeze enforcement:** a prospective lock guard rejects edits to the accepted lock and coordinated SQL/manifest changes relative to the protected base. Its tests passed, but there is no accepted lock file yet. Do not add one until the source exit gate is met.
- **ENT-06, reviewed imports:** three focused disposable-stack scenarios passed: website/MCP spreadsheet over-cap rejection and same-key retry/replay, website/MCP backup-restore over-cap rejection and same-approved-digest retry, and the direct SQL spreadsheet rollback/replay control. Both application paths now expose the canonical capacity error. Independent readback verified no partial rows, receipts or counter changes on rejection. The unchanged bulk parity case was separately rerun on 5f2dc28 against a fresh seeded synthetic stack: both previews matched, delegated commit rejected over-cap reactivation, and original students stayed archived. That case does not prove a separate browser commit path.
- **FIN-03, a bounded SCH-04 case:** a dedicated Chromium/website and delegated MCP scenario proved that an actual foreign teacher cannot preview or commit an archive for another teacher's learner. Owner archive/replay preserved the expired paid credit package, expiry, invoice, payer and receipt without a credit adjustment or financial reversal. Independent database readback verified no denied-action receipt. This covers that lifecycle path, not all tenant resources.
