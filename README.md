# ChessCoachPal

**Your friendly chess-coaching assistant.**

ChessCoachPal is an **MIT-licensed, self-hostable, AI-agent-first workspace for chess teachers**. The intended primary input is authenticated ChatGPT/Claude tools, with a website for browsing, correcting, editing, scheduling and reporting. **The initial MCP/OAuth gateway is implemented and automatically verified**; real ChatGPT/Claude client interoperability is reserved for the final local prepublication v0.1.0 smoke test and has not yet been demonstrated. All core website features work without an AI subscription.

The project is built from [CogNote](https://github.com/andresjmorales/cognote), the MIT-licensed teacher-management application created by Andres Jaime Morales. See [source attribution](docs/UPSTREAM.md).

## Purpose

- **Agent-first input:** attendance, lessons, notes, student and group records can be captured conversationally.
- **Teacher-controlled website:** full non-AI editing/review, accessible on desktop and mobile.
- **Workplaces:** schools, clubs, online classes and private practice with independent policies.
- **Group and private lessons:** per-student attendance, shared teaching notes, instructor time counted once per class.
- **Chess learning history:** verified teacher observations, reviewable AI suggestions, selected Lichess Study and HTTPS learning links (rating synchronization is deferred).
- **Private and portable:** Docker self-hosting, PostgreSQL, guarded backup/restore, deterministic workplace reports and exports, strong permission boundaries.

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
- [MIT attribution](docs/UPSTREAM.md)

## License

MIT, including CogNote's original attribution. See [LICENSE](LICENSE). ChessCoachPal is independent of the original CogNote project.


## Planned full chess-trainer experience — NOT implemented

A separate [OpenSpec proposal](openspec/changes/support-conversational-lesson-and-lichess-workflows/proposal.md) covers “Today I taught Armond, Shushana and David Zaruk 13:00–14:30; we studied Classic Games 2, chapter 32”: resolve Hebrew/English student aliases, use scheduled hours only when explicit hours are absent, create **one** historical multi-student lesson and verified per-student study links without inventing comprehension assessments. It also plans website Lichess Study selection and reviewed image→FEN→PGN puzzle publishing with safe chapter rollover. Student profiles will gain Hebrew report names, English aliases, teacher strength 1–10, Lichess/Chess.com accounts and separate provider/time-control rating snapshots. Public official ChatGPT Plugin Directory listing is tentatively deferred until a hosted multi-teacher SaaS is launched at/after v1.0.0; semantic version is not a technical gate and an earlier security-reviewed beta is possible. See [strategy](docs/PUBLIC_PLUGIN_SUBMISSION.md).
