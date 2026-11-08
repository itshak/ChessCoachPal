# Releasing ChessCoachPal

**Policy:** There is no compatibility guarantee with CogNote or between any two ChessCoachPal versions prior to `1.0.0`. See [ADR-0001](adr/0001-pre1-breaking-changes.md). Release notes must call out destructive reset requirements and significant breaking changes.

## OpenSpec release plan

The six readiness checkboxes below are the **final publication gate**, not the implementation plan. The [v0.1.0 roadmap](../openspec/ROADMAP-v0.1.0.md) has five milestone outcomes: Milestones 1, 2 (verified MCP/OAuth foundation), 3, the implemented part of 4 and the automated self-hosting/report/recovery part of 5 are archived. The expanded agent-tool change (2b) is also implemented and archived after main verification; the remaining active work is [complete-v0-1-0-release-gates](../openspec/changes/complete-v0-1-0-release-gates/proposal.md), which carries former 5.8–5.12 including unfinished M4 history/PII/asset review. **Before release, all development work must pass GitHub Actions using synthetic data**. Only **real ChatGPT and Claude client acceptance** is manual and must be done by the maintainer **on their machine immediately before the actual v0.1.0 publication**. See [manual prepublication test procedure](LOCAL_CLIENT_ACCEPTANCE.md). Archive development milestones based on passing automated evidence; a real-client demonstration is not a prerequisite for their closure.

The release-only [predecessor](../openspec/changes/archive/2026-11-08-finalize-v0-1-0-publication/ARCHIVE_DECISION.md) was archived as superseded/partial after a working real Codex demo, **without waiving or completing any remaining release gate**. The original [adopt-cognote-chesscoachpal archive](../openspec/changes/archive/2026-11-07-adopt-cognote-chesscoachpal/proposal.md) is superseded and was never fully implemented.

## Current status

The development snapshot is `0.0.0`. CogNote's inherited `0.1.0` in the package metadata was **not** a published ChessCoachPal release and has been reset. **Do not publish `v0.1.0` until the functional first-release criteria below are met.**

Each published version is a *reviewed commit on the current `main` branch* with:

