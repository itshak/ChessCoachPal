#!/usr/bin/env bash
# Backup: DB + storage volume + env/secrets. The `backup` compose service runs
# this from a crontab (see docker-compose.example.yml); run it ad hoc with:
#   docker compose exec backup /bin/bash /backup.sh
set -euo pipefail
umask 077

STAMP="$(date +%F)"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
SECRETS_KEEP_DAYS="${SECRETS_KEEP_DAYS:-90}"
mkdir -p "$BACKUP_DIR"
# A run killed mid-write leaves a *.part.* file behind; clear any on exit.
trap 'rm -f "$BACKUP_DIR"/*.part.* 2>/dev/null || true' EXIT

echo "==> pg_dump"
# --no-owner so the dump restores under any superuser (ownership otherwise needs
# the exact role membership); grants are kept - the app depends on them.
# Write to a temp name and rename on success: crond ignores SIGTERM, so a
# `docker stop` can kill this mid-dump, and a truncated file under the real name
# would look complete and be kept by retention.
db="$BACKUP_DIR/db-$STAMP.sql.gz"
PGPASSWORD="${POSTGRES_PASSWORD:?}" pg_dump --no-owner --clean --if-exists -h "${DB_HOST:-db}" -U postgres -d postgres \
  | gzip > "$db.part.$$"
mv -f "$db.part.$$" "$db"

# The production restore path starts with the checked-in CURRENT schema, not
# a dump of Supabase-owned internal DDL/event triggers. Back up all teacher,
# auth and Storage table data separately for a safe same-schema restore.
data="$BACKUP_DIR/data-$STAMP.sql.gz"
excluded="$BACKUP_DIR/restore-excluded-$STAMP.txt"
PGPASSWORD="${POSTGRES_PASSWORD:?}" psql -v ON_ERROR_STOP=1 -qAt \
  -h "${DB_HOST:-db}" -U postgres -d postgres \
  -c "SELECT format('%I.%I', schemaname, tablename)
      FROM pg_tables WHERE schemaname IN ('public','auth','storage')
        AND NOT (
          has_table_privilege(format('%I.%I', schemaname, tablename), 'TRUNCATE')
          AND has_table_privilege(format('%I.%I', schemaname, tablename), 'INSERT')
        ) ORDER BY 1" > "$excluded.part.$$"
mv -f "$excluded.part.$$" "$excluded"
# Do not silently exclude user-owned data. These are Supabase's internal
# migration ledgers, already provisioned by the current target image.
exclude_args=()
while IFS= read -r table; do
  [[ -z "$table" ]] && continue
  case "$table" in
    auth.schema_migrations|storage.migrations) ;;
    *) echo "Unapproved Supabase table exclusion: $table" >&2; exit 1 ;;
  esac
  exclude_args+=("--exclude-table-data=$table")
done < "$excluded"
PGPASSWORD="${POSTGRES_PASSWORD:?}" pg_dump --no-owner --data-only \
  --schema=public --schema=auth --schema=storage "${exclude_args[@]}" \
  -h "${DB_HOST:-db}" -U postgres -d postgres | gzip > "$data.part.$$"
mv -f "$data.part.$$" "$data"

# ponytail: tar of a live dir - a file uploaded mid-tar can be half-written. Fine at one-teacher scale.
echo "==> storage"
st="$BACKUP_DIR/storage-$STAMP.tar.gz"
tar czf "$st.part.$$" -C /var/lib/storage .
mv -f "$st.part.$$" "$st"

echo "==> secrets"
if [[ -f /secrets/.env.local ]]; then
  sec="$BACKUP_DIR/secrets-$STAMP.tar.gz"
  tar czf "$sec.part.$$" -C /secrets .env.local && mv -f "$sec.part.$$" "$sec"
  chmod 600 "$sec"
fi

echo "==> checksums"
(
  cd "$BACKUP_DIR"
  names=("db-$STAMP.sql.gz" "data-$STAMP.sql.gz" "storage-$STAMP.tar.gz" "restore-excluded-$STAMP.txt")
  if [[ -f "secrets-$STAMP.tar.gz" ]]; then names+=("secrets-$STAMP.tar.gz"); fi
  sha256sum "${names[@]}" > "manifest-$STAMP.sha256.part.$$"
  mv -f "manifest-$STAMP.sha256.part.$$" "manifest-$STAMP.sha256"
)

echo "==> retention"
find "$BACKUP_DIR" -name 'restore-excluded-*.txt' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'data-*.gz'    -mtime +"$KEEP_DAYS"         -delete
find "$BACKUP_DIR" -name 'db-*.gz'      -mtime +"$KEEP_DAYS"         -delete
find "$BACKUP_DIR" -name 'storage-*.gz' -mtime +"$KEEP_DAYS"         -delete
find "$BACKUP_DIR" -name 'secrets-*.gz' -mtime +"$SECRETS_KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'manifest-*.sha256' -mtime +"$KEEP_DAYS" -delete

echo "==> done: $db"
