# Active OpenSpec changes and accepted direction

**2026-11-18 implementation status:** The P0 baseline/live-transition
contract was merged as [PR #103](https://github.com/itshak/ChessCoachPal/pull/103)
and archived. **OpenSpec 1A is IN PROGRESS in draft
[PR #104](https://github.com/itshak/ChessCoachPal/pull/104), not accepted or
archived.** The branch adds tenant-scoped contacts, independent student-contact
links and billing-account records, browser/MCP routes and initial E2E, source
inventory parity, contact-first student creation, and schema-aware transfer /
backup restore with reviewed **synthetic** migration checks. Old Family/guardian portal paths and issued-invoice/notification consumers
remain **unfinished implementation**, but they are to be **replaced, not kept as
compatibility layers**. Existing real records can be migrated once at the final
cutover or deliberately reimported from a verified backup (ADR-0017). The other six foundational domain proposals plus the recently added
professional-workflow and design-laboratory proposals are PLANNED, not implemented. The separately active [multilingual-support
change](2026-11-17-introduce-multilingual-support/proposal.md) is not complete.
Do not merge partial 1A or archive any unfinished proposal. No source change,
OpenSpec archive or synthetic database test authorizes a production migration,
release, paid feature, or live-user data operation.

Each remaining proposal below contains four required artifacts: **proposal.md** (scope, motivation, boundaries), **design.md** (canonical schema/service/rollout decisions), **tasks.md** (unchecked verification checklist), and **specs/<capability>/spec.md** (SHALL requirements and WHEN/THEN acceptance cases).

**2026-11-18 policy correction — binding [ADR-0017](../../docs/adr/0017-pre-v1-single-final-cutover-no-compatibility.md):** No backward compatibility before v1.0.0. All features target one final baseline; no family/studio/guardian compatibility endpoints, views, dual writes or old portal tokens in the accepted app. Development may use isolated fixtures and staged branches, but the real database gets **one final source-to-target migration OR one clean rebuild with deliberate import**, not incremental feature migrations. The owner explicitly permits the rebuild/reimport option. No real reset or migration is authorized by source approval; backup and a target-specific operator gate remain mandatory. New scoped portal grants are never inferred from old family access.

## Delivered foundation (P0)

[Baseline-first canonical schema and one-time live-transition contract](archive/2026-11-18-enforce-baseline-live-transition-contract/ARCHIVE_DECISION.md)
— source implementation accepted as a prerequisite for the rest of the plan.
The archived OpenSpec spec is reflected in
[baseline-live-transition](../specs/baseline-live-transition/spec.md).
Real deployment requires a separate, operator-approved data-preserving rollout.

## Remaining proposals in suggested implementation order

| Order | Change | Priority | Dependencies / release boundary |
| --- | --- | --- | --- |
| 1A | [Replace families with contacts and billing identities](2026-11-18-replace-families-with-contacts/proposal.md) | P0 | Requires 0; coordinate portal and finance cutover before removing guardian relationships |
| 1B | [FIDE and national federation identities/ratings](2026-11-18-introduce-fide-national-ratings/proposal.md) | P0 FIDE; P0/P1 Israel | Requires 0; Israeli automated adapter is conditional on lawful, reliable access |
| 1C | [Persistent workplace context and Studio retirement](2026-11-18-add-workplace-context-and-retire-studio/proposal.md) | P0 | Requires 0; preserve current workplaces and Beta entitlements |
| 2A | [Automatic public online rating synchronization](2026-11-18-automate-online-rating-sync/proposal.md) | P1 | FIDE/national provider-neutral snapshots first; opt-in, active-student bounded jobs |
| 2B | [Workplace compensation and correct payer/received-payment ledger](2026-11-18-implement-workplace-compensation-and-billing/proposal.md) | P1 | Requires contacts/billing identity and workplace context; no splitting/tax/payroll |
| 2C | [Scoped Student & Contact Portal](2026-11-18-scope-student-contact-portal/proposal.md) | P1 | Requires contacts; coordinate workplace filtering and finance access, never widen old token |
| 2D | [Daily coaching action queue, briefing and lesson closing](2026-11-18-improve-daily-coach-workflows/proposal.md) | P1 | Requires workplace context; independent of elaborate finance and portal |

**Execution order is a dependency plan.** Implement independently tested vertical slices, but integrate them into **one final canonical schema and one coordinated production cutover**. A fresh rebuild/reimport is an acceptable alternative to a complex historical SQL transformation. Do not deploy intermediate transition files, keep old guardian endpoints/dual-writers as compatibility, or leave a divergent fresh-install schema.

## Product decisions (accepted)

1. **Chess-first, not Studio/Family-first.** Teacher/business settings and optional contacts replace studio and household as primary concepts. The **new** contacts, communications, billing and events features must work; old schema/routes/tokens are retired. Before a final cutover, the operator decides which existing data to migrate or explicitly reimport; prior portal tokens never grant new access.
2. **Students may have multiple contacts and multiple workplaces.** Contacts may link to multiple students; zero contacts is valid. Contact/guardian relationship ≠ right to see private notes ≠ who pays.
3. **Groups are teaching rosters within workplaces.** Free includes groups and an implicit Personal Teaching workplace. Additional named workplaces and multi-workplace commercial entitlements are candidate Pro value, **not already implemented or priced**. Archived students retain history and are not counted against active student quotas.
4. **Financial obligations are lesson/agreement scoped.** School can pay for group teaching, parent for private teaching and federation for sponsorship. Earnings, invoice/receivable and actual payment are distinct. One instructor group session counts once for time-based earnings.
5. **Source-labeled external ratings.** FIDE Standard/Rapid/Blitz and Israeli national rating are high priority; provider-specific category registry anticipates US Chess/others. FIDE ID, national membership and teacher strength are different concepts. Online providers need consented automated refresh for active learners; archived students are not auto-polled.
6. **Portal is optional scoped sharing.** Keep calendar, cancellation, approved notes, RSVP, credits and relevant invoices. Use narrow revocable access; never infer a permission from family membership or payment alone. No independent parent/student account in initial delivery.

## Deliberate deferrals / research gates

- Multi-payer splitting one obligation, household debt allocation, full accounting, payroll/tax document issuance, bank integration, and broad SaaS entitlements/pricing.
- US Chess and other national-provider integrations beyond schema/category support.
- Israeli federation automation until official data-access feasibility, allowed rate and parsing stability are verified. Never claim a supported API without evidence.
- Interactive student/parent login, chess homework portal submission and agentic external-sharing without separate permission review.
- Automated mastery/strength inference from ratings, homework, games or teacher notes.
- Public marketing claims that planned Pro features or sync automation already exist.

## Final-cutover no-compatibility source gate

`npm run pre1:final-cutover:audit` verifies the **finished** repository ships only the canonical baseline SQL in the default migrations directory, without inherited guardians/studio physical models, `guardian_id` service readers, Family/Studio API routes or MCP tool names, and with explicit scoped portal grants. Its independent three-case fixture tests are part of `npm run schema:canonical:guard-test`. The migration-chain check is now enforced during ordinary CI; the separate no-legacy **release scan is expected to fail during WIP**, and must have zero violations before the combined changes can be accepted/archived. A passing source scan never replaces portal/RLS, website↔MCP, end-to-end, import or production-operator tests. Eight previously staged incremental SQL files have been removed from `supabase/migrations`; the v2 manifest and GitHub-only baseline/restore smoke enforce a clean new installation. If one final source-to-target transformation is chosen instead of rebuilding/reimporting, it remains a separately controlled operator artifact—not a pre-v1 compatibility chain under `supabase/migrations/`.

## Non-negotiable delivery gates

Follow controlling [ADR-0017](../../docs/adr/0017-pre-v1-single-final-cutover-no-compatibility.md) and [ADR-0016](../../docs/adr/0016-chess-coaching-domain-boundaries.md). Every schema implementation updates **supabase/migrations/20261107000000_chesscoachpal_baseline.sql**. Final acceptance specifies **one** direct transition from the observed live revision to that target **or** a clean rebuild/reimport, tested against isolated data with RLS/grants, counts, chosen invoices/history, explicit new portal grants and verified recovery. Interim synthetic transition files in the current branch are not a real-deployment upgrade plan. No production database alteration follows automatically from implementation or CI.

Teacher-facing website and MCP operations must share domain services, typed schemas, exact field propagation, owned RLS, retries/idempotency, independent persistence read-back, parity registry and authenticated browser↔delegated MCP E2E in the same implementation. Portal guest operations require independent grant/security tests; secure credential handoff is not a license to omit teacher MCP grant management. Required CI/typecheck, strict parity, security, Compose, backup/restore and merged-main evidence must pass before accepting/archiving any implementation. Actual ChatGPT/Claude client checks are separate prepublication gates.

## Operator questions before live rollout (implementation, not reopened product decisions)

- Identify the actual deployed source revision and selected export/reimport data categories (students, lessons, payments, contacts, etc.) **privately**; a source-to-final migration is optional, not mandatory.
- Verify a real backup and recovery into an isolated environment with no real child data in GitHub artifacts.
- Review contact-to-payer mappings, secondary guardians, incomplete national IDs, externally shared portal tokens and existing issued invoices for ambiguous associations.
- Confirm terms and provenance of Israeli/FIDE external data and parental consent for provider lookups.
- All existing broad household tokens become invalid at final cutover; issue replacement narrowly scoped links only after teacher approval. Review notification needs and existing-beta entitlement communications before applying Pro gates.

These operational findings should be captured in **private** operator records and relevant tasks; do not commit personal records or confidential strategy/price hypotheses.
