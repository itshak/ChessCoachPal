# Releasing ChessCoachPal

**Policy:** There is no compatibility guarantee with CogNote or between any two ChessCoachPal versions prior to `1.0.0`. See [ADR-0001](adr/0001-pre1-breaking-changes.md). Release notes must call out destructive reset requirements and significant breaking changes.

## OpenSpec release plan

The five automated readiness checkboxes below are the **prepublication gate**; manual checks are deferred, not the implementation plan. The [v0.1.0 roadmap](../openspec/ROADMAP-v0.1.0.md) has five milestone outcomes: Milestones 1, 2 (verified MCP/OAuth foundation), 3, the implemented part of 4 and the automated self-hosting/report/recovery part of 5 are archived. The expanded agent-tool change (2b) is also implemented and archived after main verification; the remaining active work is [complete-v0-1-0-release-gates](../openspec/changes/complete-v0-1-0-release-gates/proposal.md), which carries former 5.8–5.12 including unfinished M4 history/PII/asset review. **Before release, all development work must pass GitHub Actions using synthetic data**. Real ChatGPT and Claude client acceptance is deferred until after v0.1.0 publication by the maintainer's explicit release instruction. See [manual prepublication test procedure](LOCAL_CLIENT_ACCEPTANCE.md). Archive development milestones based on passing automated evidence; a real-client demonstration is not a prerequisite for their closure.

The release-only [predecessor](../openspec/changes/archive/2026-11-08-finalize-v0-1-0-publication/ARCHIVE_DECISION.md) was archived as superseded/partial after a working real Codex demo, **without waiving or completing any remaining release gate**. The original [adopt-cognote-chesscoachpal archive](../openspec/changes/archive/2026-11-07-adopt-cognote-chesscoachpal/proposal.md) is superseded and was never fully implemented.

## Current status

