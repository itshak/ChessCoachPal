# Change: complete-v0-1-0-release-gates

- **Status:** Proposed / BLOCKED (release only, no implementation acceptance implied).
- **Supersedes:** [archived finalize-v0-1-0-publication](../archive/2026-11-08-finalize-v0-1-0-publication/ARCHIVE_DECISION.md), archived **partial / not accepted** so the verified hosted demonstration could be recorded separately.
- **Target:** reviewed v0.1.0 GitHub Release (current `0.0.0`).
- **Boundaries:** Prior implementation milestones and a real connected Codex demo are accepted evidence of deployed MCP subset. They do **not** waive the explicit final live ChatGPT/Claude, history/privacy, license, changelog, and release sign-offs.

## Why

The deployed ChessCoachPal website and hosted MCP/OAuth endpoint are now working, and a real maintainer Codex connection has written a synthetic student/workplace/enrollment to Supabase. All synthetic merged-main Actions checks are green. The prior active change, however, described the *future* v0.1.0 publication, which has not happened. Preserve its five outstanding gates unchanged in a fresh release-only proposal.

## Scope

1. Finish and disposition historical Actions/public metadata, inaccessible refs and third-party redistribution/licensing review. Resolve any real exposure before publication.
2. As the final manual pre-release step, verify **both real ChatGPT and Claude** delegated consent/tool write and read, website correction, cross-teacher isolation and revocation on synthetic data. Account/plan limitations must be recorded honestly. Existing real Codex create/enroll proof is supplementary, not a replacement.
3. Verify all six docs/RELEASING.md boxes with links to evidence. Review and merge a version 0.1.0 package/lockfile/changelog bump only after signoff; observe automated annotated tag, GitHub Release and source archives on the tested main SHA.
4. Record final URLs/evidence and archive **only when all five tasks are actually done**.

## Non-goals

Do not silently promise backwards compatibility with CogNote or pre-1.0 ChessCoachPal. Do not publish the disposable hosted demo as an official ChatGPT plugin. [Public Plugin Directory preparation](../../../docs/PUBLIC_PLUGIN_SUBMISSION.md) is a separate prospective product workstream and **not** a current release approval.

## Acceptance

All tasks 5.8–5.12 checked by actual observed evidence, not synthetic or Codex substitution. Package stays at `0.0.0` until final approval.