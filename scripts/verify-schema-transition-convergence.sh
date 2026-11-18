#!/usr/bin/env bash
# ADR-0015 isolated GitHub-only proof: fresh baseline vs previous baseline +
# versioned live migrations. Never connects to a remote or deployed database.
set -euo pipefail
[[ "${CI:-}" == "true" && "${CCP_SYNTHETIC_SCHEMA:-}" == "1" ]] ||
  { echo "Refusing non-CI / non-synthetic schema transition verification" >&2; exit 2; }
[[ -z "${SUPABASE_DB_URL:-}" && -z "${DATABASE_URL:-}" ]] ||
  { echo "Refusing any externally supplied database URL" >&2; exit 2; }
[[ "$(sed -n 's/^project_id = "\([^"]*\)"/\1/p' supabase/config.toml | head -1)" == "chesscoachpal" ]] ||
  { echo "Unexpected Supabase project ID" >&2; exit 2; }
command -v supabase >/dev/null && command -v docker >/dev/null && command -v git >/dev/null
node scripts/pre1-schema-guard.mjs
root="$(pwd)"
scratch="$(mktemp -d)"
cp -a supabase/migrations "$scratch/migrations"
cleanup(){
  cp -a "$scratch/migrations/." "$root/supabase/migrations/" 2>/dev/null || true
  supabase stop --no-backup >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT
baseline="20261107000000_chesscoachpal_baseline.sql"
# Frozen source snapshot is part of the public git history. This is not a
# generic backwards-compatibility promise for arbitrary pre-v1 deployments.
previous="3a658a0bf5540f68c192b1a454bb5cdbc774f51b"
if ! git cat-file -e "$previous^{commit}" 2>/dev/null; then
  # restore.yml checks out a shallow tree; fetch ONLY the public pinned old
  # baseline commit, never live data or remote database state.
  git fetch --quiet --no-tags --depth=1 origin "$previous"
fi
git cat-file -e "$previous^{commit}"
echo "==> disposable Supabase start (synthetic developer fixtures only)"
supabase start
db="supabase_db_chesscoachpal"
docker inspect "$db" >/dev/null
sql(){
  docker exec -i "$db" psql -X -U postgres -d postgres -At -v ON_ERROR_STOP=1
}
echo "==> current clean install from ONLY the canonical baseline"
find supabase/migrations -maxdepth 1 -type f -name '*.sql' ! -name "$baseline" -delete
supabase db reset --yes
sql < scripts/schema-state-fingerprint.sql > "$scratch/fresh-schema.json"
[[ -s "$scratch/fresh-schema.json" ]]
echo "==> historic pre-extension schema and populated synthetic teacher fixtures"
git show "$previous:supabase/migrations/$baseline" > "supabase/migrations/$baseline"
supabase db reset --yes
sql < scripts/schema-transition-fixtures.sql >/dev/null
sql < scripts/schema-transition-preservation.sql > "$scratch/before-records.txt"
# Failed DDL must leave no residue. An interrupted migration is a release STOP;
# retries are only allowed after inspecting the runner's migration ledger.
if sql >/dev/null 2>&1 <<'SQL'
BEGIN;
ALTER TABLE public.students ADD COLUMN ccp_uncommitted_failure_test text;
SELECT 1/0;
COMMIT;
SQL
then
  echo "Injected failed transaction unexpectedly succeeded" >&2
  exit 1
fi
[[ "$(sql <<< "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name='ccp_uncommitted_failure_test';")" == "0" ]] ||
  { echo "Failed DDL left a partial column" >&2; exit 1; }
echo "==> apply exact approved transition set with Supabase local migration ledger"
cp -a "$scratch/migrations/." supabase/migrations/
# Keep the old baseline version recorded in the ledger: never re-run an edited
# current baseline on populated data. Only pending versioned transitions apply.
supabase migration up --local
sql < scripts/schema-transition-preservation.sql > "$scratch/after-records.txt"
diff -u "$scratch/before-records.txt" "$scratch/after-records.txt"
sql < scripts/schema-state-fingerprint.sql > "$scratch/upgraded-schema.json"
if ! cmp -s "$scratch/fresh-schema.json" "$scratch/upgraded-schema.json"; then
  python3 - "$scratch/fresh-schema.json" "$scratch/upgraded-schema.json" <<'PY_DIFF'
import json,sys
from pathlib import Path
fresh=json.loads(Path(sys.argv[1]).read_text())
live=json.loads(Path(sys.argv[2]).read_text())
keys={'relations':lambda x:x[0], 'columns':lambda x:f'{x[0]}.{x[1]}',
      'constraints':lambda x:f'{x[1]}.{x[0]}', 'indexes':lambda x:x[0],
      'triggers':lambda x:f'{x[1]}.{x[0]}', 'routines':lambda x:x[0],
      'policies':lambda x:f'{x[1]}.{x[2]}', 'storage_policies':lambda x:f'{x[0]}.{x[1]}'}
for label,key in keys.items():
    fa={key(x):x for x in fresh.get(label) or []}
    la={key(x):x for x in live.get(label) or []}
    for name in sorted(fa.keys()|la.keys()):
        if fa.get(name)!=la.get(name):
            print(f'ADR-0015 structural drift: {label} / {name}',file=sys.stderr)
            if label=='routines':
                print('  fresh definition digest:',(fa.get(name) or ['']*5)[-1],file=sys.stderr)
                print('  migrated definition digest:',(la.get(name) or ['']*5)[-1],file=sys.stderr)
PY_DIFF
  echo "ADR-0015: fresh-install and upgraded app-owned schema/RLS/grants diverge" >&2
  exit 1
fi
echo "==> repeat runner: version ledger prevents replay and duplicate records"
supabase migration up --local
sql < scripts/schema-transition-preservation.sql > "$scratch/replayed-records.txt"
diff -u "$scratch/before-records.txt" "$scratch/replayed-records.txt"
[[ "$(sql <<< "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20261117000000','20261117190000','20261117231554','20261118000000','20261118150000');")" == "5" ]] ||
  { echo "Expected exactly five recorded live migrations" >&2; exit 1; }
echo "==> reject unsafe locale state and cross-tenant student reads"
sql >/dev/null <<'SQL'
DO $test$
BEGIN
 BEGIN
   UPDATE public.teachers SET preferred_locale='not-a-supported-locale'
     WHERE id='00000000-0000-0000-0000-000000000001';
   RAISE EXCEPTION 'invalid locale unexpectedly allowed';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END
$test$;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
DO $rls$
BEGIN
 IF (SELECT count(*) FROM public.students)>0 OR
    (SELECT count(*) FROM public.guardians)>0 THEN
   RAISE EXCEPTION 'Foreign teacher could read synthetic learner or guardian data';
 END IF;
END
$rls$;
ROLLBACK;
SQL
echo "SCHEMA_CONVERGENCE_OK: baseline-only, approved live upgrade, preservation, replay, failure rollback, RLS/grants"
