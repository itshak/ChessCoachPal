# Change: verify-self-hosting-and-release-v0-1-0

- **Status:** Proposed — milestone 5 of 5 (final release gate)
- **Target:** The first public functional ChessCoachPal release, **v0.1.0**
- **Dependencies:** Accepted and verified [coaching workflow](../archive/2026-11-07-complete-coaching-workflows/proposal.md), [archived tested MCP/OAuth foundation](../archive/2026-11-07-connect-chatgpt-and-claude/proposal.md), [remaining GitHub-automated agent-tool actions](../expand-agent-coaching-tools/proposal.md), [chess learning](../add-chess-learning-basics/proposal.md) and [legacy/security cleanup](../remove-cognote-legacy-and-secure-data/proposal.md).
- **Roadmap:** [v0.1.0](../../ROADMAP-v0.1.0.md)

## Why

A version number alone is not a usable product. v0.1.0 must be a verified self-hostable chess-teacher assistant with durable records, agent-first input, website corrections, backups and explicit publication safeguards. GitHub Release automation is already merged but must not be triggered prematurely.

## Change

Verify a **fresh Docker/Supabase installation** with no mandatory external/AI subscriptions; publish accurate installation, configuration, recovery and first-run docs; provide actual backup/restore of database and uploaded objects. Implement a small deterministic workplace/date-range activity summary, not a complete salary or invoicing engine. Prove the web workflow and equivalent MCP/OAuth behavior automatically via synthetic GitHub Actions tests. **Only immediately before actually publishing v0.1.0**, the maintainer will perform one manual real ChatGPT and one real Claude end-to-end test from their own machine against a locally controlled, HTTPS-reachable synthetic app, followed by website correction. These manual client checks do not block implementation/archival of previous development changes.

First complete every other release-readiness condition using merged GitHub code and passing GitHub Actions. **Last, before any version bump may merge**, perform and document the maintainer's manual local ChatGPT/Claude verification from docs/LOCAL_CLIENT_ACCEPTANCE.md; then check the final manual checkbox. Prepare package version 0.1.0 and the dated CHANGELOG.md entry only after that sign-off. GitHub Actions then reruns release gates automatically and publishes the annotated tag and GitHub Release with ZIP and tar.gz source archives.

## Exclusions

Commercial hosting, full teacher contract/payroll reconciliation, multi-tenant school SaaS, chess engine/board, live rating sync and optional Google/Notion import/export adapters.

## Acceptance

GitHub Actions verifies a clean self-host setup, individual/group lessons, synthetic delegated MCP authorization and data writes, website correction, deterministic workplace summary, full backup/restore, RLS/privacy/license scans and all development tasks. As the **final manual prepublication step only**, the maintainer checks *real* ChatGPT and Claude delegated writes and website correction against a locally managed synthetic instance over HTTPS and records sanitized evidence. Until that manual sign-off, version remains 0.0.0, release checklist manual checkbox remains unchecked, and no v0.1.0 tag/release is created. After sign-off a version-bump PR merges, GitHub re-verifies and publishes automatically.

