# ChessCoachPal

**Your friendly chess-coaching assistant.**

ChessCoachPal is an **MIT-licensed, self-hostable, AI-agent-first workspace for chess teachers**. Use ChatGPT or Claude to record and update teaching data through authenticated tools. Use the website to browse, verify, correct, edit, schedule and report on lessons. All core features must also work without an AI subscription.

The project is built from [CogNote](https://github.com/andresjmorales/cognote), the MIT-licensed teacher-management application created by Andres Jaime Morales. See [source attribution](docs/UPSTREAM.md).

## Purpose

- **Agent-first input:** attendance, lessons, notes, student and group records can be captured conversationally.
- **Teacher-controlled website:** full non-AI editing/review, accessible on desktop and mobile.
- **Workplaces:** schools, clubs, online classes and private practice with independent policies.
- **Group and private lessons:** per-student attendance, shared teaching notes, instructor time counted once per class.
- **Chess learning history:** ratings, teacher assessments, selected Lichess study links and resources.
- **Private and portable:** Docker self-hosting, PostgreSQL, backups, exports, strong permission boundaries.

## Status

**Migration in progress.** CogNote is the pinned foundation; ChessCoachPal agent tools, multiple workplaces and group lessons must be implemented and verified. Imported upstream features are not automatically ChessCoachPal features. See [status](docs/STATUS.md).

## Documentation

- [Detailed OpenSpec change](openspec/changes/adopt-cognote-chesscoachpal/proposal.md)
- [Design](openspec/changes/adopt-cognote-chesscoachpal/design.md)
- [Tasks](openspec/changes/adopt-cognote-chesscoachpal/tasks.md)
- [Agent interface](docs/AI_AGENTS.md)
- [Public market landscape](docs/MARKET_RESEARCH.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Branding](docs/BRANDING.md)
- [Security](docs/SECURITY.md)
- [MIT attribution](docs/UPSTREAM.md)

## License

MIT, including CogNote's original attribution. See [LICENSE](LICENSE). ChessCoachPal is independent of the original CogNote project.
