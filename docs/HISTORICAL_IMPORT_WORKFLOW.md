# Historical student and attendance import — staged operator guide

**Status:** Source features merged; deployment requires the matching database schema. On earlier live Coolify installations the forward-only hotfix `20261117000000_live_historical_lifecycle_extension.sql` supplies missing SQL objects. Revalidate after deployment.

## Source precision

Historical evidence is separate from ordinary scheduled teaching sessions. Source-attested dated observations preserve one exact date and attendance status; aggregate-only rows preserve a source period, explicit count and status without inventing individual lesson dates. Both record teacher, student, workplace, source-row provenance, source digest, timezone and school-year bounds. Neither modifies ordinary calendar attendance, automatically changes group membership, or implies chess mastery.

## Website and MCP workflow

1. Create or identify students, including former students created directly in archived state (which do not consume active-student quota). Ordinary student/family CSV/XLSX import also supports an optional archived column.
2. In Account → Historical attendance import, upload CSV/TSV/TXT/XLS/XLSX, up to 8 MiB and 2,000 source rows. Private Supabase Storage keys and owner-bound metadata are short-lived (maximum two hours) and share only a random stage ID with ChatGPT or Claude. MCP tool ccp_historical_import_upload_handoff explains the safe browser upload and ccp_historical_import_stage_info validates its reference. Direct conversational submissions can contain up to 250 rows and 256 KiB of UTF-8 JSON; larger datasets must use the private staged file path. This is a safety/transport bound, not a database limit.
3. Supply the explicit source school-year start/end and IANA timezone. Map student name or UUID, workplace name or UUID, attendance status, and either an ISO dated observation or an explicit aggregate date range and count. Student aliases and names match conservatively. Ambiguous/unknown students and workplaces must be resolved to stable owned IDs; nothing is guessed.
4. Preview through the website or ccp_historical_attendance_preview. Every missing or invalid exact date, aggregate without a source period/count, duplicate, unknown status, ambiguous student, or missing workplace blocks commit. The preview distinguishes dated and aggregate observations.
5. Confirm the exact SHA-256 preview digest and a durable request UUID. The website and ccp_historical_attendance_commit share owner-locked atomic SQL. Bad rows roll back the batch, exact retries read the existing receipt, changed request IDs/payloads conflict.
6. Read evidence through website history, ccp_historical_attendance_report and ccp_historical_attendance_summary. Student progress reports keep historical counts separate and never convert them into calendar lessons. Private staged file removal is explicit via ccp_historical_import_stage_delete; expired references cannot be read but bytes also need periodic operator cleanup.

## Bulk student lifecycle

Account → Bulk archive/reactivate students supports up to 100 explicitly selected UUIDs. Website and MCP tools ccp_students_bulk_lifecycle_preview and ccp_students_bulk_lifecycle_commit require individual updated_at revisions, current group/workplace enrollment and future commitment checks, hosted active-student quota preflight, reviewed digest, explicit confirmation, and one idempotent SQL transaction. SQL rechecks all blockers with the teacher row locked, archives before reactivation for quota-safe swaps, and keeps all historical evidence. No global archive may be inferred from absence at one school.

## Privacy and operator warning

Teacher-owned evidence uses Row Level Security; raw public PostgREST writes are not granted. The model never needs raw large student file bytes, sender credentials or signed storage URLs. Never commit or log real pupils' personal data, notes, access codes or private strategy. All tests must be synthetic.

This pre-v1.0 project retains one canonical fresh-install SQL baseline; the single named forward-only extension is an approved, additive live-data repair (not a pre-v1 format compatibility chain). It is safe for disposable CI databases to bootstrap the canonical baseline. **Never reset or destructively migrate a live Coolify database.** Deploying this branch requires a reviewable, non-destructive live schema addition, an off-host backup, a tested restore, and operator verification. A GitHub merge alone does not install SQL in production; a separate deployment cutover must be planned after PR acceptance.
