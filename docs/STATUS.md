# ChessCoachPal — current engineering and release status

**Updated:** 2026-11-20. This is the single short **current** status page; the [dated development history](history/STATUS_THROUGH_2026-11-19.md) remains available but is not an authoritative current-state summary. For task-by-task statuses, use the [active OpenSpec tracker](../openspec/changes/README.md).

## Repository integration

PR [#104](https://github.com/itshak/ChessCoachPal/pull/104) (Contacts, payer/portal/finance), [#107](https://github.com/itshak/ChessCoachPal/pull/107) (fail-closed student import/workplace enrollment), and [#108](https://github.com/itshak/ChessCoachPal/pull/108) (temporal enrollment, safe student lifecycle and credit adjustments) were **merged in order** on 2026-11-20. The source baseline is merge commit [`895cb193`](https://github.com/itshak/ChessCoachPal/commit/895cb193ba8a9efcf171bef8f668505a66a8bce6); the separate schema inventory/status cleanup is in [PR #109](https://github.com/itshak/ChessCoachPal/pull/109).

Those three source heads passed CI, authenticated website↔MCP E2E, security, Compose and synthetic restore checks. Verify the **merged-main** workflows separately before acceptance; they do not turn a source merge into release or production migration authorization.

## Release, deployment and data safety

- **Last published version checked:** `v0.1.9`. These source changes do not themselves publish `v0.1.10` or approve a Coolify deployment.
- The canonical baseline is for a **new empty** database. Existing beta/live records require **one** separately approved direct source-to-final transformation **or** a verified fresh target with deliberate reimport (ADR-0017). Do not run `supabase db reset` on a real database.
- Before cutover: privately inventory actual deployed revision, Auth/Storage and student/contact/lesson/payment/credit/portal histories; produce an independently verified encrypted off-host restore, explicit reconciliation, no hidden grants, replay/tenant tests, and target-specific operator authorization.
- No live customer data change, payment, email, portal token reissue, release or new deployment is claimed in this checkpoint.

## OpenSpec / schema snapshot

There are **13 active proposals**, spanning schema freeze and temporal enrollment plus contacts, import, portal, finance, ratings, workplace UX, language, daily/professional workflows and brand work. The existence of merged candidate code does **not** prove their acceptance tasks are complete. Do not archive unchecked requirements. See [OpenSpec tracker](../openspec/changes/README.md) and [schema inventory](SCHEMA_FREEZE_INVENTORY_2026-11-20.md).

Static canonical SQL inspection found **87 declared public tables** and an RLS-enable statement for each. The audited TypeScript `Database.Tables` contract covers **40** after the source-only improvement in PR #109, leaving **47** without an explicit entry; effective authorization and type decisions still need review. The release manifest protects a selected set of required objects rather than listing every table.

## Next engineering priorities

1. Complete schema domain ownership/type decisions, tenant-safe FK/grant/SECURITY DEFINER review, and financial/portal/credit provenance reconciliation with real SQL-backed tests.
2. Finish workplace context and daily teaching UX, verified provider-based rating updates, language/RTL, and professional workflow gaps. Preserve full ordinary website↔MCP functional parity.
3. Pass exact final-main CI, authenticated E2E, security, Compose, synthetic restore and independently reviewed populated-data migration rehearsals.
4. Archive each OpenSpec change only after its actual remaining tasks are checked, canonical specifications synchronized, and accepted evidence recorded; obtain separate operator approval before live deployment.

**Source of truth for future work:** [`openspec/changes/README.md`](../openspec/changes/README.md), [ADR-0017](adr/0017-pre-v1-single-final-cutover-no-compatibility.md), [ADR-0018](adr/0018-operator-only-saas-and-tenant-scaling.md), and [schema transition runbook](SCHEMA_TRANSITION_RUNBOOK.md).
