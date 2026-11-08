# Chess learning basics (Milestone 3)

ChessCoachPal supports **teacher-owned** chess skill categories, observation history and saved external learning references without requiring a Lichess account or an engine.

## What is implemented

- Every new teacher receives six editable categories: Tactics, Calculation, Endgames, Strategy, Opening principles and Time management. Teachers can create, rename, describe and reorder categories through authenticated domain actions.
- A chess observation belongs to exactly one student and optionally a coaching session whose frozen roster includes that student. It records its skill, text, observed timestamp, author/source and verification state.
- Website-authored observations are teacher verified. Delegated MCP agents may **only propose** unverified observations, preserving their source; the website offers a separate explicit **Approve suggestion** action. Correcting text never silently approves an AI proposal.
- Teachers may save selected Lichess Study URLs and general HTTPS links to a student or lesson, and edit them later. Lichess study and optional chapter IDs are retained when present. Only URLs and teacher-entered labels are stored; no studies are copied, fetched or synchronized.
- The website offers the **Chess learning** page and embeds a learning panel in **Coaching** and student detail pages. Observations and links are loaded from the database after reload.

## Using the website

Choose a learner; optionally choose a coaching lesson containing that learner. Select an existing chess skill or add one, then record an observation. Suggested AI observations remain marked *Unverified* in the history until the teacher chooses **Approve suggestion**. Use **Edit observation** to correct text without changing provenance.

Save a study or other external link with an HTTPS URL and descriptive label, and choose a student or selected session as its target. A selected study link can be opened separately; external website failures never block viewing or editing stored records.

## Agent safety boundary

The delegated OAuth/MCP gateway exposes **read categories**, **read observations**, **propose observation**, **read resources**, and **link resource** tools. There is deliberately **no** MCP approval or edit-verified-observation operation. The website's authenticated Supabase session API owns review/correction. Agents must use stable student/category/session IDs and ask the teacher to resolve ambiguity.

Foreign records and invalid student/session associations are rejected through both service checks and composite database foreign keys. RLS isolates teacher-owned records and no anon/student-token privileges are granted.

## Validation and deferred features

The GitHub test suite uses synthetic teachers, studies, OAuth clients and a fresh Supabase database. No live provider accounts or network fetches are part of Milestone 3 acceptance. Real ChatGPT/Claude client demonstration is deferred exclusively to final local pre-publication v0.1.0 sign-off.

**Not included:** Lichess or Chess.com rating sync, PGN/engine analysis, embedded boards, auto-generated lessons, content mirroring, billing or report adapters. These require later scoped changes.

Pre-1.0 schema is fresh-install only; no CogNote compatibility or historical migration/backfill per ADR-0001.


## Proposed next phase — full chess materials and student progress (NOT implemented)

The separate [OpenSpec change](../openspec/changes/support-conversational-lesson-and-lichess-workflows/proposal.md) and [MCP workflow roadmap](MCP_WORKFLOW_ROADMAP.md) propose a website Materials → Lichess connection and study/chapter browser, per-student/workplace selected studies, server-authorized provider PGN lookup, image/FEN review, chapter publishing with capacity rollover, and richer student chess profiles (canonical Hebrew names, English aliases, 1–10 teacher strength, Lichess/Chess.com accounts and dated provider/time-control ratings). This is **planning, not current functionality**. Existing `skill_assessments` rates individual dimensions 1–5 and stays distinct from proposed overall strength 1–10. The public ChatGPT Plugin Directory is deferred until a reliable multi-teacher SaaS is available, tentatively v1.0.0 or a separately approved hosted beta.