- Matching `package.json` and `package-lock.json` root versions.
- A dated, nonempty `## [X.Y.Z] - YYYY-MM-DD` entry in [CHANGELOG.md](../CHANGELOG.md).
- A unique annotated Git tag `vX.Y.Z`, created by CI.
- An automatically published [GitHub Release](https://github.com/itshak/ChessCoachPal/releases) with that changelog entry and GitHub's automatically generated **Source code (zip)** and **Source code (tar.gz)**.
- A passing automated release gate before the tag and release can be created.

## Workflow

1. Collect user-visible changes under `## [Unreleased]` in `CHANGELOG.md` as development proceeds. Never include private student information, credentials or personal URLs.
2. Finish and archive all development changes against **merged main** with automated GitHub Actions checks, including the expanded agent tools (2b), learning (3), M4 security implementation (archived with remaining historic publication audit at 5.9), fresh install and backup/recovery (archived automated M5). Keep the version at `0.0.0`. **Do not require real ChatGPT/Claude logins yet.** Once all other gates pass, the maintainer runs the [local manual acceptance](LOCAL_CLIENT_ACCEPTANCE.md) with *synthetic records* from their machine and records sanitized client versions, successful authorized calls and website correction in docs/STATUS.md. Only this final manual check permits ticking the third checklist item below. If it fails, fix the code via GitHub PR/CI and repeat the local test before publication.
3. **Only after the manual local sign-off** and all six checked release criteria, run `npm run release:prepare -- 0.1.0` (substitute the version) in a development checkout or GitHub-based workflow. This prepares the manifests and dated changelog; it does **not** publish anything. Inspect the changes and commit them in a PR. Do not merge a version bump that would trigger publication before sign-off.
4. Run `npm run release:validate -- 0.1.0` and `npm run release:check` locally. Merge the reviewed PR into `main`.
5. [Publish GitHub Release workflow](../.github/workflows/release.yml) detects that `main` now names an unpublished version, checks the changelog/version consistency, verifies fresh Supabase initialization, runs typecheck, unit and release-script tests, builds the production app, and runs browser E2E tests. **Any failure blocks publication.**
6. On success, automation creates `vX.Y.Z` pointing at that **same commit**, generates release notes from its changelog section and publishes the GitHub Release. GitHub supplies both source archives automatically. No one needs to upload the source ZIP manually.
7. If GitHub publication fails after tagging, rerun the workflow via `workflow_dispatch`; it recognizes a preexisting tag pointing to the same commit. It never silently reuses a tag on a different commit or republishes an existing release.

The workflow is deliberately scoped to `main`; PRs cannot publish releases. Version `0.0.0` is explicitly skipped. A later `0.1.1`, `0.2.0`, etc. follows the same process. SemVer prerelease identifiers such as `0.2.0-beta.1` result in GitHub prereleases.

## v0.1.0: first functional release gate

All of these must be checked and documented before publishing version `0.1.0`. The automated release validator **rejects v0.1.0 unless every checkbox below is marked `[x]`** in the reviewed `main` commit. A checkbox must only be marked after its evidence is recorded:

- [ ] A new user can follow documented self-hosted setup from an empty database and log in without requiring an OpenAI, Anthropic, Notion or Google subscription.
- [ ] Teacher website supports creating and editing students/workplaces/groups, enrollment, scheduling individual and group lessons, editing notes, and per-student attendance; reload accurately reflects changes.
- [ ] **MCP-first feature parity:** Every ordinary authenticated teacher website business action and editable field has a tested equivalent via the **same /mcp endpoint** (or a reviewed, chat-initiated secure browser authorization exception). The [93-case website/MCP checklist](MCP_WEBSITE_PARITY_CHECKLIST.md) and full read/write RLS tests are complete; the machine inventory has zero partial/gap teacher-business routes, and `npm run mcp:parity:strict` passes on the candidate SHA. Website-only reports, material history, family and scheduling capabilities cannot be ignored or counted as complete just because MCP tools/list exposes some other tools.
- [ ] **Manual, final local prepublication gate (NOT a development test):** Immediately before publishing v0.1.0, the maintainer tested real authenticated **ChatGPT and Claude tool clients** against an HTTPS-reachable *synthetic* ChessCoachPal instance controlled from their machine. Each client authorized, created/updated a record, and its change was inspected/corrected in the website; versions, results and sanitized evidence are recorded in docs/STATUS.md using [LOCAL_CLIENT_ACCEPTANCE.md](LOCAL_CLIENT_ACCEPTANCE.md). No service-role keys were supplied to clients. This must NEVER be automatically checked merely because simulated MCP E2E passed.
- [ ] Permissions and RLS tests prove teachers cannot access other teachers' student, workplace, session or attendance information. Group attendance does not duplicate instructor teaching time.
- [ ] GitHub Actions on the candidate commit passed fresh synthetic Supabase bootstrap, `npm ci`, typecheck, unit tests, production build, browser E2E and self-hosted Docker checks (without external AI provider accounts).
- [ ] Third-party asset/license review, source history privacy scan, public documentation and handling of any exposed credentials are completed. Real student data is never included in source, sample fixtures, logs or release notes.

The checklist is a **release decision**, not an automated claim that the current port already works. The GitHub release validator enforces checked criteria, but cannot prove a human performed a live vendor connection: never check the manual item without the maintainer's recorded local test. No earlier OpenSpec development milestone can waive this final gate. Until all criteria (including local manual sign-off) are met, keep `0.0.0` and write changes under Unreleased. Version-bump merge triggers automated publication; therefore do not merge it early.

## Supported compatibility policy

For `0.x` releases, users may have to reinstall or explicitly reinitialize a development database. We **do not** retain CogNote migrations, API aliases or migration chains for old ChessCoachPal versions solely for compatibility. Never automatically erase a database that might contain real information. Decide the post-`1.0.0` compatibility and migration contract before publishing that milestone.

## GitHub permissions

The release workflow needs GitHub Actions permission to write repository contents so it can create tags and GitHub Releases. The workflow requests `contents: write`; repository or organization settings must allow Actions to use that permission. If tag protection/rulesets block release tags, allow this workflow through the corresponding trusted mechanism. Do not store Personal Access Tokens in source.

The `package.json` field `private: true` means the app is not published to npm; **GitHub Releases** are the distribution channel.
