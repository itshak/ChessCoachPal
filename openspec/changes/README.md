# Active OpenSpec changes and accepted direction

**2026-11-18 decision set: accepted architecture, PROPOSED IMPLEMENTATION only.** No database migration, feature implementation, production deployment, OpenSpec archive, release/tag or test result is implied by these documents. The concurrently active [multilingual-support change](2026-11-17-introduce-multilingual-support/proposal.md) remains separate; implement its current source of truth rather than overwriting it.

Each proposal below contains four required artifacts: **proposal.md** (scope, motivation, boundaries), **design.md** (canonical schema/service/rollout decisions), **tasks.md** (unchecked verification checklist), and **specs/<capability>/spec.md** (SHALL requirements and WHEN/THEN acceptance cases).

## Accepted changes and suggested implementation order

| Order | Change | Priority | Dependencies / release boundary |
| --- | --- | --- | --- |
| 0 | [Canonical baseline and one-time live transitions](2026-11-18-enforce-baseline-live-transition-contract/proposal.md) | P0 | Foundation for every following schema-changing delivery; new installs vs populated beta |
| 1A | [Replace families with contacts and billing identities](2026-11-18-replace-families-with-contacts/proposal.md) | P0 | Requires 0; coordinate portal and finance cutover before removing guardian relationships |
| 1B | [FIDE and national federation identities/ratings](2026-11-18-introduce-fide-national-ratings/proposal.md) | P0 FIDE; P0/P1 Israel | Requires 0; Israeli automated adapter is conditional on lawful, reliable access |
| 1C | [Persistent workplace context and Studio retirement](2026-11-18-add-workplace-context-and-retire-studio/proposal.md) | P0 | Requires 0; preserve current workplaces and Beta entitlements |
| 2A | [Automatic public online rating synchronization](2026-11-18-automate-online-rating-sync/proposal.md) | P1 | FIDE/national provider-neutral snapshots first; opt-in, active-student bounded jobs |
| 2B | [Workplace compensation and correct payer/received-payment ledger](2026-11-18-implement-workplace-compensation-and-billing/proposal.md) | P1 | Requires contacts/billing identity and workplace context; no splitting/tax/payroll |
| 2C | [Scoped Student & Contact Portal](2026-11-18-scope-student-contact-portal/proposal.md) | P1 | Requires contacts; coordinate workplace filtering and finance access, never widen old token |
| 2D | [Daily coaching action queue, briefing and lesson closing](2026-11-18-improve-daily-coach-workflows/proposal.md) | P1 | Requires workplace context; independent of elaborate finance and portal |

**Execution order is a dependency plan, not permission to apply all changes in one merge or one live migration.** Prefer independently testable vertical slices. Schema-sensitive changes may share a carefully reviewed one-time deployed transition if introduced together; they must not create competing migrations, partial hard-coded guardian references or divergent fresh-install schema.

## Product decisions (accepted)

1. **Chess-first, not Studio/Family-first.** Teacher/business settings and optional contacts replace studio and household as primary concepts. Existing guardian links, emails, invoices, portal tokens and events must be preserved/transitioned rather than deleted.
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

## Non-negotiable delivery gates

Follow [ADR-0015](../../docs/adr/0015-baseline-first-and-one-time-live-transitions.md) and [ADR-0016](../../docs/adr/0016-chess-coaching-domain-boundaries.md). Every schema implementation updates **supabase/migrations/20261107000000_chesscoachpal_baseline.sql** and, for populated live beta, supplies one reviewed forward-only, data-preserving transition. The manifest and synthetic acceptance suite are specified in [the transition runbook](../../docs/SCHEMA_TRANSITION_RUNBOOK.md). First test both on clean/restored isolated Supabase with counts, RLS/grants, identity/invoice/portal relationships and backup/restore; never reset real data. Update the migration allowlist and CI.

Teacher-facing website and MCP operations must share domain services, typed schemas, exact field propagation, owned RLS, retries/idempotency, independent persistence read-back, parity registry and authenticated browser↔delegated MCP E2E in the same implementation. Portal guest operations require independent grant/security tests; secure credential handoff is not a license to omit teacher MCP grant management. Required CI/typecheck, strict parity, security, Compose, backup/restore and merged-main evidence must pass before accepting/archiving any implementation. Actual ChatGPT/Claude client checks are separate prepublication gates.

## Operator questions before live rollout (implementation, not reopened product decisions)

- Identify actual deployed revision, live Supabase migration history and current number of affected students, guardians, invoices, portal-token holders and workplaces **privately**.
- Verify a real backup and recovery into an isolated environment with no real child data in GitHub artifacts.
- Review contact-to-payer mappings, secondary guardians, incomplete national IDs, externally shared portal tokens and existing issued invoices for ambiguous associations.
- Confirm terms and provenance of Israeli/FIDE external data and parental consent for provider lookups.
- Review scope/notifications before disabling or reissuing any actively used portal link, and existing-beta entitlement communications before applying any future Pro gate.

These operational findings should be captured in **private** operator records and relevant tasks; do not commit personal records or confidential strategy/price hypotheses.
