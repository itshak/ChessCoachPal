#!/usr/bin/env bash
# ADR-0017: disposable GitHub-only final-baseline reproducibility smoke.
# There is no historical pre-v1 upgrade or compatibility verification. The
# actual future production cutover/reimport remains an operator-controlled
# event and is NEVER run from this script.
set -euo pipefail
[[ "${CI:-}" == "true" && "${CCP_SYNTHETIC_SCHEMA:-}" == "1" ]] ||
  { echo "Refusing non-CI / non-synthetic canonical baseline verification" >&2; exit 2; }
[[ -z "${SUPABASE_DB_URL:-}" && -z "${DATABASE_URL:-}" ]] ||
  { echo "Refusing any externally supplied DB URL" >&2; exit 2; }
[[ "$(sed -n 's/^project_id = "\([^"]*\)"/\1/p' supabase/config.toml | head -1)" == "chesscoachpal" ]] ||
  { echo "Unexpected Supabase project ID" >&2; exit 2; }
command -v supabase >/dev/null && command -v docker >/dev/null
node scripts/pre1-schema-guard.mjs
base="20261107000000_chesscoachpal_baseline.sql"
[[ "$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | wc -l)" -eq 1 &&
  -f "supabase/migrations/$base" ]] ||
  { echo "ADR-0017: one canonical fresh-install baseline required" >&2; exit 1; }
scratch="$(mktemp -d)"
cleanup(){ supabase stop --no-backup >/dev/null 2>&1 || true; rm -rf "$scratch"; }
trap cleanup EXIT

echo "==> start disposable local Supabase (NO production access)"
supabase start
db="supabase_db_chesscoachpal"
docker inspect "$db" >/dev/null
sql(){ docker exec -i "$db" psql -X -U postgres -d postgres -At -v ON_ERROR_STOP=1; }
echo "==> fresh install using ONLY canonical baseline"
supabase db reset --yes
sql < scripts/schema-final-baseline-synthetic.sql >/dev/null
sql < scripts/financial-ledger-synthetic.sql >/dev/null
# Rehearse current contact-first student RPC and its idempotent replay inside rollback.
sql < scripts/schema-transition-contact-student-create.sql >/dev/null
sql < scripts/schema-state-fingerprint.sql > "$scratch/first.json"
[[ -s "$scratch/first.json" ]]
echo "==> second clean install, compare public schema, RLS, roles, functions"
supabase db reset --yes
sql < scripts/schema-final-baseline-synthetic.sql >/dev/null
sql < scripts/financial-ledger-synthetic.sql >/dev/null
# Rehearse current contact-first student RPC and its idempotent replay inside rollback.
sql < scripts/schema-transition-contact-student-create.sql >/dev/null
sql < scripts/schema-state-fingerprint.sql > "$scratch/second.json"
cmp "$scratch/first.json" "$scratch/second.json"
echo "SCHEMA_FINAL_BASELINE_OK: deterministic clean install, owner checks, restricted portal functions; single future operator cutover required"
