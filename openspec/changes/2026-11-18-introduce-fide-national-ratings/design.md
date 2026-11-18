# Design: federation identities and immutable published ratings

## Current source boundaries
Student profile: students.strength (teacher), students.chess_ratings/manual fields, student_chess_profile_history, student_rating_snapshots with provider IN (lichess,chesscom) and source (teacher_manual,provider_api). Preserve those records, avoid dual truth and align this change with online sync.

## Proposed identity and ratings
- students.fide_id nullable text validated against known stable ID syntax, plus fide_federation_code nullable; no fabricated registration, a FIDE ID is not a national membership.
- teachers.default_national_federation_code nullable ISO/FIDE-compatible registry value. It is a form suggestion only; student override nullable, including explicit none, does not create membership.
- student_federation_memberships(id, teacher_id, student_id, federation_code, player_id, membership_status=unverified|source_matched, verified_at nullable, source_url nullable, created_at); unique appropriately by teacher/student/federation plus supported multiple IDs per federation only when evidence justifies it.
- student_rating_snapshots generalized to provider (lichess,chesscom,fide,icf, future registry codes) and category values validated by provider registry (FIDE standard/rapid/blitz, ICF national current, USCF future regular/quick/blitz and online variants). Separate official effective_at/observed_at from fetched_at and original source payload digest; keep teacher_manual versus provider_import distinct, immutable, tenant-owned. Duplicate same monthly list/rating must not generate a fake longitudinal trend.
- Latest-value views are derived, never written as unproven duplicate student fields. Legacy manual rating fields, if removed, need reviewed value-preserving transition.

## Provider adapters
- FIDE: inspect official rating list format/version, official player ID, categories, list date and unranked cases. Schedule on publication cadence, with safe caches/ETag or digest, no per-student heavy polling. Official source: https://ratings.fide.com/download_lists.phtml.
- ICF: public player/ranking/update pages exist at https://www.chess.org.il/Players/PlayersRanking.aspx and https://www.chess.org.il/Players/PreviousRatingUpdates.aspx. **There is no verified official API/integration permission yet.** Make source/terms/rate/robots and HTML change-tolerance a blocking feasibility task before enabling automated fetching; manual evidence and links remain useful.
- US Chess/other providers: category registry present but no network adapter in this scope. Do not flatten their multiple rating types to one integer.

## Security and parity
Explicit permission for automated lookup of a minor's external public identifier, redacted provider metadata, fixed outbound hosts (SSRF defense), throttling/retry/backoff and resumable jobs, RLS/service-role-only imported snapshot writes. Website and MCP share typed identity/lookup services; audited teacher manual entries remain clearly marked and never impersonate FIDE-certified data.
