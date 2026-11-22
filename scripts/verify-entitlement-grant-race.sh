#!/usr/bin/env bash
# ENT-12: real lock observation in the disposable schema convergence database.
# No external DSN, production role, or customer data may be used.
set -euo pipefail
[[ "${CI:-}" == "true" && "${CCP_SYNTHETIC_SCHEMA:-}" == "1" ]] ||
  { echo "Refusing non-synthetic entitlement grant race" >&2; exit 2; }
[[ -z "${SUPABASE_DB_URL:-}" && -z "${DATABASE_URL:-}" ]] ||
  { echo "Refusing externally supplied DB URL" >&2; exit 2; }
db="${1:?Expected disposable convergence database container name}"
[[ "$db" == "supabase_db_chesscoachpal" || "$db" =~ ^udot-ccp-ent12-[0-9]+-db-1$ ]] ||
  { echo "Refusing unexpected convergence database container" >&2; exit 2; }
scratch="$(mktemp -d)"
teacher=""
operator_pid=""
writer_pid=""
sql(){ docker exec -i "$db" psql -XqAt -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
cleanup(){
  # EOF causes an unfinished operator transaction to roll back.
  exec 9>&- || true
  if [[ -n "$operator_pid" ]]; then wait "$operator_pid" 2>/dev/null || true; fi
  if [[ -n "$writer_pid" ]]; then wait "$writer_pid" 2>/dev/null || true; fi
  if [[ -n "$teacher" ]]; then sql -c "DELETE FROM auth.users WHERE id='$teacher' AND email='$teacher@synthetic.invalid'" >/dev/null 2>&1 || true; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT

read -r teacher learner active grant request plan < <(sql -F ' ' -c 'SELECT gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()')
for id in "$teacher" "$learner" "$active" "$grant" "$request" "$plan"; do
  [[ "$id" =~ ^[0-9a-f-]{36}$ ]] || exit 2
done
operator_name="ccp-grant-op-${teacher:0:8}"
writer_name="ccp-grant-write-${teacher:0:8}"
sql <<SQL
BEGIN;
INSERT INTO auth.users(id,email) VALUES('$teacher','$teacher@synthetic.invalid');
INSERT INTO public.teachers(id,email,display_name)
 VALUES('$teacher','$teacher@synthetic.invalid','Synthetic ENT-12 teacher');
INSERT INTO public.plan_versions(id,code,version,lifecycle)
 VALUES('$plan','test_'||replace('$plan','-',''),1,'draft');
INSERT INTO public.plan_capabilities(plan_version_id,capability_key,capability_kind,integer_value,unlimited)
 VALUES('$plan','students.active','integer_limit',1,false);
UPDATE public.plan_versions SET lifecycle='published',effective_at='2026-01-01T00:00:00Z' WHERE id='$plan';
UPDATE public.teacher_entitlement_state SET baseline_plan_version_id='$plan' WHERE teacher_id='$teacher';
INSERT INTO public.students(id,teacher_id,name,archived_at) VALUES
 ('$active','$teacher','Existing synthetic pupil',NULL),
 ('$learner','$teacher','Archived synthetic candidate',now());
INSERT INTO public.teacher_entitlement_grants(id,teacher_id,kind,capability_key,capability_kind,integer_value,reason,request_id)
 VALUES('$grant','$teacher','capability_boost','students.active','integer_limit',2,'Synthetic concurrency fixture','$grant');
COMMIT;
SQL

# The teacher's pre-revocation preview is real but must not authorize a write.
preview="$(sql <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='$teacher';
SET LOCAL "request.jwt.claim.role"='authenticated';
SET LOCAL "request.jwt.claims"='{"sub":"$teacher","role":"authenticated"}';
SELECT public.ccp_student_lifecycle_preview('$learner')->>'expectedUpdatedAt',
       public.ccp_effective_capability('$teacher','students.active')->>'limit';
ROLLBACK;
SQL
)"
IFS='|' read -r preview_at preview_cap <<< "$preview"
[[ "$preview_at" =~ ^[0-9T:+.-]+$ && "$preview_cap" == "2" ]] ||
  { echo "ENT-12: invalid preview or fixture" >&2; exit 1; }
revision="$(sql -c "SELECT revision FROM public.teacher_entitlement_state WHERE teacher_id='$teacher'")"
[[ "$revision" =~ ^[0-9]+$ ]] || exit 1

mkfifo "$scratch/operator.in"
sql < "$scratch/operator.in" > "$scratch/operator.log" 2>&1 &
operator_pid=$!
exec 9> "$scratch/operator.in"
cat >&9 <<SQL
SET application_name='$operator_name';
BEGIN;
UPDATE public.teacher_entitlement_grants SET revoked_at=clock_timestamp() WHERE id='$grant';
\echo OPERATOR_HAS_LOCK
SQL
for ((i=0;i<100;i++)); do
  grep -qx 'OPERATOR_HAS_LOCK' "$scratch/operator.log" && break
  kill -0 "$operator_pid" 2>/dev/null || { cat "$scratch/operator.log" >&2; exit 1; }
  sleep .05
done
grep -qx 'OPERATOR_HAS_LOCK' "$scratch/operator.log" ||
  { echo "ENT-12: operator failed to acquire lock" >&2; exit 1; }

sql > "$scratch/writer.log" 2>&1 9>&- <<SQL &
\set VERBOSITY verbose
SET application_name='$writer_name';
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout='15s';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub"='$teacher';
SET LOCAL "request.jwt.claim.role"='authenticated';
SET LOCAL "request.jwt.claims"='{"sub":"$teacher","role":"authenticated"}';
SELECT public.ccp_student_lifecycle_commit('$learner','reactivate','$preview_at',
 ARRAY[]::uuid[],'$request','Synthetic reviewed reactivation',true);
COMMIT;
SQL
writer_pid=$!
blocked=false
for ((i=0;i<90;i++)); do
  if [[ "$(sql -c "SELECT EXISTS(
    SELECT 1 FROM pg_stat_activity writer JOIN pg_stat_activity oper
     ON oper.pid=ANY(pg_blocking_pids(writer.pid))
    WHERE writer.application_name='$writer_name' AND oper.application_name='$operator_name'
  )")" == "t" ]]; then blocked=true; break; fi
  kill -0 "$writer_pid" 2>/dev/null || break
  sleep .05
done
[[ "$blocked" == "true" ]] ||
  { echo "ENT-12: authenticated commit did not demonstrably wait for grant transaction" >&2; cat "$scratch/writer.log" >&2; exit 1; }
printf 'COMMIT;\n\\quit\n' >&9
exec 9>&-
wait "$operator_pid"
operator_pid=""
if wait "$writer_pid"; then
  echo "ENT-12: stale preview unexpectedly authorized reactivation" >&2; exit 1
fi
writer_pid=""
grep -Eq 'ERROR: *23514: CAPACITY_EXCEEDED' "$scratch/writer.log" ||
  { cat "$scratch/writer.log" >&2; exit 1; }
verified="$(sql -c "SELECT
  EXISTS(SELECT 1 FROM public.students WHERE id='$learner' AND archived_at IS NOT NULL AND updated_at='$preview_at')
  AND EXISTS(SELECT 1 FROM public.students WHERE id='$active' AND archived_at IS NULL)
  AND EXISTS(SELECT 1 FROM public.teacher_entitlement_state WHERE teacher_id='$teacher'
    AND active_student_count=1 AND revision=$revision+1)
  AND EXISTS(SELECT 1 FROM public.teacher_entitlement_grants WHERE id='$grant' AND revoked_at IS NOT NULL)
  AND EXISTS(SELECT 1 FROM public.entitlement_audit_events WHERE teacher_id='$teacher'
    AND source='grant' AND action='grant_revoked')
  AND NOT EXISTS(SELECT 1 FROM public.agent_tool_receipts WHERE teacher_id='$teacher' AND idempotency_key='$request')")"
[[ "$verified" == "t" ]] ||
  { echo "ENT-12: archived learner, count, revision, revocation audit or receipt invariant failed" >&2; exit 1; }
echo "ENTITLEMENT_GRANT_RACE_OK: lock wait witnessed; stale reviewed reactivation rejected after committed revocation; no partial writes"
