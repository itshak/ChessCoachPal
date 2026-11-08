# v0.1.0 prepublication handoff — automated preparation vs manual release authority

**Prepared:** 2026-11-08 · **target:** v0.1.0 · **current package version:** `0.0.0` (unreleased) · **publication:** BLOCKED

This report is a **handoff**, not a sign-off. Do not set `0.1.0`, create `v0.1.0`, publish a GitHub Release, or check the six readiness boxes on the strength of synthetic tests alone. The last real-client check must be done by the maintainer on their own computer with **both** ChatGPT and Claude, immediately before the release PR. See [LOCAL_CLIENT_ACCEPTANCE.md](LOCAL_CLIENT_ACCEPTANCE.md).

## Automated milestone implementation

- Milestone 1: teacher-scoped workplaces, students, groups, lessons, attendance and website workflows — archived.
- Milestone 2 foundation: delegated OAuth 2 + PKCE + MCP, limited reads, single attendance/note writes, token lifecycle and website parity — archived.
- Milestone 2b: expanded MCP CRUD/enrollment, lesson details/create/reschedule/cancel, atomic coaching-write receipts, revision checks and scoped synthetic security tests — [PR #13](https://github.com/itshak/ChessCoachPal/pull/13), merged at [e0d99bc](https://github.com/itshak/ChessCoachPal/commit/e0d99bc5429dbd639b6a8a3a613c34f8610ebc59). See [canonical applied spec](../openspec/specs/agent-tool-coverage/spec.md).
- Milestone 3: unverified chess observation proposals, curated HTTPS learning links and approved website review — archived.
- Milestone 4: old CogNote-only implementation removed, fresh canonical schema and security scanning — code archived; **history/asset clearance remains a release task**.
- Milestone 5 automated part: fresh self-host Docker/Compose onboarding, backup and restore of PostgreSQL plus uploaded files, reports, tests and release automation — archived.

The application, including agent integrations, is verified **only** with synthetic clients/database. No real ChatGPT/Claude OAuth tool roundtrip has been accepted. The self-hosted website works without an AI account.

## Automated checks and release automation

GitHub verifies the current main commit with `CI` (typecheck, unit tests, Docker, Compose syntax), `E2E` (fresh Supabase, production build, Playwright), `M5 self-host Compose smoke`, `M5 backup-restore smoke`, and `Security history audit`. Exact merged-main run URLs and results belong in [STATUS.md](STATUS.md).

The existing [GitHub release workflow](../.github/workflows/release.yml) skips unpublished `0.0.0`; a later reviewed `0.1.0` version/changelog commit will trigger the candidate checks and **only then** create an annotated tag, GitHub Release and source zip/tar.gz. The release validator checks all six [readiness criteria](RELEASING.md). Do not merge the version bump or set the manual checkbox before real provider sign-off.

## Items not automatically cleared for publication

1. **Historical privacy and redistribution audit:** The recorded GitHub Actions archive scan reviewed 258 runs, 246 retrievable log archives, 76 artifact ZIPs and 2,630 readable text entries, with **0 high-confidence credential-pattern detections**. It also found **125 heuristic review candidates across 60 runs**, 9 unavailable logs, and 67 unreadable/large/binary entries. These are **not** confirmed exposures, but they are not permission to publish. Triage each candidate and any old/publicly reachable GitHub object, remediate/rotate actual secrets if discovered, and record a release-authorized decision. A redacted scan cannot prove PII or third-party asset clearance.
2. **Third-party licenses/assets:** Runtime and image dependency SPDX metadata and upstream notices have been inventoried in M4. A human still must confirm redistribution and source-history artifacts before publishing; do not claim the repository and all old Actions artifacts are definitively private-data-free.
3. **Live ChatGPT and Claude:** Both actual clients must perform delegated authorization, discover and invoke supported write tools, demonstrate revision-safe create/edit, show website correction, and confirm revocation from the maintainer's local synthetic HTTPS test instance. Supported plans, OAuth connector UI and write-tool permissions can differ. Record sanitized evidence only.
4. **Final governance and publication:** Complete the six checked boxes with evidence, run `npm run release:prepare -- 0.1.0` **only after** the test and all audits, approve the 0.1.0 manifest/lockfile/changelog PR, merge to main, and inspect the release Action, tag, GitHub Release and source archives. This report is not that approval.

## Human handoff

The next manual action is **not to publish**. First resolve outstanding historical privacy/license leads; after all non-provider gates have cleared, follow [LOCAL_CLIENT_ACCEPTANCE.md](LOCAL_CLIENT_ACCEPTANCE.md) on the maintainer machine. Only the maintainer's recorded success authorizes the final version-bump PR and automated GitHub publication.

**Compatibility:** Until 1.0.0 there is no compatibility commitment to CogNote or prior ChessCoachPal versions. Never reset a real database as part of testing.
