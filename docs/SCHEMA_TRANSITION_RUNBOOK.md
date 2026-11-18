# ADR-0015 — Canonical baseline and live-transition operator runbook

**Policy:** The baseline in `supabase/migrations/20261107000000_chesscoachpal_baseline.sql`
is the *entire* new-install schema. Only already-populated deployments use reviewed
forward-only versioned migrations. A source merge does **not** authorize a live
database upgrade or reset. Never run the baseline against an existing database.

## Inventory of the current supported development path

The original fresh-install revision predates the following historical, strictly
ordered live transitions, now listed with SHA-256 review pins in
`scripts/schema-transition-manifest.json`:

1. `20261117000000_live_historical_lifecycle_extension.sql`: student
   lifecycle and historical attendance evidence/RPCs.
2. `20261117190000_mcp_workflow_composition.sql`: one canonical group
   lesson and teacher-approved material-commit workflows.
3. `20261117231554_family_communication_locale.sql`: independent guardian
   communication locale and owner-scoped update RPC.
4. `20261118000000_multilingual_teacher_and_family_locale.sql`: teacher
   UI locale and limited column grant.
5. `20261118150000_live_baseline_function_alignment.sql`: *new P0 convergence repair*,
   aligning `ccp_student_capacity_guard()` and
   `ccp_restore_canonical_chess_rows(jsonb)` to the baseline.
   The synthetic acceptance suite uncovered the older live definition drift.
   This **does not imply it has been applied in production**.
6. `20261118180000_contacts_identity_foundation.sql`: adds contacts,
   student-contact associations and billing account identities while preserving
   legacy portal and invoice records. Not a complete family/portal cutover.
7. `20261118183000_contacts_backup_restore.sql`: adds contact/relationship/
   billing-account restoration to the same transactional backup RPC. The
   corresponding full website JSON/CSV exports contain all three categories;
   model-facing bulk exports redact contact email and phone.

The manifest explicitly accepts historical development branches lacking some
later files, but **does not** promise conversion of arbitrary pre-v1 schemas.
The relevant baseline objects are pinned and must be present on a clean install.
Existing migration versions are immutable: editing a recorded version is never
a way to deploy a new schema. To change the effective schema, update the
baseline and append a new **reviewed** transition, manifest entry and test.

**Not verified from repository source:** the actual production/Coolify
migration ledger, last deployed commit, real affected record counts and
presence of older partial migrations. This information must be collected
**privately by the authorized operator** before a live rollout. Do not put
production SQL output, child records, passwords or backup dumps in GitHub.

## Developer and CI verification

- `npm run schema:canonical:guard` checks the baseline review digest, every
  transition digest, filename order and expected app-owned objects, as well
  as the older pre-v1 current-schema policy.
- `npm run schema:canonical:guard-test` exercises positive and negative
  contract cases (unlisted files, out-of-order files, changed SQL, incomplete
  approvals, missing target object).
- `m5-restore.yml` runs `verify-schema-transition-convergence.sh` before its
  own independent restore smoke. The convergence subtest builds a disposable local
  Supabase instance in GitHub Actions. It installs **only** the current
  baseline, stores the structural catalog signature, then resets the *local
  synthetic instance* to the frozen pre-extension baseline from commit
  `3a658a0bf5540f68c192b1a454bb5cdbc774f51b`. It inserts synthetic preserved records, applies the seven
  reviewed migrations via Supabase's local migration ledger, checks counts, relations,
  locale constraints, owner isolation, failure rollback and no second replay,
  then compares table/column privileges, constraints, indexes, triggers,
  functions, policies and RLS to the fresh baseline.
- `m5-restore.yml` separately verifies a backup/restore into a **second
  distinct disposable Supabase** and checks uploaded storage bytes.
  `m5-compose.yml`, security, CI and authenticated browser/MCP E2E remain
  mandatory acceptance gates on the exact PR head and merged main.

No tool runs this workflow against a live or remote database. The script
`scripts/verify-schema-transition-convergence.sh` refuses execution without
the synthetic GitHub CI controls and refuses externally supplied DB URLs.
The synthetic benchmark does not constitute a real production restore test.

## Required review of *every later* schema change

1. **Before review:** identify the current source SHA; what tables, grants,
   functions, policies, schema owners and on-disk/Storage data change; list
   destructive behavior, data mapping and potential race conditions. Determine
   the **privately observed** live ledger state and which records are affected.
2. **Fresh install:** update the canonical baseline and generated/types/API
   contracts in the same change. Verify it with the new-transition scripts
   temporarily omitted; SQL function bodies and schema grants must be valid.
3. **Populated transition:** add a monotonically ordered filename, predecessor,
   affected baseline objects, risk and checksum to the reviewed manifest.
   Use explicit preconditions, a bounded batch strategy when needed, idempotent
   replay where feasible and definitive postconditions. Never silently drop
   guardian relations, invoices, portal grants, archived students or evidence.
4. **Staging:** copy a **verified backup** of the live database and Storage into
   an isolated authorized environment with access restrictions; reconcile
   before/after counts, relationship keys, historical student IDs,
   invoice/credit linkage, portal-token access, per-tenant RLS, role grants
   and website/MCP operations. Do not upload real-user fixtures or backup
   artifacts to GitHub Actions. Confirm failed/partial states and replay safety.
5. **Human gate:** record private operator authorization with source SHA,
   exact target, timestamp, verified restore reference, migration manifest,
   dry-run/fixture results, rollout window, app compatibility window and
   designated recovery operator. Neither a passing CI run nor an OpenSpec
   archive substitutes for this approval.
6. **Deploy:** take and verify a new encrypted off-host pre-deploy backup.
   Prevent conflicting writes while applying approved forward-only
   transitions; check the **specific target/project**, migrations ledger and
   postconditions before deploying dependent application code. Do not use
   an implicit Supabase project link or `db push` target.
7. **Post-deploy:** reconcile affected record counts and hashes privately,
   verify RLS/role grants, Auth, Storage, portal access, dated histories,
   browser/MCP read/write/parity and delegated scopes. Monitor errors.
   A migration exit code alone is insufficient.
8. **Recovery:** stop dependent rollout and freeze risky writes. If the
   transition is safely resumable, use the reviewed recovery plan only after
   verifying the migration ledger and data state. For failed/destructive
   cutovers, restore the independently verified off-host snapshot into an
   isolated target and coordinate app rollback/reconciliation. Never guess
   an inverse SQL migration or reset an existing database.

## Production approval record (PRIVATE — not a repository document)

Maintain a private operator record containing: deployed SHA and migration
versions; schema-level preflight checks; counts and anonymized discrepancy
totals; backup identity, integrity and restore proof; approval identity and
time; explicit target/project; window, recovery plan and final reconciliation.
Keep it out of issues, CI logs and public release artifacts.

## Boundaries

This P0 contract **does not run any live migration** and does not certify a
currently deployed version. Later contacts, national ratings, workplace,
compensation, student portal and daily-workflow changes each require their own
reviewed schema implementation and acceptance. The old pre-v1 policy permits
breaking *source* changes but never authorizes destroying live teacher data.
