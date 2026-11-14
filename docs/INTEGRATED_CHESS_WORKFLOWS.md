# Integrated chess teaching workflows — implementation guide

**Development status:** Candidate implementation on PR #65. This is not a v0.1.0 release, a production-data migration, or certification by a live ChatGPT/Claude client. A native website and the delegated MCP gateway share each listed teacher-owned domain operation. Secrets remain server-only.

## 1. Conversational session preview and lesson timing

The **Coaching** page and `ccp_v1_lessons_capture_preview` resolve 2–50 exact active learner names/aliases and verify current workplace enrollment. The teacher can choose either an absolute start plus duration or a workplace-local calendar date; the latter requires exactly one common active weekly slot across **every** learner. No first-match fallback, inferred day, implicit school enrollment, guessed DST hour or automatic teacher time overlap. The returned review lists all stable student IDs, the start UTC instant, local timezone, time source and slot IDs. The existing confirmed ad-hoc transaction creates one frozen-roster session; attendance and comprehension remain unmarked.

A separate **teacher context** read (`GET /api/teacher/context`, `ccp_v1_teacher_context_get`) provides the server-derived teacher-local date and IANA timezone. Agents should call this rather than inventing the current local day.

## 2. Student chess platform ratings (manual or opt-in public lookup)

On the student detail page, **Rating observations** separates provider, time control, source, observation date, games, provisional marker and rating deviation. The teacher can record an append-only manual rating. With explicit consent, the app can query only a saved student **public username** against fixed official Lichess or Chess.com endpoints. It first returns a read-only review/digest; a separate confirmed action fetches again and writes immutable provider-specific snapshots. A changed digest or replay request is rejected. The public handle is not proof of account ownership.

Both surfaces expose `student_ratings_list`, `record`, `refresh_preview`, `refresh_commit` with the full `ccp_v1_` prefix. Browser API: `GET/POST /api/students/{id}/ratings`. None of these actions changes the existing teacher-assessed strength (1–10), the legacy human-entered rating fields, 1–5 skill assessments or inferred mastery. Never average Lichess and Chess.com ratings or mix rapid with blitz. Ratings are collected **only when explicitly requested**; minors' lawful consent/teacher authority remain the responsibility of the installation owner.

## 3. Exact Lichess study/chapter identification and teaching evidence

The existing Lichess teacher OAuth supports `study:read` and separately consented `study:write`. The **Training & materials** page now offers authorized metadata index, precise study/chapter search, a lesson-roster review and teacher-confirmed evidence commit. First sync an accessible **eight-character** study ID. The app fetches live authorized PGN only transiently, indexes strictly validated chapter IDs, ordinal, name, White/Black/Event/Date/ECO/Opening metadata, and **does not save private raw PGN or provider credentials**. The chapter is marked stale after 24h and may not be attached as newly verified teaching evidence until re-synced.

Search exact chapter number e.g. **32**, or player name **Steinitz**, against the teacher-owned index; select the real study ID and chapter ID, never a made-up label. A lesson preview resolves the existing canonical teaching occurrence and all frozen learner IDs, showing one instructor lesson and N student-coverage records. The SQL writer verifies teacher, fresh indexed chapter, revisioned roster hash, session status and idempotency receipt **within one transaction**. It links one typed chapter material to the existing session and appends one `assigned` or teacher-attested `taught` entry per learner. `taught` requires a completed lesson. Linking a chapter, including one taught, **never proves comprehension or mastery**.

Website: `GET/POST /api/lichess/chapter-index`, `POST /api/coaching/chapter-evidence`. MCP: `ccp_v1_materials_chapters_search/get/sync`, `ccp_v1_materials_link_preview/commit`. Per-student claims appear in existing material history and workplace summaries deduplicate by canonical session rather than multiplying 90 teacher minutes for three students.

## 4. Chessboard review and bounded private puzzle studies

The Training page has a FEN review panel using `POST /api/lichess/fen-validate` or `ccp_v1_chess_fen_validate`. It conservatively checks six fields, 64 board squares, both kings, piece/pawn limits, adjacent kings, castling rights, en-passant consistency and the side that last moved being in illegal check. A photo alone cannot reveal turn, castling, en-passant or move counters; all image-derived values remain proposals requiring explicit human review. Static validation **does not certify the legality of the SAN move sequence**.

The **Puzzles series** panel and `ccp_v1_puzzles_study_series_list/capacity/create/reconcile` show live capacity for an owned Lichess study, accounting for its starter chapter, with an enforced 64-chapter cap. A full destination requires separate consent to create the next private **Puzzles N** study, with an atomic local suffix reservation and a 30/day local budget. The app writes a request receipt *before* the remote POST and never automatically repeats a possibly successful provider write after timeout or 429. A later reconciliation inspects existing provider studies and original request ID. It never deletes unrelated chapters or claims a remote write succeeded without a real provider confirmation.

Browser: `GET/POST /api/lichess/puzzle-series`. Existing puzzle publish path now checks live capacity before reserving a new import intent. The connected Lichess write scope is required. A real Lichess study creation/reconciliation is an external action and cannot be rolled back with the local SQL transaction.

## Safety, testing and remaining work

Automated acceptance uses synthetic students, local Supabase, actual browser auth and delegated OAuth/MCP calls, mock public rating and Lichess study endpoints, SQL security boundaries, idempotent retries and negative scenarios. There are no real children, provider tokens or external data in fixtures.

**Not complete in this batch:** teacher/workplace/student-scoped persistent *study preference precedence*, comprehensive SAN move-engine validation, reliable provider-rate budget across a distributed fleet, comprehensive historical corrections for every material state, Lichess connectivity from actual user accounts, and full live ChatGPT/Claude UI-client testing. These remain in the active parent OpenSpec and release gates; do not mark the parent archived simply because several useful integrated slices are implemented.
