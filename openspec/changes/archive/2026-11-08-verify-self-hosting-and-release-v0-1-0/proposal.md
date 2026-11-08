# Change: verify-self-hosting-and-release-v0-1-0

- **Status:** Archived 2026-11-08 — automated development portion (5.1–5.7) merged and GitHub-verified; final v0.1.0 publication work (5.8–5.12) explicitly transferred, NOT completed.
- **Target:** The first public functional ChessCoachPal release, **v0.1.0**
- **Dependencies:** Accepted and verified [coaching workflow](../2026-11-07-complete-coaching-workflows/proposal.md), [archived tested MCP/OAuth foundation](../2026-11-07-connect-chatgpt-and-claude/proposal.md), [remaining GitHub-automated agent-tool actions](../../expand-agent-coaching-tools/proposal.md), [chess learning](../2026-11-07-add-chess-learning-basics/proposal.md) and [legacy/security cleanup](../2026-11-08-remove-cognote-legacy-and-secure-data/proposal.md).
- **Roadmap:** [v0.1.0](../../../ROADMAP-v0.1.0.md)

## Why

A version number alone is not a usable product. v0.1.0 must be a verified self-hostable chess-teacher assistant with durable records, agent-first input, website corrections, backups and explicit publication safeguards. GitHub Release automation is already merged but must not be triggered prematurely.

## Change

Verify a **fresh Docker/Supabase installation** with no mandatory external/AI subscriptions; publish accurate installation, configuration, recovery and first-run docs; provide actual backup/restore of database and uploaded objects. Implement a small deterministic workplace/date-range activity summary, not a complete salary or invoicing engine. Prove the web workflow and equivalent MCP/OAuth behavior automatically via synthetic GitHub Actions tests. **Only immediately before actually publishing v0.1.0**, the maintainer will perform one manual real ChatGPT and one real Claude end-to-end test from their own machine against a locally controlled, HTTPS-reachable synthetic app, followed by website correction. These manual client checks do not block implementation/archival of previous development changes.

First complete every other release-readiness condition using merged GitHub code and passing GitHub Actions. **Last, before any version bump may merge**, perform and document the maintainer's manual local ChatGPT/Claude verification from docs/LOCAL_CLIENT_ACCEPTANCE.md; then check the final manual checkbox. Prepare package version 0.1.0 and the dated CHANGELOG.md entry only after that sign-off. GitHub Actions then reruns release gates automatically and publishes the annotated tag and GitHub Release with ZIP and tar.gz source archives.

## Exclusions

Commercial hosting, full teacher contract/payroll reconciliation, multi-tenant school SaaS, chess engine/board, live rating sync and optional Google/Notion import/export adapters.

## Acceptance

GitHub Actions verifies a clean self-host setup, individual/group lessons, synthetic delegated MCP authorization and data writes, website correction, deterministic workplace summary, full backup/restore, RLS/privacy/license scans and all development tasks. As the **final manual prepublication step only**, the maintainer checks *real* ChatGPT and Claude delegated writes and website correction against a locally managed synthetic instance over HTTPS and records sanitized evidence. Until that manual sign-off, version remains 0.0.0, release checklist manual checkbox remains unchecked, and no v0.1.0 tag/release is created. After sign-off a version-bump PR merges, GitHub re-verifies and publishes automatically.


## Outcome and explicit handoff (NOT v0.1.0 release acceptance)

[Implementation PR #11](https://github.com/itshak/ChessCoachPal/pull/11) squash-merged at [main commit 3feae05](https://github.com/itshak/ChessCoachPal/commit/3feae05240339ac525b17593d9d194f80453e898); CI [42427869325](https://github.com/itshak/ChessCoachPal/actions/runs/42427869325), E2E [42427869349](https://github.com/itshak/ChessCoachPal/actions/runs/42427869349), security [42427869343](https://github.com/itshak/ChessCoachPal/actions/runs/42427869343), Compose [42427869301](https://github.com/itshak/ChessCoachPal/actions/runs/42427869301), backup/restore [42427869543](https://github.com/itshak/ChessCoachPal/actions/runs/42427869543). The main-verified development portion includes real fresh Compose startup and synthetic signup without AI, portable current-schema database/storage backup into an empty second instance with integrity checks, authorized workplace-local group/attendance reports, Hebrew RTL/CSV/text, core browser/PWA checks and a release workflow amended to re-run restore and Compose gates on future candidate commits. These facts do not establish live vendor interoperability, final history/privacy/license clearance or publication eligibility.

**Unfinished tasks 5.8–5.12 moved to [active release change](../../finalize-v0-1-0-publication/proposal.md).** The archival of implemented development does not mark those tasks done. The version stays 0.0.0 and all six docs/RELEASING.md final checkboxes remain unchecked; no tag or GitHub Release exists yet.
