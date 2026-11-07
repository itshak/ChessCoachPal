# ChessCoachPal

**Your friendly chess-coaching assistant.**

ChessCoachPal is an **MIT-licensed, self-hostable, AI-agent-first workspace for chess teachers**. The intended primary input is authenticated ChatGPT/Claude tools, with a website for browsing, correcting, editing, scheduling and reporting. **AI-client integration is not implemented yet**; all core website features are designed to work without an AI subscription.

The project is built from [CogNote](https://github.com/andresjmorales/cognote), the MIT-licensed teacher-management application created by Andres Jaime Morales. See [source attribution](docs/UPSTREAM.md).

## Purpose

- **Agent-first input:** attendance, lessons, notes, student and group records can be captured conversationally.
- **Teacher-controlled website:** full non-AI editing/review, accessible on desktop and mobile.
- **Workplaces:** schools, clubs, online classes and private practice with independent policies.
- **Group and private lessons:** per-student attendance, shared teaching notes, instructor time counted once per class.
- **Chess learning history:** ratings, teacher assessments, selected Lichess study links and resources.
- **Private and portable:** Docker self-hosting, PostgreSQL, backups, exports, strong permission boundaries.

## Status

**Pre-release development (0.0.0).** The original CogNote-derived foundation and release automation are on main, while the first chess-coaching service/UI is in an unmerged draft PR and real ChatGPT/Claude connectors are not yet implemented. Core functionality, security review and E2E acceptance remain incomplete. See [current status](docs/STATUS.md) and the [v0.1.0 OpenSpec roadmap](openspec/ROADMAP-v0.1.0.md).

## Versions and releases

The source tree is currently an **unreleased `0.0.0` development snapshot**, not an installed `v0.1.0` release. Once the first functional application passes the [v0.1.0 checklist](docs/RELEASING.md#v010-first-functional-release-gate) **and all five active OpenSpec change gates**, it will become **`v0.1.0`**.

Every subsequent version is published automatically from `main` as a [GitHub Release](https://github.com/itshak/ChessCoachPal/releases), with notes from [CHANGELOG.md](CHANGELOG.md), an immutable `vX.Y.Z` source tag, and the corresponding ZIP and tar.gz source archives. [Release procedure](docs/RELEASING.md).

**No backward compatibility with CogNote or between ChessCoachPal versions before 1.0.0** is promised; the [accepted ADR](docs/adr/0001-pre1-breaking-changes.md) takes precedence.

## Documentation

- **[v0.1.0 OpenSpec roadmap](openspec/ROADMAP-v0.1.0.md)** — five scoped, evidence-based implementation changes
- [Complete coaching workflows](openspec/changes/complete-coaching-workflows/proposal.md)
- [Connect ChatGPT and Claude](openspec/changes/connect-chatgpt-and-claude/proposal.md)
- [Add chess learning basics](openspec/changes/add-chess-learning-basics/proposal.md)
- [Remove CogNote legacy and secure data](openspec/changes/remove-cognote-legacy-and-secure-data/proposal.md)
- [Verify self-hosting and release v0.1.0](openspec/changes/verify-self-hosting-and-release-v0-1-0/proposal.md)
- [Archived, incomplete original plan](openspec/changes/archive/2026-11-07-adopt-cognote-chesscoachpal/proposal.md)
- [Agent interface](docs/AI_AGENTS.md)
- [Public market landscape](docs/MARKET_RESEARCH.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Branding](docs/BRANDING.md)
- [Security](docs/SECURITY.md)
- [MIT attribution](docs/UPSTREAM.md)

## License

MIT, including CogNote's original attribution. See [LICENSE](LICENSE). ChessCoachPal is independent of the original CogNote project.
