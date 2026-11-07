# Change: verify-self-hosting-and-release-v0-1-0

- **Status:** Proposed — milestone 5 of 5 (final release gate)
- **Target:** The first public functional ChessCoachPal release, **v0.1.0**
- **Dependencies:** Accepted and verified [coaching workflow](../complete-coaching-workflows/proposal.md), [AI clients](../connect-chatgpt-and-claude/proposal.md), [chess learning](../add-chess-learning-basics/proposal.md) and [legacy/security cleanup](../remove-cognote-legacy-and-secure-data/proposal.md).
- **Roadmap:** [v0.1.0](../../ROADMAP-v0.1.0.md)

## Why

A version number alone is not a usable product. v0.1.0 must be a verified self-hostable chess-teacher assistant with durable records, agent-first input, website corrections, backups and explicit publication safeguards. GitHub Release automation is already merged but must not be triggered prematurely.

## Change

Verify a **fresh Docker/Supabase installation** with no mandatory external/AI subscriptions; publish accurate installation, configuration, recovery and first-run docs; provide actual backup/restore of database and uploaded objects. Implement a small deterministic workplace/date-range activity summary, not a complete salary or invoicing engine. Test a real teacher workflow end-to-end via the web and both supported AI clients.

Check and evidence all six release-readiness conditions in docs/RELEASING.md, prepare package version 0.1.0 and dated CHANGELOG.md entry, then allow GitHub Actions to run release gates and publish the annotated tag and GitHub Release with source ZIP and tar.gz.

## Exclusions

Commercial hosting, full teacher contract/payroll reconciliation, multi-tenant school SaaS, chess engine/board, live rating sync and optional Google/Notion import/export adapters.

## Acceptance

A teacher follows a documented clean self-host setup, enters individual and group lesson attendance through the website and real ChatGPT/Claude clients, corrects the records in the website, reviews a deterministic workplace summary, backs up database plus uploaded files and restores to a second clean environment. All automation, RLS, privacy and license checks pass. The verified v0.1.0 tag and release then exist with changelog and source archives.

