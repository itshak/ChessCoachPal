# Change: finalize-v0-1-0-publication

- **Status:** Proposed / publication BLOCKED. This is the final release-only successor to the [archived automated Milestone 5 implementation](../archive/2026-11-08-verify-self-hosting-and-release-v0-1-0/proposal.md).
- **Target:** v0.1.0, **not** version 0.0.0.
- **Dependencies:** Remaining [2b agent-tool scope](../expand-agent-coaching-tools/proposal.md), source/history/privacy/redistribution clearance (M4 tasks 4.10–4.12 carried as old M5 task 5.9), all six [release criteria](../../../docs/RELEASING.md), and the maintainer's final local ChatGPT/Claude approval.

## Why

Milestone 5's self-hosting, reporting, Docker/CI and current-schema recovery implementation is verified and archived, but the original proposal also contained publication-only obligations that **cannot truthfully be accepted before an actual v0.1.0 release**. No provider accounts are needed during development. Only after all other gates pass may the maintainer perform one real local vendor-client sign-off, followed by the reviewed version bump and GitHub Release.

## Scope

1. Complete remaining 2b GitHub-only agent CRUD/scheduling/security tests and settle the 125 scoped heuristic history candidates, inaccessible Actions logs, older reachable SHA risks, any actual key rotation/GitHub remediation, and third-party asset redistribution approval. Record exactly what was reviewed and residual limitations; never infer history purge or clearance from absence of high-confidence regex matches.
2. Review merged-main automated CI, fresh Compose onboarding, full current-schema synthetic DB/storage recovery, website/PWA/accessibility and tenant-isolation evidence. Retest/fix any regression using GitHub PRs, not unreviewed local/manual releases.
3. Immediately before publication, the maintainer uses real ChatGPT and Claude against a locally controlled HTTPS-exposed **synthetic** ChessCoachPal instance, proves delegated consent/authorization, tool write, website edit/correction and revocation, and records sanitized client versions/results in docs/STATUS.md per docs/LOCAL_CLIENT_ACCEPTANCE.md. This is the **sole manual provider test**.
4. Only after that recorded approval and every one of the six release checkboxes has supporting evidence, prepare a reviewed 0.1.0 package/lock/changelog bump, merge it to main, require the release workflow to re-run full browser, actual Compose and second-installation restore checks before tag creation, and record the real annotated tag, GitHub Release, notes and automatic ZIP/tar.gz sources.

## Non-goals

No backward-compatibility paths to CogNote or earlier ChessCoachPal 0.x versions; no real student records in CI; no unapproved destructive reset. No claim that passing synthetic MCP clients proves actual vendor compatibility.

## Acceptance

The former 5.8–5.12 tasks are checked only on observed evidence, with actual release URLs. Until then package version remains 0.0.0 and all final checklist boxes remain unchecked. The automated M5 archive is **not** authorization to publish.
