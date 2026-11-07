# ChessCoachPal

**Your friendly chess-coaching assistant.**

ChessCoachPal is an **MIT-licensed, self-hostable, AI-agent-first workspace for chess teachers**. The intended primary input is authenticated ChatGPT/Claude tools, with a website for browsing, correcting, editing, scheduling and reporting. **The initial MCP/OAuth gateway is implemented and automatically verified**; real ChatGPT/Claude client interoperability is reserved for the final local prepublication v0.1.0 smoke test and has not yet been demonstrated. All core website features work without an AI subscription.

The project is built from [CogNote](https://github.com/andresjmorales/cognote), the MIT-licensed teacher-management application created by Andres Jaime Morales. See [source attribution](docs/UPSTREAM.md).

## Purpose

- **Agent-first input:** attendance, lessons, notes, student and group records can be captured conversationally.
- **Teacher-controlled website:** full non-AI editing/review, accessible on desktop and mobile.
- **Workplaces:** schools, clubs, online classes and private practice with independent policies.
- **Group and private lessons:** per-student attendance, shared teaching notes, instructor time counted once per class.
- **Chess learning history:** ratings, teacher assessments, selected Lichess study links and resources.
- **Private and portable:** Docker self-hosting, PostgreSQL, backups, exports, strong permission boundaries.

## Status

**Pre-release development (0.0.0).** The original CogNote-derived foundation and release automation are on main, Milestone 1 coaching workflows have merged. Milestone 2's initial MCP/OAuth gateway is merged and archived after GitHub CI/E2E verification. Remaining coaching-tool actions (change 2b), security and chess-learning milestones will be implemented and tested on GitHub. Only the *final live ChatGPT/Claude client demonstrations* take place manually on the maintainer's machine immediately before actual v0.1.0 publication; no development change depends on live providers. See [current status](docs/STATUS.md) and the [v0.1.0 OpenSpec roadmap](openspec/ROADMAP-v0.1.0.md).

## Versions and releases

The source tree is currently an **unreleased `0.0.0` development snapshot**, not an installed `v0.1.0` release. Once the first functional application passes the [v0.1.0 checklist](docs/RELEASING.md#v010-first-functional-release-gate) **and all five OpenSpec milestone gates**, it will become **`v0.1.0`**.

Every subsequent version is published automatically from `main` as a [GitHub Release](https://github.com/itshak/ChessCoachPal/releases), with notes from [CHANGELOG.md](CHANGELOG.md), an immutable `vX.Y.Z` source tag, and the corresponding ZIP and tar.gz source archives. [Release procedure](docs/RELEASING.md).

**No backward compatibility with CogNote or between ChessCoachPal versions before 1.0.0** is promised; the [accepted ADR](docs/adr/0001-pre1-breaking-changes.md) takes precedence.

## Documentation

- **[v0.1.0 OpenSpec roadmap](openspec/ROADMAP-v0.1.0.md)** — five milestone outcomes with an active 2b follow-on; completed development changes close on GitHub evidence
- [Complete coaching workflows](openspec/changes/archive/2026-11-07-complete-coaching-workflows/proposal.md)
- [Archived MCP/OAuth foundation for ChatGPT and Claude](openspec/changes/archive/2026-11-07-connect-chatgpt-and-claude/proposal.md)
- [Remaining v0.1.0 agent tools (active GitHub-only work)](openspec/changes/expand-agent-coaching-tools/proposal.md)
- [Add chess learning basics](openspec/changes/add-chess-learning-basics/proposal.md)
- [Remove CogNote legacy and secure data](openspec/changes/remove-cognote-legacy-and-secure-data/proposal.md)
- [Verify self-hosting and release v0.1.0](openspec/changes/verify-self-hosting-and-release-v0-1-0/proposal.md)
- [Archived, incomplete original plan](openspec/changes/archive/2026-11-07-adopt-cognote-chesscoachpal/proposal.md)
- [Agent interface](docs/AI_AGENTS.md)
- [Remote ChatGPT / Claude connection guide (not yet live-verified)](docs/AI_CONNECTORS.md)
- [Final local client smoke test before publishing v0.1.0](docs/LOCAL_CLIENT_ACCEPTANCE.md)
- [Public market landscape](docs/MARKET_RESEARCH.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Branding](docs/BRANDING.md)
- [Security](docs/SECURITY.md)
- [MIT attribution](docs/UPSTREAM.md)

## License

MIT, including CogNote's original attribution. See [LICENSE](LICENSE). ChessCoachPal is independent of the original CogNote project.
