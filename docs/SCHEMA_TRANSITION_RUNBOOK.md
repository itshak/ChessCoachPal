> **2026-11-21 current-owner update:** This document is a dated historical snapshot/runbook. All unfinished DDL planning has moved to [one consolidated final-schema + Freemium P0](../openspec/changes/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md) under ADR-0019. Do not treat earlier draft-PR/source status or original freeze references below as current implementation or live cutover authority.

# ChessCoachPal pre-v1 — one final database cutover / reimport runbook

**Policy:** [ADR-0017](adr/0017-pre-v1-single-final-cutover-no-compatibility.md).
**Status:** Future **operator-controlled** procedure; this document does not approve, execute, schedule, or guarantee an actual migration, production reset, deployment or data deletion. There is **no backward compatibility before v1.0.0**. The public repository never stores real customer, child, parent, payment or portal credential data.

## Current development model

- **One** fully consolidated fresh-install SQL: `supabase/migrations/20261107000000_chesscoachpal_baseline.sql`. No historical incremental migration files, compatibility views, dual writers, legacy guardian/Family/Studio APIs or old portal tokens may remain in the **accepted final** app. The old migration history is available in Git as dated evidence; it is **not** an installation path.
- `scripts/schema-transition-manifest.json` (v2) pins the current baseline checksum, required objects and `operatorCutoverRequired` decision. `npm run schema:canonical:guard` rejects any additional pre-v1 SQL migration in `supabase/migrations`. `npm run pre1:final-cutover:audit` **must pass** before final OpenSpec acceptance; it currently fails until all legacy runtime and schema consumers are removed.
- `m5-restore.yml` executes a **synthetic, GitHub-only** clean-baseline reproducibility and authorization test, then backs up a disposable Supabase database (including new scoped contacts/portal records and Storage bytes) and restores it to a **second empty** disposable project. It NEVER inspects or migrates the live beta.
- Existing source-level `supabase/seed.sql` and synthetic test credentials are development-only and **must not** populate a real customer database.
- Website ↔ MCP parity, authorization, tenant/RLS isolation, portal-scope checks, exact group-session semantics and idempotency must be retested on the **final** source SHA. Do not treat the current draft route/tool count as behavioral acceptance.

## One final cutover — choose exactly one path

The product owner accepts both options. Neither is automatically selected by checking source into Git.

### Path A: one direct, reviewed source-to-final transformation

Use only if the actual observed deployment has meaningful records the teacher cannot readily reimport. Inspect its private schema and migration ledger without copying private rows to GitHub. Prepare **one** source-to-final transformation into the complete final canonical target, with explicit owner, student alias, learning history, lesson/attendance, compensation/invoice/payment and record ID mappings. All obsolete tables and old portal tokens are dropped only when the selected records are safely reconciled in the target. Do **not** replay the historical per-feature migration chain. Never infer new contact portal grants from old guardian relationships or old bearer links.

The direct operator script, if required, belongs in a **restricted, separately reviewed operator package**, not as an extra default fresh-install migration. All SQL, staging and before/after reconciliation must use an isolated restored copy first. Reject ambiguous mappings rather than guessing. Maintain the exact source/target checklist privately.

### Path B (preferable if genuinely simpler): verified fresh baseline + explicit reimport

Safeguard an encrypted off-host export of the existing database and uploaded files. In a separate **empty** deployment target install the **final** canonical baseline exactly once. Reimport the specifically selected current teacher-owned records with documented field/ID mapping and independent checks of student aliases, active/archived state, workplace/group/lesson/attendance links, session notes/materials, billing and amounts actually received. Do not import legacy household credentials or implicit access grants. If any development data is intentionally omitted, record that decision with the operator before switching traffic. Identity/authorization and new scoped portal grants are created afresh.

A fresh target is not a license to wipe the existing live database prematurely. Keep the prior installation recoverable and offline until the new target and complete selected data are verified and authorized for switchover.

## Private execution and safety gates (both paths)

1. **Pin exact release candidate:** approved commit/PR, current authoritative schema checksum, full relevant tests green on that SHA, no obsolete Family/Studio/guardian contracts, all OpenSpec changes in scope accepted, refreshed MCP catalogue and authenticated website actions verified.
2. **Inventory current live data privately:** deployed version, schema ledger, auth identities, teacher/student/contact/archived counts, history, events, payment/credit totals, file storage, and previously used portal tokens/links. Never paste real records or secrets into GitHub issues, PRs, Actions, logs or AI prompts.
3. **Verify recoverability:** encrypted **off-host** backup of DB, Auth and Storage; restore into an isolated access-controlled environment, verify the data and referenced uploaded bytes before proceeding. A downloadable dump without a tested restore is not sufficient.
4. **Approve target and choice:** record the operator, exact source and destination databases, chosen Path A or B, included/excluded data sets, mapping rules, environment variables, cutover window, credential/token invalidation, notification and incident/rollback owner. No default env/CLI project link, `db push` assumption or shared development connection is sufficient.
5. **Rehearse:** compare canonical counts/IDs and sampled relationships, date/timezone/DST, idempotent imports, finance balances, grant denial, replay, unexpected errors, tenant/RLS isolation, full website/MCP business field readback and newly issued portal link revocation. Exercise recovery from a failed/partial operation.
6. **Quiesce writes, execute once:** take a fresh verified backup, block conflicting writes and apply only the approved direct cutover or fresh reimport on the explicit target. No old portal link may survive as a valid new grant. Avoid a period of parallel old/new writers.
7. **Verify before traffic:** reconcile records, amounts, Auth, Storage, RLS/grants, user permissions, no-store/referrer security, narrow external portal, website and MCP reads/writes, group lesson one-hour rules and correct production-domain revision. Reissue only explicitly teacher-approved scoped portal links; notify affected viewers where needed.
8. **Failure recovery:** halt new writes and traffic, preserve logs privately, and restore the independently verified previous snapshot or return to the preserved old service according to the approved plan. Do not improvise reverse SQL or delete the sole recovered copy.
9. **Close operational record privately:** final deployed SHA and schema hash, selected path, actual record reconciliation, backup/restore proof, unsupported cases, operator approval and open privacy/client acceptance issues. GitHub documentation should contain sanitized proof only.

**Not authorized by this runbook:** live data deletion/reset, any automatic background migration, production deployment on a code push, retroactive claims of client certification, unrestricted sharing or accounting document issuance.
