# ChessCoachPal

**Your friendly chess-coaching assistant.**

ChessCoachPal is a **proprietary, publicly viewable, MCP/Plugin-first workspace for chess teachers**, with an optional website for viewing, editing and high-risk approval. The intended primary input is authenticated ChatGPT/Claude tools, with a website for browsing, correcting, editing, scheduling and reporting. **The initial MCP/OAuth gateway is implemented and automatically verified**; real ChatGPT/Claude client interoperability is reserved for the final local prepublication v0.1.0 smoke test and has not yet been demonstrated. All core website features work without an AI subscription.

The project is built from [CogNote](https://github.com/andresjmorales/cognote), the MIT-licensed teacher-management application created by Andres Jaime Morales. Its original MIT notice is preserved; see [source attribution](docs/UPSTREAM.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

## Purpose

- **Agent-first input:** attendance, lessons, notes, student and group records can be captured conversationally.
- **Teacher-controlled website:** full non-AI editing/review, accessible on desktop and mobile.
- **Workplaces:** schools, clubs, online classes and private practice with independent policies.
- **Group and private lessons:** per-student attendance, shared teaching notes, instructor time counted once per class.
- **Chess learning history:** verified teacher observations, reviewable AI suggestions, selected Lichess Study and HTTPS learning links (rating synchronization is deferred).
- **Private and portable:** Docker deployment for authorized operators, PostgreSQL, guarded backup/restore, deterministic workplace reports and exports, strong permission boundaries.

## Status

**Pre-release development (0.0.0).** The original CogNote-derived foundation and release automation are on main, Milestone 1 coaching workflows have merged. Milestone 2's initial MCP/OAuth gateway is merged and archived after GitHub CI/E2E verification. Milestone 3 chess-learning basics are also merged and archived with passing GitHub CI/E2E. Milestone 4 security hardening and Milestone 5 automated self-hosting/report/recovery implementation have merged and been archived on GitHub test evidence. The expanded coaching-tool change (2b) is archived; the final publication privacy/history/license and real ChatGPT/Claude acceptance gates remain blocked. A real Codex + Vercel/Supabase demo successfully created a synthetic student and workplace enrollment, but no v0.1.0 release has been approved. New end-to-end chess trainer workflows and richer student profiles are separately proposed, not yet implemented. Only the *final live ChatGPT/Claude client demonstrations* take place manually on the maintainer's machine immediately before actual v0.1.0 publication; no development change depends on live providers. See [current status](docs/STATUS.md) and the [v0.1.0 OpenSpec roadmap](openspec/ROADMAP-v0.1.0.md).

## Versions and releases

The source tree is currently an **unreleased `0.0.0` development snapshot**, not an installed `v0.1.0` release. Once the first functional application passes the [v0.1.0 checklist](docs/RELEASING.md#v010-first-functional-release-gate) **and all five OpenSpec milestone gates**, it will become **`v0.1.0`**.

Every subsequent version is published automatically from `main` as a [GitHub Release](https://github.com/itshak/ChessCoachPal/releases), with notes from [CHANGELOG.md](CHANGELOG.md), an immutable `vX.Y.Z` source tag, and the corresponding ZIP and tar.gz source archives. [Release procedure](docs/RELEASING.md).

**No backward compatibility with CogNote or between ChessCoachPal versions before 1.0.0** is promised; the [accepted ADR](docs/adr/0001-pre1-breaking-changes.md) takes precedence.

## Documentation

- **[v0.1.0 OpenSpec roadmap](openspec/ROADMAP-v0.1.0.md)** — archived implementation milestones; separate active publication and new proposed chess-trainer workflow development
- [Complete coaching workflows](openspec/changes/archive/2026-11-07-complete-coaching-workflows/proposal.md)
- [Archived MCP/OAuth foundation for ChatGPT and Claude](openspec/changes/archive/2026-11-07-connect-chatgpt-and-claude/proposal.md)
- [Archived expanded MCP coaching tools (verified development 2b)](openspec/changes/archive/2026-11-08-expand-agent-coaching-tools/proposal.md)
- [Archived chess learning basics](openspec/changes/archive/2026-11-07-add-chess-learning-basics/proposal.md)
- [Archived Milestone 4 chess-only security implementation](openspec/changes/archive/2026-11-08-remove-cognote-legacy-and-secure-data/proposal.md)
- [Archived Milestone 5 verified self-hosting and recovery implementation](openspec/changes/archive/2026-11-08-verify-self-hosting-and-release-v0-1-0/proposal.md)
- [Active final v0.1.0 publication gates](openspec/changes/complete-v0-1-0-release-gates/proposal.md)
- [Proposed full natural-language lessons, bilingual student profiles and Lichess materials/puzzles](openspec/changes/support-conversational-lesson-and-lichess-workflows/proposal.md)
- [All current and proposed MCP commands](openspec/changes/support-conversational-lesson-and-lichess-workflows/tool-catalog.md)
- [MCP trainer workflow and student model roadmap](docs/MCP_WORKFLOW_ROADMAP.md)
- [Official ChatGPT plugin roadmap (target after public SaaS)](docs/PUBLIC_PLUGIN_SUBMISSION.md)
- [Archived, incomplete original plan](openspec/changes/archive/2026-11-07-adopt-cognote-chesscoachpal/proposal.md)
- [New-install self-hosting, protected backup and second-instance restore](docs/SELF_HOSTING.md)
- [Synthetic chess coach walkthrough](docs/CHESS_COACH_TUTORIAL.md)
- [Chess learning (observations, approval, Lichess study links)](docs/CHESS_LEARNING.md)
- [Agent interface](docs/AI_AGENTS.md)
- [Remote MCP/real Codex evidence; ChatGPT / Claude not yet live-verified](docs/AI_CONNECTORS.md)
- [Final local client smoke test before publishing v0.1.0](docs/LOCAL_CLIENT_ACCEPTANCE.md)
- [Public market landscape](docs/MARKET_RESEARCH.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Branding](docs/BRANDING.md)
- [Security](docs/SECURITY.md)
- [Proprietary licensing decision](docs/adr/0002-proprietary-licensing.md), [upstream attribution](docs/UPSTREAM.md), and [MIT/third-party notices](THIRD_PARTY_NOTICES.md)

## License

**Proprietary for original ChessCoachPal material going forward**, with MIT-licensed CogNote and previously licensed components retained under their respective terms. See [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [ADR-0002](docs/adr/0002-proprietary-licensing.md). Earlier MIT grants are not revoked. Public repository access does not authorize redistribution or hosted deployment of proprietary portions. ChessCoachPal is independent of the original CogNote project.


## Planned full chess-trainer experience — NOT implemented

A separate [OpenSpec proposal](openspec/changes/support-conversational-lesson-and-lichess-workflows/proposal.md) covers “Today I taught Armond, Shushana and David Zaruk 13:00–14:30; we studied Classic Games 2, chapter 32”: resolve Hebrew/English student aliases, use scheduled hours only when explicit hours are absent, create **one** historical multi-student lesson and verified per-student study links without inventing comprehension assessments. It also plans website Lichess Study selection and reviewed image→FEN→PGN puzzle publishing with safe chapter rollover. Student profiles will gain Hebrew report names, English aliases, teacher strength 1–10, Lichess/Chess.com accounts and separate provider/time-control rating snapshots. Public official ChatGPT Plugin Directory listing is tentatively deferred until a hosted multi-teacher SaaS is launched at/after v1.0.0; semantic version is not a technical gate and an earlier security-reviewed beta is possible. See [strategy](docs/PUBLIC_PLUGIN_SUBMISSION.md).


## MCP-first complete feature parity — REQUIRED, not achieved

All teacher-business website features and ordinary editable fields, including material history and **reports**, must be accessible through the existing authenticated **/mcp** connector. Changing a website form without providing the corresponding MCP operation/tests is incomplete. Sensitive actions require scoped approvals and may hand off to secure web consent, but cannot be silently omitted. The [93-scenario website/MCP checklist](docs/MCP_WEBSITE_PARITY_CHECKLIST.md) and [automated source inventory](scripts/mcp-website-parity.json) document today's 40 missing + 3 partial teacher-business API route parity gaps (of 43; 61 API routes/17 teacher pages/49 components). The normal CI inventory audit is green only when coverage claims match code; the release's **strict** parity command intentionally fails until the gaps and real website↔MCP behavioral tests are resolved. Existing live Codex student/workplace creation is a successful subset, not full parity.

## Database schema (prelaunch fresh installs)

ChessCoachPal uses **one current PostgreSQL installation snapshot**:
`supabase/migrations/20261107000000_chesscoachpal_baseline.sql`.
The project does not support previous database schemas, conversion scripts,
material-ID mapping bridges or a version-negotiated teacher backup format.
Start each disposable development database from a **fresh schema and seed**.
Do not run an upgrade chain. `npm run schema:canonical:guard` enforces this
rule automatically in CI. The additional `npm run schema:canonical:strict`
release check must stay blocked until every source and material-evidence
write references the single typed material catalog instead of a separate
resource model.

**Important:** A development reset is destructive. Do not reset any instance
that may contain actual teacher/student records unless its operator has
explicitly authorized deletion after reviewing and exporting the data.

The canonical catalog is `learning_materials` with typed game, puzzle,
drill, study-chapter and link records. The separate resource-link/teaching
evidence service is being consolidated to the same material IDs and is
not accepted as finished until the strict MCP parity campaign passes.
