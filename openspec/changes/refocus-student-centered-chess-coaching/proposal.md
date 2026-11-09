# Change: refocus-student-centered-chess-coaching

**Status: PROPOSED — specification only; NOT IMPLEMENTED.**
**Direction:** a student-first chess coach's teaching-memory and next-action assistant, not a family-first teaching-studio application.
**Delivery:** reviewable implementation slices. No database reset, provider write, release, or deployment is authorized by this proposal.

## Why

CogNote-origin assumptions still make families/guardians, studio and billing unusually prominent. Current adult student creation can synthesize a singleton "family" just to store contacts or issue a portal link. Chess coaches teach adults and minors at home, clubs, schools and online. The durable object should be the **student**, not the family. More importantly, teachers need continuity across diagnosis → plan → teach → assign → review.

ChessCoachPal already has students, workplaces, groups, sessions/attendance, teacher observations, chess resource URLs, basic assigned/taught/completed history, student aliases and preliminary strength fields. It has **two overlapping lesson data paths**, and lacks a complete homework/review/next-lesson workflow. Registered MCP tools do not imply parity is accepted: keep the existing strict gate.

## Proposed outcomes, ordered

1. **Student-first model and UX:** independent student profile; direct adult contact with no synthetic family; optional role-scoped contacts/guardians and separate billing responsibility. Keep youth privacy and guardian authorization. Replace top-level Families and Studio emphasis with Today, Students, Lessons, Training & Materials, Calendar and Reports; other administration stays accessible contextually.
2. **Single canonical lesson history:** reconcile `lesson_slots/lessons` with `teaching_sessions/session_participants/session_attendance`. Support group/private/ad-hoc roster capture, per-student attendance/notes, exact teacher minutes counted once per session, timezone correctness, safe historical correction, preview/commit and idempotency. Reuse the existing conversational-lesson OpenSpec rather than duplicating its implementation.
3. **One catalog, typed chess learning materials:** shared teacher-scoped `learning_materials` identity/search interface, plus dedicated `chess_games`, `chess_puzzles`, `chess_drills` and `chess_study_chapters` records. An `external_link` kind supports other material. A puzzle may reference its source game; a drill may contain puzzles. **Neither puzzles nor drills belong in a games table**. Reconcile existing URL and material progress history without retroactively declaring an untouched link "taught".
4. **Student training plans, assignments and review:** goals and training priorities; assignments referencing any material; attempts/completion evidence and coach reviews as distinct, source-tagged records. Completion NEVER implies mastery or an approved rating. Instructor-only manual workflows work without a student portal, engine, or external provider connection.
5. **Before-lesson briefing:** deterministic teacher-scoped view of recent lessons, actual taught materials, pending homework, progress goals, teacher-approved observations and unknowns. Optional AI prose must cite stored source IDs and never invent comprehension, ratings or mastery.

## Critical workflow

Teacher says: "Yesterday I taught Daniel and Yael together for 90 minutes. We studied the Lucena position in my Endgames Study. Daniel struggled; Yael understood. Assign Daniel the chapter and remind me to check it next lesson."

Expected: preview resolved identities and exact study chapter; confirm **one** 90-minute session with two frozen student participants; record separate teacher observations; link material as taught, create only Daniel's assignment, and surface it in the next-lesson briefing. Do not infer grades or change skill assessments automatically. All teacher-owned actions must work from authenticated MCP and optional website.

## In scope

Student/contact role model and age-neutral onboarding; navigation and coach-focused Today views; one lesson/session source of truth; basic typed material library with teacher-entered/validated PGN, FEN, drills and chapter references; links between materials; plans/goals; teacher-recorded homework/attempt/review; evidence-linked briefings; export/privacy; website/MCP feature equality and synthetic automated tests.

## Explicitly deferred

Built-in board/video, chess engine analysis, automatic puzzle grading, student-facing homework portal, remote Lichess Study writes/puzzle publishing, automatic rating sync, sophisticated academy/multi-coach permissions, official tax integrations and new billing/payment functionality. Existing optional billing, guardian, events and communication features are NOT silently deleted; their eventual retirement must be explicit and safe.

## Dependencies and authoritative changes

- [enforce-mcp-website-functional-parity](../enforce-mcp-website-functional-parity/proposal.md) remains the sole owner of the inherited route parity backlog and **all 93 existing browser↔MCP acceptance scenarios**. New ordinary teacher website fields/actions SHALL get MCP route/tool, shared domain service, registry update and authenticated parity tests in the SAME feature PR.
- [support-conversational-lesson-and-lichess-workflows](../support-conversational-lesson-and-lichess-workflows/proposal.md) owns the earlier alias-resolve/capture, exact chapter lookup, provider integration and rating design. Overlapping design must be reconciled before implementation, not implemented twice. Provider writes are not pulled into this initial core.
- [ADR-0001](../../../docs/adr/0001-pre1-breaking-changes.md) permits clean pre-1.0 schema replacement and rejects CogNote compatibility, but **no silent destructive reset of a possibly real-data installation**. Require operator-approved backup/export when relevant.
- [ADR-0003](../../../docs/adr/0003-mcp-website-business-parity.md) remains binding.
- [complete-v0-1-0-release-gates](../complete-v0-1-0-release-gates/proposal.md) remains blocked independently. This proposal does not redefine first-release requirements.

## Implementation slices

A. Student/contact redesign and navigation.
B. Canonical lessons, identity-safe capture and history.
C. Typed catalog and materials provenance.
D. Plans, homework, review and coach briefing.

Deliver as focused PRs, with same-PR MCP/website parity and tests. No in-scope task is accepted until automated synthetic GitHub verification is recorded on merged main. Live ChatGPT/Claude vendor-client testing remains a separate final local v0.1.0 prepublication gate. Do not mark this OpenSpec applied or archived merely because it was proposed.

## Acceptance

An adult can be created with contact information but no family record; a junior can have permissioned guardian access; siblings can share contact without sharing progress. One 90-minute three-person lesson counts 90 teacher minutes. Game/puzzle/drill/study chapter items have distinct payloads and common search/assignment linking. The teacher can assign a chapter, record an attempt, review it, and query pending homework without any implied mastery. A briefing is fact-based and explicit about unknowns. All actions are teacher-isolated, permissioned, idempotent where writes can retry, and consistent between MCP and website.
