# Existing chess-coaching and tutoring management solutions

Research checked **2026-11-06**. This document compares public solutions and informs the capabilities of a free, self-hostable chess-coaching assistant. Prices/features may change and should be rechecked before citing.

| Solution | Public offering | Relevant capabilities | Differences from ChessCoachPal |
| --- | --- | --- | --- |
| [Chess Nexus](https://www.chessnexus.in/coaches) | Free forever for up to 30 students | Classes, attendance, fees, assignments, classroom and parent reports | ChessCoachPal prioritizes self-hosting, portability and ChatGPT/Claude data input |
| [Chess.Run](https://chess.run/tariffs) | Coach plans advertised at $15/$25/$40 monthly | Coach rosters, groups, materials, schedules and payment tracking | Independent teacher data ownership and cross-workplace agent workflows are our emphasis |
| [ChessCore](https://chesscore.io/pricing) | AI-assisted academy management; paid tiers from $69/month billed annually | Scheduling, attendance, parent portals, reports and AI copilot | Self-hostable open-source workflow and personal teacher focus |
| [ChessPlay](https://chessplay.io/pricing) | Chess academy administration | Group teaching and school operations | Dedicated agent-first input and portable teacher-owned records |
| [TutorBird](https://www.tutorbird.com/) | General tutor studio platform | Scheduling, billing and client management | Chess-specific metadata, multiple workplaces and open source |
| [My Music Staff](https://www.mymusicstaff.com/) | Music teacher studio platform | Scheduling, lesson notes, payments and families | Not chess-specific or a self-hosted open-source tool |

## Open-source reference projects

- [CogNote](https://github.com/andresjmorales/cognote), MIT: adopted foundation; strong recurring lessons, attendance, makeup policies, parent portal and tests; individual student-per-lesson assumptions need refactoring.
- [MyClass](https://github.com/t1112000/tutor-management-app), MIT: small Next.js/Postgres tutoring app, UI/calendar and reporting reference; limited groups and workplaces.
- [Dojo](https://github.com/DojoUK/Dojo), AGPL-3.0: design reference for organizations, group enrollment, permissions and per-student attendance. Do not copy AGPL implementation into MIT code.
- [Preceptly](https://github.com/andreaseirich/preceptly), Apache-2.0: reference for teacher-owned institutes, compensation tiers and travel-time conflict logic.

## Product gaps worth addressing

1. A single teacher-wide view across different teaching workplaces and compensation arrangements.
2. Conversational recording of attendance, notes, lessons and administrative changes with provenance and ambiguity resolution.
3. Non-AI website editing of the exact same canonical records.
4. Data portability, self-hosting and straightforward setup without arbitrary student-count limits.
5. Reliable group attendance, student identity deduplication and deterministic localized reporting.

## Source reliability

This is a **feature and positioning landscape**, not evidence of sales, customer counts or usage. Values are advertised website prices and service limits observed at the research date. Re-evaluate vendors periodically and avoid unsupported adoption claims.
