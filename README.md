# ChessCoachPal

**MCP tool naming:** The single HTTPS `/mcp` connector exposes `ccp_<domain>_<action>` tools (no `ccp_v1_*` compatibility aliases before 1.0.0). After a release adds tools, refresh the tool catalogue or start a new client conversation; disconnect/reconnect only if the client still caches an outdated catalogue. See [client instructions](docs/AI_CONNECTORS.md).

**Release status:** Private beta on the existing OVH/Coolify server. Use [GitHub Releases](https://github.com/itshak/ChessCoachPal/releases) for the published version and deployable source; the [release procedure](docs/RELEASING.md) describes the approved tagged-only deployment. Automated tests are extensive, but the real-client ChatGPT/Claude beta exercises and remaining operational/privacy sign-offs must be evaluated separately.

**Your friendly chess-coaching assistant.**

ChessCoachPal is a **proprietary, publicly viewable, MCP/Plugin-first workspace for chess teachers**, with an optional website for viewing, editing and high-risk approval. The intended primary input is authenticated ChatGPT/Claude tools, with a website for browsing, correcting, editing, scheduling and reporting. **The MCP/OAuth gateway is implemented and automatically verified**; Claude Desktop has now also completed a real-client synthetic material workflow, while full ChatGPT and remaining vendor-client acceptance are not yet established. All core website features work without an AI subscription.

The project is built from [CogNote](https://github.com/andresjmorales/cognote), the MIT-licensed teacher-management application created by Andres Jaime Morales. Its original MIT notice is preserved; see [source attribution](docs/UPSTREAM.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

## Purpose

- **Agent-first input:** attendance, lessons, notes, student and group records can be captured conversationally.
- **Teacher-controlled website:** full non-AI editing/review, accessible on desktop and mobile.
- **Workplaces:** schools, clubs, online classes and private practice with independent policies.
- **Group and private lessons:** per-student attendance, shared teaching notes, instructor time counted once per class.
- **Chess learning history:** verified teacher observations, reviewable AI suggestions, selected Lichess Study and HTTPS learning links (rating synchronization is deferred).
- **Private and portable:** Docker deployment for authorized operators, PostgreSQL, guarded backup/restore, deterministic workplace reports and exports, strong permission boundaries.

## Status

ChessCoachPal is in its **pre-1.0 private beta**. Core coaching, historical archiving, billing and learning-history workflows are available through the website and a large authenticated MCP tool catalogue. Real clients can cache obsolete tool descriptions; check the deployed release, refresh tool discovery and verify every critical write by independent read-back. Product-market readiness and real-provider certification are not implied by green synthetic tests. See [current development status](docs/STATUS.md) and [private-beta release policy](docs/RELEASING.md).

## Versions and releases

Published versions follow Semantic Versioning, with private-beta features and no promised API or database compatibility before 1.0.0. The release archive and current published version are listed under [GitHub Releases](https://github.com/itshak/ChessCoachPal/releases).

Every subsequent version is published automatically from `main` as a [GitHub Release](https://github.com/itshak/ChessCoachPal/releases), with notes from [CHANGELOG.md](CHANGELOG.md), an immutable `vX.Y.Z` source tag, and the corresponding ZIP and tar.gz source archives. [Release procedure](docs/RELEASING.md).

**No backward compatibility with CogNote or between ChessCoachPal versions before 1.0.0** is promised; the [accepted ADR](docs/adr/0001-pre1-breaking-changes.md) takes precedence.

## Documentation

- [Hosting architecture and Coolify deployment plan](docs/HOSTING_ARCHITECTURE.md) — trimmed self-hosted Supabase target, capacity and recovery gates
- [ADR-0008: Retain trimmed self-hosted Supabase](docs/adr/0008-self-hosted-supabase-on-coolify.md) — hosting choice and alternatives

- **[v0.1.0 OpenSpec roadmap](openspec/ROADMAP-v0.1.0.md)** — archived implementation milestones; separate active publication and new proposed chess-trainer workflow development
- [Complete coaching workflows](openspec/changes/archive/2026-11-07-complete-coaching-workflows/proposal.md)
- [Archived MCP/OAuth foundation for ChatGPT and Claude](openspec/changes/archive/2026-11-07-connect-chatgpt-and-claude/proposal.md)
- [Archived expanded MCP coaching tools (verified development 2b)](openspec/changes/archive/2026-11-08-expand-agent-coaching-tools/proposal.md)
- [Archived chess learning basics](openspec/changes/archive/2026-11-07-add-chess-learning-basics/proposal.md)
- [Archived Milestone 4 chess-only security implementation](openspec/changes/archive/2026-11-08-remove-cognote-legacy-and-secure-data/proposal.md)
- [Archived Milestone 5 verified self-hosting and recovery implementation](openspec/changes/archive/2026-11-08-verify-self-hosting-and-release-v0-1-0/proposal.md)
- [Active final v0.1.0 publication gates](openspec/changes/archive/2026-11-15-complete-v0-1-0-release-gates/proposal.md)
- [Proposed full natural-language lessons, bilingual student profiles and Lichess materials/puzzles](openspec/changes/archive/2026-11-15-support-conversational-lesson-and-lichess-workflows/proposal.md)
- [All current and proposed MCP commands](openspec/changes/archive/2026-11-15-support-conversational-lesson-and-lichess-workflows/tool-catalog.md)
- [MCP trainer workflow and student model roadmap](docs/MCP_WORKFLOW_ROADMAP.md)
- [Official ChatGPT plugin roadmap (target after public SaaS)](docs/PUBLIC_PLUGIN_SUBMISSION.md)
- [Archived, incomplete original plan](openspec/changes/archive/2026-11-07-adopt-cognote-chesscoachpal/proposal.md)
- [New-install self-hosting, protected backup and second-instance restore](docs/SELF_HOSTING.md)
- [Synthetic chess coach walkthrough](docs/CHESS_COACH_TUTORIAL.md)
- [Chess learning (observations, approval, Lichess study links)](docs/CHESS_LEARNING.md)
- [Agent interface](docs/AI_AGENTS.md)
- **[Agent/Supabase reliability playbook](docs/MCP_SUPABASE_RELIABILITY_PLAYBOOK.md)** — field propagation, deferred client tool discovery, safe schema resets, RLS/advisor hardening and portable tests
- **[ADR-0007: MCP discovery and canonical Supabase contracts](docs/adr/0007-mcp-supabase-contract-and-release-evidence.md)** — binding future-agent quality gates
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

A separate [OpenSpec proposal](openspec/changes/archive/2026-11-15-support-conversational-lesson-and-lichess-workflows/proposal.md) covers “Today I taught Armond, Shushana and David Zaruk 13:00–14:30; we studied Classic Games 2, chapter 32”: resolve Hebrew/English student aliases, use scheduled hours only when explicit hours are absent, create **one** historical multi-student lesson and verified per-student study links without inventing comprehension assessments. It also plans website Lichess Study selection and reviewed image→FEN→PGN puzzle publishing with safe chapter rollover. Student profiles will gain Hebrew report names, English aliases, teacher strength 1–10, Lichess/Chess.com accounts and separate provider/time-control rating snapshots. Public official ChatGPT Plugin Directory listing is tentatively deferred until a hosted multi-teacher SaaS is launched at/after v1.0.0; semantic version is not a technical gate and an earlier security-reviewed beta is possible. See [strategy](docs/PUBLIC_PLUGIN_SUBMISSION.md).


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
