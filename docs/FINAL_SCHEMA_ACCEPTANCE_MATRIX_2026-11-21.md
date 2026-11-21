# Final-schema pre-production acceptance matrix (planned, not executed)

Status: **all cases pending** until the consolidated P0 implementation is reviewed and exact-head tests run. This is a *test inventory*, not a report of successes or a publication claim. Website/MCP parity remains ADR-0003-required; real client acceptance is distinct.

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
