# Self-hosting and recovery for ChessCoachPal

Current pre-1.0 fresh-install schema only (ADR-0001). A teacher can use the website without ChatGPT, Claude, Notion, Google or Lichess accounts. PostgreSQL/Supabase is required. Keep real student details out of GitHub, logs, screenshots and CI.

## Initial setup (new empty installation)

Install Docker Engine, Compose v2 and Buildx. Make ports 3000 (app) and 8000 (API gateway) available. Clone the ChessCoachPal repository, then run:

    cp .env.example .env.local
    cp docker-compose.example.yml docker-compose.yml
    sh docker/supabase/generate-secrets.sh

Paste unique generated Postgres/JWT/ANON/SERVICE_ROLE/S3 values into the untracked .env.local. Set independent TOKEN_ENCRYPTION_KEY (and MCP_SESSION_ENCRYPTION_KEY only when needed) using the generation advice in .env.example. Never commit any private env or backup. For local development, APP_URL=http://localhost:3000 and SUPABASE_PUBLIC_URL=http://supabase.localhost:8000 must be reachable from both browser and app container. Public access requires correctly routed HTTPS on an operator-controlled domain; never expose Postgres or service-role keys directly.

    docker compose --env-file .env.local config --quiet
    docker compose --env-file .env.local up -d --build
    docker compose --env-file .env.local ps

Wait for database/storage health and successful one-time migrations. Open the website, create an account, sign in, create two workplaces, a student and group, schedule a group and private lesson, mark individual attendance and save a note. Refresh and verify persistence. Email autoconfirm is suitable only for an isolated development install; enable confirmed email and abuse protections for public deployments.

The coaching activity report uses authorized workplace-local calendar dates, excludes cancelled lessons from teaching time, counts group teaching time once and attendees separately. The UTF-8 CSV and text exports contain aggregate totals rather than private notes. Hebrew workplace locale uses RTL presentation.

## Backup and off-machine retention

The opt-in backup profile saves a complete PostgreSQL SQL dump for privileged disaster recovery, a separate data-only dump of public/auth/Storage schemas for safe current-schema recovery, the physical uploaded Storage volume, a private local env/secrets copy, and a SHA-256 integrity manifest. Backups contain sensitive student records; keep them on encrypted, access-controlled media off the host and test restoration. For a consistent point-in-time snapshot, pause writes before running a manual backup.

    mkdir -p backups
    docker compose --env-file .env.local --profile backup up -d backup
    docker compose --env-file .env.local exec backup /bin/bash /backup.sh

Verify the manifest for the selected YYYY-MM-DD and keep database, storage, manifest and any secrets archive together. Scheduled backup is best-effort when an upload races the tar. Retention in .env.local is not a substitute for off-site copies. Secrets and encryption keys may be needed to decrypt restored data; do not print them in support logs or commit them.

## Restore only into a SECOND, new and empty installation

1. Use another server/checkout with independent volumes and domains, same current schema and Supabase Postgres major version. Never restore over a live/student-containing installation. Copy the selected db-YYYY-MM-DD.sql.gz, data-YYYY-MM-DD.sql.gz, storage-YYYY-MM-DD.tar.gz, manifest-YYYY-MM-DD.sha256 and any secrets archive into the second checkout's private backups directory.
2. Prepare private configuration in the new checkout. Start it once to provision required Supabase roles/extensions and migrations, WITHOUT signing up, importing, seeding or uploading. Stop target app, auth, rest, gateway and storage, leaving its database online:

    docker compose --env-file .env.local stop app auth rest gateway storage

3. On the TARGET checkout only, after verifying it is empty, run this explicit guard with the backup's actual date:

    RESTORE_DATE=2026-11-08 RESTORE_CONFIRM=RESTORE_TO_NEW_EMPTY_INSTALLATION docker compose --env-file .env.local --profile restore run --rm restore

The script validates SHA-256 checksums, archive paths, and the absence of target users, teacher rows, Storage metadata and files. It refuses a populated database. It imports all current-schema public/auth/Storage table data from the data-only backup and the physical uploaded files; the complete SQL dump remains available for expert-operated privileged recovery. Supabase-owned internal event triggers are intentionally not overwritten, and private environment configuration is never auto-overwritten. Do not bypass this guard.

4. Review private secrets separately, restart target services, sign in, and compare teachers, workplaces, students, group membership, sessions, notes and individual attendance with the source. Compare storage.object metadata, actual file bytes/sha256 and report totals; test upload/download and login before any DNS switch. If a restore fails, discard only the confirmed disposable target and start again. Never automate a reset of real data.

## Troubleshooting

- Compose config fails: check missing required .env.local keys, buildx, current directory and host ports.
- Login or redirect fails: verify APP_URL, SUPABASE_PUBLIC_URL, gateway hostname resolution and auth email confirmation settings.
- Storage or migrations fail: inspect target container health/logs privately and do not share credentials.
- Report cannot load: verify the signed-in teacher owns the workplace and the date range is valid (at most 367 calendar days).
- OAuth/MCP not configured: use the website normally. Real external clients are optional and require a secure HTTPS origin.
- Restore guard refuses: the target is not empty, archives/checksums are invalid or explicit confirmation is absent. Never weaken the guard for real data.

See docs/RELEASING.md and docs/LOCAL_CLIENT_ACCEPTANCE.md. The actual real ChatGPT/Claude sign-off is the only manual client test, performed immediately before release, not as a development or first-run prerequisite.
