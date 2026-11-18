#!/usr/bin/env bash
# GitHub-only synthetic integration: full DB + real Storage upload -> second empty Supabase stack.
# Never run this on a live system. Does not accept production credentials or external DB URLs.
set -euo pipefail
umask 077
[[ "${M5_SYNTHETIC_RESTORE:-}" == "1" && "${CI:-}" == "true" ]] ||
  { echo "Synthetic GitHub Actions only" >&2; exit 2; }

# ADR-0017: prove deterministic fresh canonical baseline, RLS and portal
# permissions on a disposable Supabase. This does NOT upgrade old databases.
echo "==> enforce final single-baseline reproducibility and scoped authorization"
CCP_SYNTHETIC_SCHEMA=1 bash scripts/verify-schema-transition-convergence.sh

root="$(pwd)"
tmp="$(mktemp -d)"
cleanup() {
  # The second Supabase project is disposable. Stop its containers before
  # deleting the temp checkout, so a candidate release can safely run the
  # separate self-hosted Compose smoke on the same GitHub runner.
  if [[ -d "$tmp/restore/supabase" ]]; then
    (cd "$tmp/restore" && supabase stop --no-backup >/dev/null 2>&1) || true
  fi
  rm -rf "$tmp"
}
trap cleanup EXIT
mkdir -p "$tmp/backups" "$tmp/source-files" "$tmp/target-files" "$tmp/restore"
echo "==> start primary disposable Supabase"
supabase start
supabase db reset --yes
eval "$(supabase status -o env)"
[[ "${API_URL:-}" == http://127.0.0.1:* || "${API_URL:-}" == http://localhost:* ]] ||
  { echo "Refusing nonlocal source" >&2; exit 2; }
key="${SERVICE_ROLE_KEY:-${SECRET_KEY:-}}"
[[ -n "$key" ]] || { echo "Missing synthetic service key" >&2; exit 2; }
source_db="supabase_db_chesscoachpal"
source_storage="supabase_storage_chesscoachpal"
docker inspect "$source_db" "$source_storage" >/dev/null

echo "==> insert synthetic coaching relationships and individual attendance"
docker exec -i "$source_db" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.class_groups (teacher_id, workplace_id, name)
SELECT '00000000-0000-0000-0000-000000000001', id, 'Restore smoke group'
FROM public.workplaces WHERE teacher_id = '00000000-0000-0000-0000-000000000001'
ORDER BY id LIMIT 1;
INSERT INTO public.workplace_enrollments (teacher_id, workplace_id, student_id)
SELECT '00000000-0000-0000-0000-000000000001', id,
'10000000-0000-0000-0000-000000000001'
FROM public.workplaces WHERE teacher_id = '00000000-0000-0000-0000-000000000001'
ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.group_enrollments (teacher_id, workplace_id, group_id, student_id)
SELECT teacher_id, workplace_id, id, '10000000-0000-0000-0000-000000000001'
FROM public.class_groups WHERE name = 'Restore smoke group';
INSERT INTO public.teaching_sessions
(teacher_id, workplace_id, group_id, title, starts_at, duration_minutes, request_id)
SELECT teacher_id, workplace_id, id, 'Restore smoke lesson',
'2027-04-01T16:00:00Z'::timestamptz, 60, gen_random_uuid()
FROM public.class_groups WHERE name = 'Restore smoke group';
-- Privileged synthetic fixture: an unmarked participant has no attendance
-- row. Normal authenticated writers use the revisioned session commit RPC.
INSERT INTO public.session_attendance (teacher_id, session_id, student_id, status)
SELECT p.teacher_id, p.session_id, p.student_id, 'present'
FROM public.session_participants p
JOIN public.teaching_sessions s ON s.id=p.session_id
WHERE s.title='Restore smoke lesson';
DO $block$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.session_attendance a
    JOIN public.teaching_sessions s ON s.id=a.session_id
    WHERE s.title='Restore smoke lesson' AND a.status='present') THEN
    RAISE EXCEPTION 'synthetic individual attendance was not created';
  END IF;
END
$block$;
SQL

echo "==> create explicit synthetic contact, payer, guest grant and event RSVP evidence"
docker exec -i "$source_db" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.contacts (id,teacher_id,display_name,email,preferred_locale)
VALUES('a0000000-0000-4000-8000-000000000001',
       '00000000-0000-0000-0000-000000000001',
       'Synthetic contact only','synthetic-contact@example.invalid','en');
INSERT INTO public.student_contacts
 (teacher_id,student_id,contact_id,relationship_label,is_legal_guardian,may_receive_messages)
VALUES('00000000-0000-0000-0000-000000000001',
       '10000000-0000-0000-0000-000000000001',
       'a0000000-0000-4000-8000-000000000001',
       'Synthetic school contact',false,false);
INSERT INTO public.billing_accounts (id,teacher_id,display_name,account_kind,contact_id)
VALUES('d0000000-0000-4000-8000-000000000001',
       '00000000-0000-0000-0000-000000000001',
       'Synthetic payer only','person','a0000000-0000-4000-8000-000000000001');
INSERT INTO public.portal_access_grants
 (id,teacher_id,contact_id,student_id,workplace_id,billing_account_id,
  permissions,expires_at,token_digest)
SELECT 'c0000000-0000-4000-8000-000000000001',
       '00000000-0000-0000-0000-000000000001',
       'a0000000-0000-4000-8000-000000000001',
       '10000000-0000-0000-0000-000000000001',
       id,'d0000000-0000-4000-8000-000000000001',
       ARRAY['calendar','event_rsvp','finance']::text[],
       '2030-04-01T00:00:00Z'::timestamptz,
       encode(extensions.digest('test-only-private-demo-key','sha256'),'hex')
FROM public.workplaces WHERE teacher_id='00000000-0000-0000-0000-000000000001'
ORDER BY id LIMIT 1;
INSERT INTO public.events(id,teacher_id,workplace_id,title,starts_at)
SELECT 'b0000000-0000-4000-8000-000000000001',
       '00000000-0000-0000-0000-000000000001',id,
       'Synthetic event invitation','2027-04-02T16:00:00Z'::timestamptz
FROM public.workplaces WHERE teacher_id='00000000-0000-0000-0000-000000000001'
ORDER BY id LIMIT 1;
INSERT INTO public.event_students(event_id,student_id,repertoire)
VALUES('b0000000-0000-4000-8000-000000000001',
       '10000000-0000-0000-0000-000000000001','Synthetic repertoire');
INSERT INTO public.portal_event_invitations
 (id,teacher_id,event_id,portal_grant_id,status,party_size,note,responded_at)
VALUES('e0000000-0000-4000-8000-000000000001',
       '00000000-0000-0000-0000-000000000001',
       'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001',
       'yes',2,'Synthetic approved guest response','2026-11-18T12:00:00Z'::timestamptz);
SQL

echo "==> verify exact seeded guest sharing exists and old family tokens were never used"
docker exec "$source_db" psql -U postgres -d postgres -tAc \
  "SELECT count(*) FROM public.portal_event_invitations WHERE event_id='b0000000-0000-4000-8000-000000000001' AND status='yes'" | grep -qx 1

echo "==> upload actual synthetic PNG through Storage API"
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==' |
  base64 -d > "$tmp/restore-smoke.png"
curl --fail-with-body --silent --show-error -X POST \
  -H "Authorization: Bearer $key" -H "apikey: $key" \
  -H 'Content-Type: image/png' \
  --data-binary "@$tmp/restore-smoke.png" \
  "$API_URL/storage/v1/object/avatars/restore-smoke.png" >/dev/null
docker exec "$source_db" psql -U postgres -d postgres -tAc \
  "SELECT count(*) FROM storage.objects WHERE bucket_id='avatars' AND name='restore-smoke.png'" | grep -qx 1

echo "==> obtain real Storage API bytes for the bundled Compose filesystem adapter"
# The Supabase CLI uses a different storage backend path from the Compose
# distribution. Stage the downloaded, hash-checked uploaded object in the
# exact /var/lib/storage layout that the bundled backup service mounts.
mkdir -p "$tmp/source-files/avatars"
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $key" -H "apikey: $key" \
  "$API_URL/storage/v1/object/avatars/restore-smoke.png" \
  -o "$tmp/source-files/avatars/restore-smoke.png"
cmp "$tmp/restore-smoke.png" "$tmp/source-files/avatars/restore-smoke.png"
echo "==> run official backup against only synthetic source volumes"
docker run --rm --network "container:$source_db" \
  -v "$tmp/source-files:/var/lib/storage:ro" \
  -e DB_HOST=127.0.0.1 -e POSTGRES_PASSWORD=postgres -e BACKUP_DIR=/backups \
  -v "$root/docker/supabase/backup.sh:/backup.sh:ro" \
  -v "$tmp/backups:/backups" --entrypoint /bin/bash \
  supabase/postgres:17.6.1.136 /backup.sh
# The smoke may start before midnight UTC and finish the Docker image pull
# after midnight. Derive the stamp from the artifact we actually backed up;
# never assume a date captured before pulling images matches backup.sh's date.
shopt -s nullglob
backups=( "$tmp"/backups/db-????-??-??.sql.gz )
shopt -u nullglob
if [[ "${#backups[@]}" -ne 1 ]]; then
  echo "Expected exactly one completed date-stamped synthetic database backup" >&2
  exit 1
fi
RESTORE_DATE="$(basename "${backups[0]}" .sql.gz)"
RESTORE_DATE="${RESTORE_DATE#db-}"
[[ "$RESTORE_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] ||
  { echo "Unexpected synthetic backup date" >&2; exit 1; }
export RESTORE_DATE
[[ -s "$tmp/backups/db-$RESTORE_DATE.sql.gz" ]]
[[ -s "$tmp/backups/data-$RESTORE_DATE.sql.gz" ]]
[[ -s "$tmp/backups/storage-$RESTORE_DATE.tar.gz" ]]

echo "==> create second independent Supabase project with distinct ports"
cp -a "$root/supabase" "$tmp/restore/supabase"
# Local GoTrue loads custom Auth templates relative to the project root,
# not relative to config.toml. The second standalone restore project must
# include these same static EN/HE/RU files or CLI startup fails before the
# actual protected backup/restore can be verified.
mkdir -p "$tmp/restore/public"
cp -a "$root/public/auth-email-templates" "$tmp/restore/public/auth-email-templates"
# Restore target must be empty; local CLI would otherwise load synthetic seed.sql.
sed -i '/^\[db.seed\]/,/^\[db.network_restrictions\]/ s/^enabled = true$/enabled = false/' "$tmp/restore/supabase/config.toml"
sed -i 's/project_id = "chesscoachpal"/project_id = "chesscoachpal_restore"/' \
  "$tmp/restore/supabase/config.toml"
# A fixed textual substitution (5432 -> 5442) can collide with a port already
# occupied by the CI runner (observed: Mailpit 54424). Pick independent free
# loopback ports for every Supabase CLI exposed service in this disposable
# second stack. The source stack keeps its original configured ports.
python3 - "$tmp/restore/supabase/config.toml" <<'PY'
from pathlib import Path
import re
import socket
import sys

path = Path(sys.argv[1])
content = path.read_text()
ports = sorted(set(re.findall(r'(?<!\d)5432[0-9](?!\d)', content)))
reserved = []
mapping = {}
try:
    for port in ports:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(("127.0.0.1", 0))
        reserved.append(sock)
        mapping[port] = str(sock.getsockname()[1])
    content = re.sub(r'(?<!\d)5432[0-9](?!\d)',
                     lambda match: mapping[match.group()], content)
    path.write_text(content)
finally:
    for sock in reserved:
        sock.close()
print("Disposable target port allocation:", ", ".join(f"{a}->{b}" for a, b in mapping.items()))
PY
(cd "$tmp/restore" && supabase start)
target_db="supabase_db_chesscoachpal_restore"
target_storage="supabase_storage_chesscoachpal_restore"
docker inspect "$target_db" "$target_storage" >/dev/null

# No live clients in this disposable target while replacing its fresh schema.
for name in auth rest storage; do
  docker stop "supabase_${name}_chesscoachpal_restore" >/dev/null || true
done
echo "==> restore into empty target using the guarded operator script"
docker run --rm --network "container:$target_db" \
  -v "$tmp/target-files:/var/lib/storage" \
  -e DB_HOST=127.0.0.1 -e POSTGRES_PASSWORD=postgres \
  -e RESTORE_DATE="$RESTORE_DATE" \
  -e RESTORE_CONFIRM=RESTORE_TO_NEW_EMPTY_INSTALLATION \
  -v "$root/docker/supabase/restore.sh:/restore.sh:ro" \
  -v "$tmp/backups:/backups:ro" --entrypoint /bin/bash \
  supabase/postgres:17.6.1.136 /restore.sh

echo "==> compare synthetic row counts and actual uploaded bytes"
for table in auth.users public.teachers public.workplaces public.students public.class_groups \
  public.group_enrollments public.teaching_sessions public.session_participants \
  public.session_attendance public.contacts public.student_contacts \
  public.billing_accounts public.portal_access_grants \
  public.events public.event_students public.portal_event_invitations storage.objects; do
  a="$(docker exec "$source_db" psql -U postgres -d postgres -tAc "SELECT count(*) FROM $table")"
  b="$(docker exec "$target_db" psql -U postgres -d postgres -tAc "SELECT count(*) FROM $table")"
  [[ "$a" == "$b" ]] || { echo "Count mismatch: $table" >&2; exit 1; }
done
docker exec "$target_db" psql -U postgres -d postgres -tAc \
  "SELECT count(*) FROM public.session_attendance a JOIN public.teaching_sessions s ON s.id=a.session_id WHERE s.title='Restore smoke lesson' AND a.status='present'" | grep -qx 1
docker exec "$target_db" psql -U postgres -d postgres -tAc \
  "SELECT count(*) FROM public.portal_event_invitations WHERE status='yes' AND party_size=2" | grep -qx 1
docker exec "$target_db" psql -U postgres -d postgres -tAc \
  "SELECT count(*) FROM public.portal_access_grants WHERE token_digest=encode(extensions.digest('test-only-private-demo-key','sha256'),'hex')" | grep -qx 1
diff -qr "$tmp/source-files" "$tmp/target-files"
echo "==> assert the destructive restore guard rejects a second run on populated target"
if docker run --rm --network "container:$target_db" \
  -v "$tmp/target-files:/var/lib/storage" \
  -e DB_HOST=127.0.0.1 -e POSTGRES_PASSWORD=postgres \
  -e RESTORE_DATE="$RESTORE_DATE" \
  -e RESTORE_CONFIRM=RESTORE_TO_NEW_EMPTY_INSTALLATION \
  -v "$root/docker/supabase/restore.sh:/restore.sh:ro" \
  -v "$tmp/backups:/backups:ro" --entrypoint /bin/bash \
  supabase/postgres:17.6.1.136 /restore.sh; then
  echo "Restore must never overwrite a populated installation" >&2
  exit 1
fi
echo "Synthetic second-DB restore, protected repeat refusal, Storage API input, and mounted-file byte parity passed."
