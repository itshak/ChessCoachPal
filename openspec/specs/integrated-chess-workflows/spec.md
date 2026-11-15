# Applied design candidate — integrated chess workflows

**Current state:** implementation proposal undergoing exact-source tests; this file documents invariants for PR #65. It is only accepted once merged-main strict MCP parity, authenticated browser/MCP E2E, schema/RLS, security, self-host Compose and backup/restore are green. This is an extension of the active `support-conversational-lesson-and-lichess-workflows` change, not full archive of it.

## Independent source-tagged ratings

An opt-in public username lookup SHALL use a fixed provider-origin route, not teacher-supplied URLs, and SHALL return source, provider, time control, provenance, provisional marker, games and observation/fetch time. Manual/provider snapshots SHALL be append-only, tenant-keyed and reject changed replay requests. No platform rating SHALL automatically update teacher 1–10 strength, 1–5 skills or suggest account ownership.

## Exact authorized Lichess chapter index

A teacher's existing server-held `study:read` grant SHALL be required for synchronization. It SHALL parse authentic PGN chapter IDs, 1-based ordinals, White/Black/Event/Date/Opening/ECO/FEN metadata without persistently storing private PGN text. A missing chapter ID, incomplete study, or duplicate ordinal SHALL cause the entire sync transaction to fail; old data SHALL remain. Cached metadata shall show source/freshness and not be represented as proof of current private access after token revocation.

## One canonical lesson with independent per-student evidence

An exact, fresh indexed chapter and a frozen canonical lesson roster SHALL be previewed without writes. Confirmed linkage SHALL atomically revalidate teacher, session, chapter revision, stable roster digest, status, and idempotency UUID, then link one typed chapter to the occurrence and one separate explicit `assigned` or `taught` record per student; `taught` requires a completed lesson. The one instructor session SHALL remain one teaching interval for reporting; comprehension remains unknown.

## Image-to-FEN and bounded provider writes

A six-field FEN proposal SHALL be checked for structural and static legality with unobservable image state flagged as unknown. No board image SHALL silently prove side to move, castling, en-passant or full move legality. Provider chapter import SHALL first check authorized live study count including starter against 64, and reject full capacity. Creating private `Puzzles N` SHALL require a separate write-grant/teacher confirmation, local naming/cap budget, persistent intent *before* the remote POST and reconciliation instead of blind retries. No unrelated provider chapters may be deleted as a rollover workaround.

## Website/MCP parity acceptance

Every added teacher route has versioned `ccp_*` tool(s), shared service and independent real delegated browser/MCP acceptance. Exact test file `e2e/parity-conversational-batch.spec.ts` and previous `e2e/parity-lesson-schedule-inference.spec.ts` cover core cases. Parent OpenSpec remains active for study preferences, distributed provider quotas, complete chess-engine SAN move validation, other listed acceptance cases and live ChatGPT/Claude prepublication tests.
