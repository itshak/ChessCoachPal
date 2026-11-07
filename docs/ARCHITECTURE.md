# Architecture

AI-connected tools and the web interface share authenticated domain commands. The initial backend remains CogNote's Postgres/Supabase with RLS. Teacher-owned workplaces, groups, students, sessions, per-student attendance and separate teacher compensation are the target model. The website offers all core operations without an AI service.


## Pre-1.0 compatibility policy

[ADR-0001](adr/0001-pre1-breaking-changes.md) is binding. CogNote is reusable source, **not** a product, data-model or upgrade compatibility target. No ChessCoachPal version below 1.0.0 must stay compatible with another. New features edit canonical schema and contracts in place; developers initialize fresh data or explicitly reset disposable development instances. No backfills, dual reads or support for legacy routes solely for compatibility.

## Current first slice

`/coaching` and `/api/agent/v1` call the same teacher-authenticated domain commands in `lib/server/coach-service.ts`. The current fresh-schema snapshot defines `workplaces`, `class_groups`, `group_enrollments`, `teaching_sessions`, `session_participants` and `session_attendance`. A snapshot trigger freezes participant membership on session insertion. PostgreSQL constraints and RLS block cross-teacher relationships and enforce that attendance is recorded only for session participants. This is a prototype API, **not an OAuth/MCP-ready integration**.
