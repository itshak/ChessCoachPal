# Releasing ChessCoachPal

**Policy:** There is no compatibility guarantee with CogNote or between any two ChessCoachPal versions prior to `1.0.0`. See [ADR-0001](adr/0001-pre1-breaking-changes.md). Release notes must call out destructive reset requirements and significant breaking changes.

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
2. Decide that a version is ready and that the release checklist below is satisfied. For the first functional application, use **`0.1.0`**, not `1.0.0`. Reserve other versions for subsequent releases.
3. Run `npm run release:prepare -- 0.1.0` (substitute the version). This prepares the manifest, lockfile and dated changelog section locally; it does **not** publish anything. Inspect all changes and commit them in a PR.
4. Run `npm run release:validate -- 0.1.0` and `npm run release:check` locally. Merge the reviewed PR into `main`.
5. [Publish GitHub Release workflow](../.github/workflows/release.yml) detects that `main` now names an unpublished version, checks the changelog/version consistency, verifies fresh Supabase initialization, runs typecheck, unit and release-script tests, builds the production app, and runs browser E2E tests. **Any failure blocks publication.**
6. On success, automation creates `vX.Y.Z` pointing at that **same commit**, generates release notes from its changelog section and publishes the GitHub Release. GitHub supplies both source archives automatically. No one needs to upload the source ZIP manually.
7. If GitHub publication fails after tagging, rerun the workflow via `workflow_dispatch`; it recognizes a preexisting tag pointing to the same commit. It never silently reuses a tag on a different commit or republishes an existing release.

The workflow is deliberately scoped to `main`; PRs cannot publish releases. Version `0.0.0` is explicitly skipped. A later `0.1.1`, `0.2.0`, etc. follows the same process. SemVer prerelease identifiers such as `0.2.0-beta.1` result in GitHub prereleases.

## v0.1.0: first functional release gate

All of these must be checked and documented before publishing version `0.1.0`. The automated release validator **rejects v0.1.0 unless every checkbox below is marked `[x]`** in the reviewed `main` commit. A checkbox must only be marked after its evidence is recorded:

- [ ] A new user can follow documented self-hosted setup from an empty database and log in without requiring an OpenAI, Anthropic, Notion or Google subscription.
- [ ] Teacher website supports creating and editing students/workplaces/groups, enrollment, scheduling individual and group lessons, editing notes, and per-student attendance; reload accurately reflects changes.
- [ ] Authenticated **ChatGPT and Claude tool clients** can both create or update at least one record in the same backend, which the teacher can inspect and correct in the web UI. MCP/authorization requirements and supported clients are documented, with no service-role secrets leaked to AI clients.
- [ ] Permissions and RLS tests prove teachers cannot access other teachers' student, workplace, session or attendance information. Group attendance does not duplicate instructor teaching time.
- [ ] Fresh Supabase bootstrap, `npm ci`, typecheck, unit tests, production build, browser E2E, and self-hosted Docker checks pass.
- [ ] Third-party asset/license review, source history privacy scan, public documentation and handling of any exposed credentials are completed. Real student data is never included in source, sample fixtures, logs or release notes.

The checklist is a **release decision**, not an automated claim that the current port already works. Until it is met, keep `0.0.0` and write changes under Unreleased.

## Supported compatibility policy

For `0.x` releases, users may have to reinstall or explicitly reinitialize a development database. We **do not** retain CogNote migrations, API aliases or migration chains for old ChessCoachPal versions solely for compatibility. Never automatically erase a database that might contain real information. Decide the post-`1.0.0` compatibility and migration contract before publishing that milestone.

## GitHub permissions

The release workflow needs GitHub Actions permission to write repository contents so it can create tags and GitHub Releases. The workflow requests `contents: write`; repository or organization settings must allow Actions to use that permission. If tag protection/rulesets block release tags, allow this workflow through the corresponding trusted mechanism. Do not store Personal Access Tokens in source.

The `package.json` field `private: true` means the app is not published to npm; **GitHub Releases** are the distribution channel.
