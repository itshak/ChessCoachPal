# ChessCoachPal development and release status

**Updated:** 2026-11-07 · **Branch of record:** main · **Version:** 0.0.0 (unreleased) · **Release target:** v0.1.0

## OpenSpec acceptance and roadmap

The obsolete CogNote-adoption omnibus change was archived **as incomplete**, not incorrectly accepted: [historical record](../openspec/changes/archive/2026-11-07-adopt-cognote-chesscoachpal/proposal.md). See [the v0.1.0 roadmap](../openspec/ROADMAP-v0.1.0.md) and [ADR-0001](adr/0001-pre1-breaking-changes.md).

1. [complete-coaching-workflows](../openspec/changes/archive/2026-11-07-complete-coaching-workflows/proposal.md) — **ACCEPTED / archived**. Merged [PR #4](https://github.com/itshak/ChessCoachPal/pull/4) at main commit [a87fb63](https://github.com/itshak/ChessCoachPal/commit/a87fb63a8440a358d039187be48fce5a14609e36).
2. [connect-chatgpt-and-claude](../openspec/changes/archive/2026-11-07-connect-chatgpt-and-claude/proposal.md) — **ARCHIVED: CI-VERIFIED FOUNDATION**. [PR #5](https://github.com/itshak/ChessCoachPal/pull/5) was merged; the delivered subset is accepted on synthetic GitHub verification, **not** asserted as live ChatGPT/Claude compatibility. Remaining tool coverage is [active change 2b](../openspec/changes/expand-agent-coaching-tools/proposal.md).
2b. [expand-agent-coaching-tools](../openspec/changes/expand-agent-coaching-tools/proposal.md) — **Proposed**; complete remaining student/group/scheduling/resource MCP actions and GitHub-only security/contract tests, no actual AI account required.
3. [add-chess-learning-basics](../openspec/changes/add-chess-learning-basics/proposal.md) — **Proposed**; chess observation and learning-resource functionality not yet accepted.
4. [remove-cognote-legacy-and-secure-data](../openspec/changes/remove-cognote-legacy-and-secure-data/proposal.md) — **Proposed**; inherited music paths, privacy/history and broader security audits remain outstanding.
5. [verify-self-hosting-and-release-v0-1-0](../openspec/changes/verify-self-hosting-and-release-v0-1-0/proposal.md) — **Proposed**; no v0.1.0 release until other milestones and release checks pass.

## Milestone 1 — passing verification evidence

[PR #4](https://github.com/itshak/ChessCoachPal/pull/4) merged as [a87fb63](https://github.com/itshak/ChessCoachPal/commit/a87fb63a8440a358d039187be48fce5a14609e36), implementing a teacher-scoped shared service and the /coaching website:

- Configurable name, locale, timezone, currency and editable policy JSON for teacher-owned workplaces; reusable canonical students, search/edit, workplace enrollments and group enrollment/removal.
- Private and group one-off lessons with UTC instants, local-time DST gap/fold rejection, edit/reschedule/cancel, shared notes, per-student attendance and a chronological workplace-filtered session timeline.
- Database-triggered frozen session rosters and one attendance record per initial participant; removing a current group member does not rewrite existing lessons. Session idempotency, validation, cross-workplace checks and cross-teacher RLS are exercised.
- Instructor minutes count a 60-minute group session once, regardless of attendees; an absent participant does not cancel the lesson.

**CI:** [run 42407121579](https://github.com/itshak/ChessCoachPal/actions/runs/42407121579) — all three jobs passed (typecheck/unit/release checks, Docker, Compose).

**Real fresh-database E2E:** [run 42407121512](https://github.com/itshak/ChessCoachPal/actions/runs/42407121512) — `supabase start`, destructive reset of a **synthetic CI database**, production Next build, Playwright Chromium: **25 passed, 5 skipped, 0 failed**. Includes the two-workplace create/edit/reload path, private/group lessons, per-student notes and attendance, idempotent retries, historical roster and two-teacher isolation.

**Superseded PR:** [PR #1](https://github.com/itshak/ChessCoachPal/pull/1) was closed unmerged; its first E2E run [42392868328](https://github.com/itshak/ChessCoachPal/actions/runs/42392868328) had a workplace selector failure, now corrected and verified in PR #4. The older main PWA browser regression ([42394424153](https://github.com/itshak/ChessCoachPal/actions/runs/42394424153)) was also fixed by PR #4 and covered by its passing browser run. These earlier failures are historical evidence, not current acceptance failures.

## Milestone 2 — archived verified MCP/OAuth foundation (live clients are release-only)

[PR #5](https://github.com/itshak/ChessCoachPal/pull/5) implements an opt-in stateless HTTP MCP endpoint, OAuth 2 authorization-code/PKCE with dynamically registered client redirect allowlists, teacher-scoped encrypted sessions, hashed short-lived bearer and rotating refresh tokens, consent, revocation UI, and generated tool/OpenAPI discovery.

Exposed safe subset: teacher-owned workplace/student/group/session lookup, frozen participant rosters, individual attendance preview/record, and shared lesson topic/note update. Mutations use expected revisions and transactional idempotency receipts. Bulk writes, destructive actions, resource links, student/group CRUD, and scheduling/rescheduling through MCP are **not yet supported**; the website remains independently operable.

**Passing automated evidence for application code commit [8ecc83d](https://github.com/itshak/ChessCoachPal/commit/8ecc83de1c56ad288381fd49e78a04eaa1ee3c93):** [CI run 42410931916](https://github.com/itshak/ChessCoachPal/actions/runs/42410931916) passed typecheck, unit tests, release helpers, Docker build and Compose; [E2E run 42410931858](https://github.com/itshak/ChessCoachPal/actions/runs/42410931858) passed a fresh synthetic Supabase startup/reset, production build and **26 Playwright browser tests, 5 skipped, 0 failed**. The new synthetic round trip covers registration, browser OAuth PKCE consent, token exchange/replay denial, MCP discovery, teacher session authorization, attendance/note writes, idempotent retry and stale revision rejection, website data parity, and immediate grant revocation.

**Additional security-test evidence on [28786fd](https://github.com/itshak/ChessCoachPal/commit/28786fdfc809b4f05cabac4d07967c85a0a76aaa):** [CI 42411589348](https://github.com/itshak/ChessCoachPal/actions/runs/42411589348) and [E2E 42411589288](https://github.com/itshak/ChessCoachPal/actions/runs/42411589288) passed (26 browser tests, 5 skipped, 0 failed). The synthetic MCP suite now also checks denial of another teacher's session, stable-ID resolution for duplicate student names, access-token expiration, refresh-token rotation/replay denial, and immediate revocation after refresh.

**Archive decision:** [PR #5](https://github.com/itshak/ChessCoachPal/pull/5) merged as [77b307f](https://github.com/itshak/ChessCoachPal/commit/77b307fb6055fd55fd0d74519ff6e04ccea61ffe); post-merge [CI 42412035420](https://github.com/itshak/ChessCoachPal/actions/runs/42412035420) and [E2E 42412035415](https://github.com/itshak/ChessCoachPal/actions/runs/42412035415) passed (26 passed, 5 skipped, 0 failed). The **implemented safe subset** is now archived as an automated-verified foundation. The original broad create/edit/scheduling/resource scope is **not implemented** and is transferred to [2b](../openspec/changes/expand-agent-coaching-tools/proposal.md), while comprehensive security tests remain with 2b and Milestone 4. No real ChatGPT/Claude account has been connected; vendor interoperability is **unverified** and explicitly deferred to the **last local manual sign-off directly before v0.1.0 publication** in [LOCAL_CLIENT_ACCEPTANCE.md](LOCAL_CLIENT_ACCEPTANCE.md). No development milestone needs a live client. GitHub Actions must verify everything else. Keep version 0.0.0 until publication approval.

Full configuration guidance and unsupported features: [AI_CONNECTORS.md](AI_CONNECTORS.md). All tests use synthetic data; do not reset production databases.

## Other accepted foundation

- CogNote-derived upstream source foundation, MIT attribution retained (upstream author Andres Jaime Morales; pinned SHA fff723ea0374df8f07a20e90e44c725499ec680a). Full file/asset license audit is **not** signed off.
- Initial ChessCoachPal identity and partial brand adaptation.
- ADR-0001, main commit d325ae330acfac9172b1d76540c17839362738ac: **no CogNote compatibility** and no backward compatibility across pre-1.0 ChessCoachPal versions. Only fresh-install schema modifications are supported.
- Version/release automation, CHANGELOG.md and documentation at main commit 8638077ea58fee5638779f0dbf3c9d95673fb9d5; unreleased version 0.0.0, no version tag published. First main CI evidence: [42394424081](https://github.com/itshak/ChessCoachPal/actions/runs/42394424081).

## Remaining release and safety blockers

The GitHub repository is **already public**. Historical secrets/privacy scanning, inherited Git refs/artifacts review, upstream/third-party asset licensing and music-only code removal remain **unverified**. Do not assert public history was purged, that production student data was safe, or that the full inherited application has passed a security audit.

Milestone 1's **coaching-domain** cross-teacher RLS isolation was positively tested with synthetic identities; this does **not** certify all inherited API routes. No real external students were imported in the recorded work. Neither real ChatGPT/Claude client interoperability, production deployment, full backup/restore nor a complete privacy audit has been verified. The inherited CogNote migration chain still requires clean pre-1.0 consolidation in Milestone 4.

Keep real data isolated from test resets. Never automatically reset real databases. Active proposals are 2b (tool expansion), 3 (chess learning), 4 (legacy/security) and 5 (release). Archive each development change based on GitHub Actions automated evidence only; the *only* required manual live client test belongs to the final v0.1.0 local prepublication release sign-off. Keep version **0.0.0** until all development gates and final local sign-off pass.