ChessCoachPal has published pre-1.0 releases; [v0.1.5](https://github.com/itshak/ChessCoachPal/releases/tag/v0.1.5) is the current live release before this v0.1.6 change. The first `v0.1.0` release gate was already completed under the explicitly documented deferred manual tasks below. Later releases must retain strict CI, tenant and browser/MCP parity checks, and run only through signed, immutable GitHub release tags. Publishing a source release does **not** certify manual live ChatGPT/Claude workflows.

Each published version is a *reviewed commit on the current `main` branch* with:

- Matching `package.json` and `package-lock.json` root versions.
- A dated, nonempty `## [X.Y.Z] - YYYY-MM-DD` entry in [CHANGELOG.md](../CHANGELOG.md).
- A unique annotated Git tag `vX.Y.Z`, created by CI.
- An automatically published [GitHub Release](https://github.com/itshak/ChessCoachPal/releases) with that changelog entry and GitHub's automatically generated **Source code (zip)** and **Source code (tar.gz)**.
- A passing automated release gate before the tag and release can be created.

## Workflow

1. Collect user-visible changes under `## [Unreleased]` in `CHANGELOG.md` as development proceeds. Never include private student information, credentials or personal URLs.
2. Finish and archive all development changes with automated GitHub Actions evidence; retain the post-release manual tasks as explicitly open.\n3. After all five automated prepublication checks pass, run `npm run release:prepare -- 0.1.0` (substitute the version) in a development checkout or GitHub-based workflow. This prepares the manifests and dated changelog; it does **not** publish anything. Inspect the changes and commit them in a PR. Do not claim that deferred manual checks were performed.
4. Run `npm run release:validate -- 0.1.0` and `npm run release:check` locally. Merge the reviewed PR into `main`.
5. [Publish GitHub Release workflow](../.github/workflows/release.yml) detects that `main` now names an unpublished version, checks the changelog/version consistency, verifies fresh Supabase initialization, runs typecheck, unit and release-script tests, builds the production app, and runs browser E2E tests. **Any failure blocks publication.**
6. On success, automation creates `vX.Y.Z` pointing at that **same commit**, generates release notes from its changelog section and publishes the GitHub Release. GitHub supplies both source archives automatically. No one needs to upload the source ZIP manually.
7. If GitHub publication fails after tagging, rerun the workflow via `workflow_dispatch`; it recognizes a preexisting tag pointing to the same commit. It never silently reuses a tag on a different commit or republishes an existing release.

The workflow is deliberately scoped to `main`; PRs cannot publish releases. Version `0.0.0` is explicitly skipped. A later `0.1.1`, `0.2.0`, etc. follows the same process. SemVer prerelease identifiers such as `0.2.0-beta.1` result in GitHub prereleases.

## v0.1.0: first functional release gate

**Maintainer-directed release policy, 2026-11-15:** publish the tested v0.1.0 application now; complete outstanding manual live-provider, historical privacy, repository settings and third-party asset/licensing reviews after release. These deferred tasks are **NOT completed or certified**. This is an explicit acceptance of publishing a pre-1.0 release with known unresolved manual checks, not a statement that the historical materials are safe or that real ChatGPT/Claude clients have been verified.

Automated prepublication evidence, all verified on merged main `d825d81` and on the release candidate before tagging:

- [x] Fresh self-hosted synthetic installation and signup without AI subscriptions (Compose smoke workflow).
- [x] Teacher website CRUD, student/workplace/group, scheduling, attendance and corrections (authenticated E2E).
- [x] MCP-first parity, 93-case route checklist and strict inventory, shared authenticated business operations (strict parity CI and E2E).
- [x] Cross-tenant RLS, authorization, idempotent coaching writes and correct group attendance accounting (synthetic security/E2E).
- [x] Full CI, production build, browser E2E, security history scan, Compose and database/file restore passed on tested source (GitHub Actions).

**Deferred manual tasks — open after publication, not checked or represented as complete:**

- [ ] Real ChatGPT **and** Claude HTTPS OAuth/MCP create/edit/revoke and website correction using synthetic records; record sanitized results.
- [ ] Repository Homepage correction; review historical Actions artifacts/logs, unreachable/binary entries, PII/secrets and third-party licensing/redistribution rights; rotate any exposed credentials and document disposition.
- [ ] Confirm the live Coolify private-beta hostname, HTTPS, release SHA, Auth, website and MCP after the domain cutover. Verify configured scheduled jobs and the SendPulse email path separately; do not mark tests passed without live evidence.

This is a deliberate release-policy exception authorized by the maintainer, not a retroactive attestation of the deferred checks. The first-release validator verifies **only the five prepublication automated checkboxes**; it must not treat the deferred manual checklist as complete.

## Supported compatibility policy

**Controlling pre-v1 policy (2026-11-18):** [ADR-0017](adr/0017-pre-v1-single-final-cutover-no-compatibility.md) requires **NO compatibility layers** for CogNote or earlier ChessCoachPal versions. The final source has one canonical fresh-install SQL baseline and no incremental upgrade chain in `supabase/migrations`. Browser and MCP current-domain operations must remain in functional parity; obsolete Family/Studio/guardian routes, tools, physical tables and broad portal tokens are removed, not aliased.

**One final production cutover, separately approved:** after all planned accepted OpenSpec work is integrated, the authorized operator chooses **either** (A) one direct source-to-final mapping **or** (B) a verified empty target and deliberate export/reimport. No individual feature branch runs a production migration, and a release/tag/CI job never authorizes an existing-data reset. Test the canonical baseline on isolated synthetic data, prove a separate off-host backup restores, get target-specific private approval, revoke old broad tokens, independently verify all selected records and client actions, and then switch once. See [the final-cutover runbook](SCHEMA_TRANSITION_RUNBOOK.md). Do not archive or publish if `npm run pre1:final-cutover:audit` reports legacy-contract violations. Post-v1 compatibility is a separate future decision.

## Coolify private-beta deployment policy: published releases only

The [release workflow](../.github/workflows/release.yml) runs the full release gate, publishes the annotated tag and GitHub Release, then invokes the restricted [Coolify deployment workflow](../.github/workflows/deploy-coolify-release.yml). The Vercel production deployment job has been removed. No tag push, ordinary commit or pull request triggers a deployment by itself.

The existing Coolify application and persistent database/Storage volumes are **reused** rather than replaced during the domain cutover. Its forced-command SSH deploy user accepts only an exact published SemVer tag and SHA. To avoid breaking the existing authorized key before the cutover, the reusable workflow temporarily retains the historically named `staging` GitHub Actions environment and `COOLIFY_STAGING_*` credentials. These refer to the **same** Coolify application resource, not to a parallel deployment. Change/rename them in a separate credential-rotation step after private-beta domain verification.

**This repository change does not itself configure Coolify domains, change its encrypted environment variables, issue certificates, migrate DNS, or delete Vercel.** Those operational changes are documented in [BETA_DOMAIN_CUTOVER.md](BETA_DOMAIN_CUTOVER.md) and must be verified before considering the private-beta hosting switch complete. Invite-code enrollment and waitlist must remain operational, and public GoTrue signup must not bypass the invite gate. Keep release-traceability and the strict MCP parity gate unchanged.

The old `vercel.json` also schedules `/api/cron/event-reminders`. Before shutting down Vercel, confirm that the equivalent optional Coolify `cron` service or an explicitly configured Coolify scheduled task is enabled with an appropriate `CRON_SECRET` when reminders are required. Do not silently treat the application deployment workflow as equivalent to scheduled execution.

## GitHub permissions

The release workflow needs GitHub Actions permission to write repository contents so it can create tags and GitHub Releases. The workflow requests `contents: write`; repository or organization settings must allow Actions to use that permission. If tag protection/rulesets block release tags, allow this workflow through the corresponding trusted mechanism. Do not store Personal Access Tokens in source.

The `package.json` field `private: true` means the app is not published to npm; **GitHub Releases** are the distribution channel. GitHub-generated source archives do not grant an open-source license to proprietary ChessCoachPal material. See [LICENSE](../LICENSE), [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md), and [ADR-0002](adr/0002-proprietary-licensing.md). Release readiness still requires the independent third-party licensing and asset review.
