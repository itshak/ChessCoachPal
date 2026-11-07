#!/usr/bin/env bash
# Destructive only to a verified EMPTY second installation, NEVER the source stack.
# Follow docs/SELF_HOSTING.md. This script never silently resets a populated DB.
set -euo pipefail
umask 077

if [[ "${RESTORE_CONFIRM:-}" != "RESTORE_TO_NEW_EMPTY_INSTALLATION" ]]; then
  echo "Refusing restore: explicit RESTORE_CONFIRM=RESTORE_TO_NEW_EMPTY_INSTALLATION required." >&2
  exit 2
fi
if [[ ! "${RESTORE_DATE:-}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "Refusing restore: RESTORE_DATE must be YYYY-MM-DD from a verified backup." >&2
  exit 2
fi

BACKUP_DIR="${BACKUP_DIR:-/backups}"
db="$BACKUP_DIR/db-$RESTORE_DATE.sql.gz"
storage="$BACKUP_DIR/storage-$RESTORE_DATE.tar.gz"
manifest="$BACKUP_DIR/manifest-$RESTORE_DATE.sha256"
for file in "$db" "$storage" "$manifest"; do
  [[ -f "$file" && ! -L "$file" ]] || { echo "Missing or unsafe archive." >&2; exit 2; }
done

echo "==> checking backup integrity"
(cd "$BACKUP_DIR" && sha256sum -c --quiet "$(basename "$manifest")")
if tar -tzf "$storage" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "Unsafe storage archive entries." >&2; exit 2
fi

export PGPASSWORD="${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD on the target stack}"
host="${DB_HOST:-db}"
count="$(psql -v ON_ERROR_STOP=1 -qAt -h "$host" -U postgres -d postgres \
  -c 'SELECT (SELECT count(*) FROM auth.users) + (SELECT count(*) FROM public.teachers) + (SELECT count(*) FROM storage.objects);')"
if [[ "$count" != "0" ]]; then
  echo "Refusing restore: target contains user, teacher or storage records ($count)." >&2
  exit 2
fi
if find /var/lib/storage -type f -print -quit | grep -q .; then
  echo "Refusing restore: target storage contains files." >&2
  exit 2
fi

echo "==> restoring full current-schema Postgres snapshot"
gzip -cd -- "$db" | psql --single-transaction -v ON_ERROR_STOP=1 -h "$host" -U postgres -d postgres >/dev/null

echo "==> restoring private storage bytes"
tar -xzf "$storage" -C /var/lib/storage
echo "Restore completed. Verify row counts, relationships, storage checksums, and application login before going live."
echo "The optional secrets archive was NOT auto-extracted into configuration."
