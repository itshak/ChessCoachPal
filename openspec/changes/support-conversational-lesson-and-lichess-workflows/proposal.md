# Change: support-conversational-lesson-and-lichess-workflows

**Status: PROPOSED, NOT IMPLEMENTED.** No MCP tool, schema or website workflow described below is considered available until applied, tested and merged to main.

## Purpose

Make ChessCoachPal genuinely agent-first for chess teachers. A teacher can tell ChatGPT, Codex or Claude what happened in a lesson, using short English or Hebrew student names, and have the correct historical lesson, roster, attendance, study/chapter and per-student materials recorded after a single review. The teacher can also submit a chess-position image to a capable client and publish a verified FEN position into the teacher's Lichess puzzle studies with controlled 64-chapter rollover.

**User story A:** “Today I taught Armond, Shushana and David Zaruk from 13:00–14:30. We saw the Steinitz–Chigorin game (in Classic Games 2, game 32).” Resolve exact students from aliases, one local calendar day, actual study and chapter; record **one 90-minute group-equivalent/ad hoc lesson** (three frozen roster entries, teacher minutes counted once), explicit attendance only, each student's material link, and unknown comprehension (not a guessed grade). If hours are absent, use **uniquely resolvable existing weekly student slots**, otherwise ask.

**User story B:** “Here's a chessboard image; add it to my Puzzles study.” A vision-capable chat client may propose the FEN, but the server checks piece legality and unknown state, shows an editable preview, asks approval, then imports a SetUp/FEN PGN as a Lichess Study chapter. If no puzzle study is configured or the current study is full (maximum 64 chapters), with approval and write permissions it creates a new private/unlisted study in a collision-safe numbered series, not duplicating chapters on retries.

**User story C:** The teacher's reports use each learner's full **Hebrew canonical name**, while “Armond” or “Shushana” in English resolves to the right learner. The student profile also tracks teacher-assessed overall strength (1–10), verified/declared Lichess and Chess.com usernames, per-time-control provider ratings and their history, individual chess skills, goals, and lesson progress without treating an inferred model assessment as factual.

## Observed implementation baseline (main 9b41276)

- Working hosted HTTPS MCP/OAuth via Vercel + isolated Supabase; real Codex student/workplace/enrollment writes were verified in SQL. Existing 28 MCP tools handle parts of teacher-owned work but **cannot list all students with an empty query, create an arbitrary three-person ad-hoc lesson, resolve remote study contents, edit weekly schedules through MCP, or write Lichess chapters**.
- Website/student APIs have `students.name`, `level`, birthdate, teacher notes, guardian, attendance, pricing; no search aliases, structured 1–10 overall strength, external chess accounts or rating history. `skill_assessments` already records per-dimension 1–5 ratings; `chess_observations` records approved vs unverified observations. Reuse these rather than flattening or duplicating them.
- Two scheduling paths exist: legacy `lesson_slots → lessons` and canonical MCP `teaching_sessions → session_participants/session_attendance`. Their reconciliation is required before recording combined lessons, to avoid duplicate teaching hours.
- Chess-learning currently saves sanitized Lichess study **URLs**, not remote PGN or chapter metadata. No current Lichess account connection or provider write exists.
- Current release remains `0.0.0`. The [active v0.1.0 publication gate](../complete-v0-1-0-release-gates/proposal.md) remains blocked. A public multitenant SaaS and official ChatGPT Plugin Directory listing are **separate later objectives**. This implementation change is scoped independently; whether all new features belong in v0.1.0 requires a revised release decision, not an implicit relaxation of the gate.

## Mandatory MCP-first feature parity, not merely a connector

**Release-blocking requirement:** All ordinary operations and business-data fields that the authenticated teacher can use on the website MUST be usable from the same `/mcp` endpoint, with authorization and equivalent results. We are **MCP / Plugin first**; the website is an optional visual editor/reviewer. Exposing one or two functions per webpage does not constitute parity. All new teacher-business web features MUST ship corresponding MCP tools or an explicitly reviewed secure approval handoff in the **same feature PR**.

An actual code audit ([93-case checklist](../../../docs/MCP_WEBSITE_PARITY_CHECKLIST.md), [61-route/17-page/49-component registry](../../../scripts/mcp-website-parity.json)) found **43 teacher-business API route surfaces: 40 missing complete MCP parity, 3 partial and none wholly verified**. The 28 live MCP tools are a functioning subset, not a complete teacher control plane. These numbers are *route-level static inventory*, not counts of working individual tool operations. `npm run mcp:parity:audit` is a source inventory check; `npm run mcp:parity:strict` must pass as an additional mandatory release gate after actual website↔MCP integration tests.

This includes renaming workplaces and students, editing/clearing ordinary student fields and names/aliases/level, schedule, notes, progress, events and groups; **complete materials learned by student or at workplace**; **the same workplace/date-range teaching-and-attendance reports available on the website**; and reviewable exports. Do not create a separate reports connector: add reporting functions to the **existing MCP gateway**, reusing `lib/coaching-report.ts` so website and chat cannot disagree. Sensitive finance, parent-contact and send operations require least-privilege consent and review; passwords, OAuth/client/processor secrets and parent-originated actions remain outside generic chat writes.

Implementation MUST maintain an allowlisted editable-field registry, `ccp_v1_capabilities_list` and `ccp_v1_fields_describe`, plus typed per-domain actions and bounded `ccp_v1_records_patch_preview/commit` for ordinary record changes. No free-form SQL, cross-tenant filters or arbitrary JSON column patching. **All 93 checklist scenarios remain unverified until suitable integration tests exist.**

## Deliverables

1. Complete safe versioned MCP command catalogue for students/profile/aliases/ratings, schedules, lessons and progress, and Lichess material/puzzle management, with explicit read/write tool scopes and preview-confirmation patterns.
2. Shared website + MCP teacher-scoped domain services and fresh canonical schema/RLS for aliases/profiles/provider accounts/rating snapshots, weekly slots, multi-person lesson capture, material preferences/links, Lichess tokens, and external-write intents.
3. Website Students UI (Hebrew primary name, English short name/aliases, strength, accounts and rating graphs); Materials → Lichess browser (connect, select preferred studies by teacher/workplace/student, chapter search and puzzle destination); lesson preview/corrections.
4. Direct Lichess integration for authorized study reading and controlled chapter/study creation; image clients produce structured FEN or use an editable website board fallback.
5. Synthetic GitHub unit, integration, fresh-Supabase browser E2E and provider-mock tests for all scenarios in [specs](specs/), safety, retries, unknown fields, offline operation and tenant isolation.

## Boundaries and non-goals

No unrestricted SQL, blind bulk writes, automatic strength inference, forced aliases by machine transliteration, exposure of children's contact information to MCP by default, upload of provider credentials in chat, external material redistribution, chess engine analysis, or automatic scheduled ratings fetch until supported/configured. No claim that all ChatGPT/Codex clients pass images as MCP attachments. No ChatGPT Plugin Directory publication or public SaaS launch within this proposal.

**Acceptance:** every task checked on **merged main** with exact SHA and passing GitHub Actions; generated MCP/OpenAPI matches the implemented contracts, and the real UI shares the persisted state. Do not archive as accepted until tested. See [design](design.md), [tool catalogue](tool-catalog.md), [tasks](tasks.md) and [workflows/status guide](../../../docs/MCP_WORKFLOW_ROADMAP.md).
