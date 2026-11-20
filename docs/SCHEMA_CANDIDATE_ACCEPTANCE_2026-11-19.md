# Temporal enrollment and credit-safe lifecycle — source acceptance report (2026-11-20)

**State: DRAFT / NOT ARCHIVED / NOT MERGED / NOT AUTHORIZED FOR PRODUCTION.** This is a source-only development report. It is not permission to run the fresh-install migration on populated or live data. The implementation and review of other OpenSpec proposals remain independent gates.

## Dependency and branch inventory

| PR | Role | Current integration status |
| --- | --- | --- |
| [#104](https://github.com/itshak/ChessCoachPal/pull/104) | Contacts, payer, canonical schema foundation | Draft, unmerged; base `main` |
| [#107](https://github.com/itshak/ChessCoachPal/pull/107) | Owner-confirmed workplace on spreadsheet import, atomicity/localization | Draft, unmerged; stacked on #104; five exact-head checks passed at `da9958156390cfc3115c45c34ef3dedd3e4da753` |
| [#108](https://github.com/itshak/ChessCoachPal/pull/108) | Temporal membership, credit entitlement and archive/reactivation workflows | Draft, unmerged; stacked on #107; final exact-head acceptance pending |

`2026-11-19-freeze-unified-saas-schema-and-regressions` is still the inventory and schema governance umbrella, **not** an accepted freeze. The temporal proposal stays under `openspec/changes/` until its own requirements and security/funding invariants are accepted.

## Implementation candidate added to #108

1. **Temporal membership source of truth.** One canonical `workplace_enrollments` table allows multiple nonoverlapping, tenant-owned, inclusive dated periods; unknown legacy starts carry provenance. Closing a period preserves the canonical student and all completed lessons and frozen rosters. Current membership queries exclude closed/cancelled rows, and a database INSERT guard rejects attempted enrollment of an archived student even if a client bypasses the website. Teacher-local dates and row locks protect against concurrent archive and schedule writes.
2. **Reviewed membership lifecycle.** Teacher website panel and corresponding `ccp_workplaces_unenroll_preview`/`ccp_workplaces_unenroll` MCP tools use shared SQL preview/commit with revision, reason, confirmation, durable retry receipt and blocked group/future lesson/recurring slot reporting. Ending membership does not refund or transfer credits.
3. **Reviewed student archive and reactivation.** Shared website/MCP preview and transactional commit close current memberships, audit-cancel future periods and preserve identity and purchased credit holds. Only teacher-selected previously verified workplace IDs become new periods on reactivation; never-started future enrolments are not offered as historical suggestions. The existing database student quota trigger remains the race-safe active-capacity gate. Archive does not silently resolve other future commitments.
4. **Credit entitlements and financial provenance.** `credit_adjustment_events` is append-only and owner-linked. Separate confirmed RPC writes grants, forfeitures, paired transfers between compatible paid packages, expiry extensions, and entitlement deductions requiring a distinct previously recorded cash refund reversal. It verifies remaining balances under package row locks and preserves at-most-once receipts; it **never moves money** or represents an invoice as a settled payment.
5. **Website/MCP/UI and tests.** Credit displays and allocations include net audited deltas; teacher adjustment and archive review panels include English, Hebrew and Russian strings. The 44 gateway actions have named MCP correspondence and structural evidence. Dedicated authenticated tests cover history retention, website/MCP parity, replay, funded transfer/refund evidence and tenant rejection; they must pass on the exact final head before claiming behavioral parity.

## Workflow evidence and unresolved blockers

- Candidate `604e70f8e622505ee9a9f40d8d2ce083f0f7c394` passed CI (including typecheck and strict old-SQL/source audit), security, self-host Compose and backup/restore. Its authenticated E2E was superseded by further work and cancelled; **do not report it as a five-check green commit**.
- The earlier `ab673453472ed94e0ab87aaed7e85c6cbd01cb27` failed CI/Compose/E2E because of an unsupported TypeScript error code and a source audit false-positive on an SQL comment; these failures were repaired, not bypassed. The audit continues to scan all executable SQL references.
- **Exact latest-head acceptance remains necessary** after the archived-student INSERT guard and OpenSpec/report updates. Required evidence: typecheck, fresh canonical SQL install, RLS and foreign-teacher abuse, authenticated E2E, detailed credit/lesson/date/retry/tenant scenarios, website/MCP behavioral parity, security audit, Compose and clean second-instance backup/restore.
- **Existing legacy credit expiry edit path still needs review**: the historical direct `PATCH /api/billing/credit-packages/[id]` and `ccp_credits_package_expiry` can alter `credit_packages.expires_on` outside the new adjustment event ledger. Reconcile this contract with explicit audited expiry exceptions, tests and UI before source freeze. Do not assume the new RPC removed all bypasses.
- **Full schema and data inventory still outstanding:** active OpenSpec changes, canonical Contacts/payer and compensation FKs, finance source-of-truth, every enrollment/scheduling/recurrence/archive consumer, historic unknown dates and live/staging row reconciliation. The schema freeze proposal is not implemented/archived.
- **Populated database transition is a separate operator approval.** No live credentials, database writes, migration, reset or staging/live cutover were performed by this source PR. A source-only empty-database backup/restore CI result does not certify an off-host restore or the correctness of real historical data. Prepare a forward-only transition, run a verified off-host restoration, perform independent counts and obtain explicit sign-off.
- **Stacked merge order remains #104 → #107 → #108**, with each PR independently accepted; do not merge or archive #108 out of sequence.

## Archival decision

**DO NOT ARCHIVE YET.** A completed OpenSpec archive requires all implemented requirements checked with evidence and synchronized canonical specs, not merely code existence or a green subset of CI. Keep `2026-11-19-temporal-enrollment-credit-safe-lifecycle` and the schema freeze umbrella active. This report itself is a checkpoint, not completion certification.
