#!/usr/bin/env python3
"""Exact signed database contention proof; run only on a disposable seeded stack."""
import hashlib
import json
import subprocess
import sys
import time

if len(sys.argv)!=3 or sys.argv[1]!="--disposable-only":
    raise SystemExit("Usage: ratings-manual-binding-concurrency.py --disposable-only PSQL")
pg=[sys.argv[2],"-XqAt","-v","ON_ERROR_STOP=1"]
owner="00000000-0000-0000-0000-000000000001"
a,b=[f"ad190000-0000-4000-8000-00000000000{x}" for x in (1,2)]
keys=[f"ad190000-0000-4000-8000-00000000100{x}" for x in (1,2)]
def query(sql):
    return subprocess.run(pg,input=sql,text=True,capture_output=True,check=True).stdout.strip()
query(f"""INSERT INTO public.students(id,teacher_id,name,lichess_username) VALUES
 ('{a}','{owner}','Manual rating concurrency A','AtomicFixture'),
 ('{b}','{owner}','Manual rating concurrency B','AtomicFixture');""")
epoch=query(f"SELECT online_rating_binding_epoch FROM public.students WHERE id='{a}';")
observations=[dict(time_control=c,rating=n,rating_deviation=None,provisional=False,games=10,
                  observed_at="2026-01-01T12:00:00Z") for c,n in [('blitz',1600),('rapid',1700)]]
digest=hashlib.sha256(json.dumps(["manual-online-rating-v2",a,"lichess","AtomicFixture",epoch,
    [[r["time_control"],r["rating"],r["rating_deviation"],r["provisional"],r["games"]] for r in observations]],
    separators=(",",":")).encode()).hexdigest()

def call(key):
    return f"""SELECT public.ccp_manual_online_rating_commit('{owner}','{a}','lichess','AtomicFixture','{epoch}',
    '{key}','{digest}','2026-01-01T12:00:00Z','{json.dumps(observations,separators=(",",":"))}');"""
def record(key):
    return f"""INSERT INTO public.student_rating_snapshots(teacher_id,student_id,provider,time_control,rating,source,observed_at,request_id)
      VALUES('{owner}','{b}','chesscom','bullet',1350,'teacher_manual','2026-01-01T12:00:00Z','{key}');"""
def feed(p,s):
    p.stdin.write(s+"\n");p.stdin.flush()
def until(p,marker):
    for line in p.stdout:
        if line.strip()==marker: return
    raise AssertionError("Connection exited before "+marker)
def conn(role,label):
    p=subprocess.Popen(pg,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    feed(p,f"""SET application_name='{label}'; BEGIN; SET LOCAL ROLE {role};
      SET LOCAL statement_timeout='12s'; SELECT set_config('request.jwt.claim.sub','{owner}',true);
      \\echo ready""")
    until(p,"ready")
    return p
def expected_denial(stmt):
    # SELECT is transformed to PERFORM inside a PL/pgSQL block; INSERT is unchanged.
    if stmt.startswith("SELECT "): stmt="PERFORM "+stmt[len("SELECT "):]
    return f"""DO $proof$ BEGIN {stmt} RAISE EXCEPTION 'Expected request collision';
    EXCEPTION WHEN unique_violation THEN
      IF SQLERRM<>'RATING_REQUEST_CONFLICT' THEN RAISE; END IF;
    END $proof$;"""
for i,key in enumerate(keys):
    suffix=str(i)
    first,second=[call(key),record(key)] if i==0 else [record(key),call(key)]
    winner,waiter=[conn(role,label+suffix) for role,label in (
       [('service_role','manualrt-win'),('authenticated','manualrt-wait')] if i==0
       else [('authenticated','manualrt-win'),('service_role','manualrt-wait')])]
    try:
        feed(winner,first+"\n\\echo first")
        until(winner,"first")
        feed(waiter,expected_denial(second)+"\nROLLBACK;\n\\q")
        for _ in range(60):
            n=query(f"""SELECT count(*) FROM pg_stat_activity v JOIN pg_stat_activity w
             ON w.pid=ANY(pg_blocking_pids(v.pid)) AND v.application_name='manualrt-wait{suffix}'
             AND w.application_name='manualrt-win{suffix}';""")
            if n=="1": break
            time.sleep(.08)
        else: raise AssertionError("Did not observe concurrent admission wait")
        feed(winner,"COMMIT;\n\\q")
        for p in [winner,waiter]:
            _,err=p.communicate(timeout=15)
            if p.returncode: raise AssertionError(err)
    finally:
        for p in [winner,waiter]:
            if p.poll() is None: p.kill();p.wait()
    got=query(f"""SELECT string_agg(s.source||':'||s.time_control,',' ORDER BY s.time_control)
          FROM public.student_rating_snapshots s WHERE teacher_id='{owner}' AND request_id='{key}'""")
    if got!=["provider_api:blitz,provider_api:rapid","teacher_manual:bullet"][i]:
        raise AssertionError(got)
    print("PASS",["provider-first","teacher-manual-first"][i],"different student + provider + category; actual lock wait")


# Reserve a disposable unused learner: raw DELETE obtains its student row
# exclusively before waiting in the inherited capacity trigger for teacher.
c="ad190000-0000-4000-8000-000000000003"
query(f"INSERT INTO public.students(id,teacher_id,name,lichess_username) VALUES('{c}','{owner}','Raw lifecycle contention','AtomicFixture');")
c_epoch=query(f"SELECT online_rating_binding_epoch FROM public.students WHERE id='{c}';")
c_digest=hashlib.sha256(json.dumps(["manual-online-rating-v2",c,"lichess","AtomicFixture",c_epoch,
    [[r["time_control"],r["rating"],r["rating_deviation"],r["provisional"],r["games"]] for r in observations]],separators=(",",":")).encode()).hexdigest()
c_key="ad190000-0000-4000-8000-000000001003"
c_call=f"""PERFORM public.ccp_manual_online_rating_commit('{owner}','{c}','lichess','AtomicFixture','{c_epoch}',
   '{c_key}','{c_digest}','2026-01-01T12:00:00Z','{json.dumps(observations,separators=(",",":"))}');"""
holder=conn('service_role','manualrt-parent-holder')
raw=conn('authenticated','manualrt-raw-delete')
try:
    feed(holder,f"SELECT 1 FROM public.teachers WHERE id='{owner}' FOR KEY SHARE;\n\\echo parent")
    until(holder,"parent")
    feed(raw,f"DELETE FROM public.students WHERE id='{c}';\nROLLBACK;\n\\q")
    for _ in range(60):
        if query("""SELECT count(*) FROM pg_stat_activity r JOIN pg_stat_activity h ON h.pid=ANY(pg_blocking_pids(r.pid))
            WHERE r.application_name='manualrt-raw-delete' AND h.application_name='manualrt-parent-holder';""")=="1":break
        time.sleep(.08)
    else: raise AssertionError("Raw deletion did not reach inherited teacher lock")
    feed(holder,f"""DO $proof$ BEGIN {c_call} RAISE EXCEPTION 'Expected student lock conflict';
      EXCEPTION WHEN lock_not_available THEN
        IF SQLERRM<>'RATING_SNAPSHOT_CONTEXT_BUSY' THEN RAISE; END IF;
      END $proof$;
      ROLLBACK;
      \\q""")
    for p in [holder,raw]:
        _,err=p.communicate(timeout=15)
        if p.returncode: raise AssertionError(err)
finally:
    for p in [holder,raw]:
        if p.poll() is None:p.kill();p.wait()
if query(f"SELECT count(*) FROM public.student_rating_snapshots WHERE request_id='{c_key}';")!="0":
    raise AssertionError("raw-delete-first left rating history")
print("PASS raw-delete-first waited on teacher; rating returned typed no-row retry at student")


holder=conn('service_role','manualrt-rating-first')
raw=conn('authenticated','manualrt-raw-second')
try:
    feed(holder,c_call.replace("PERFORM ","SELECT ",1)+"\n\\echo approved")
    until(holder,"approved")
    feed(raw,f"DELETE FROM public.students WHERE id='{c}' RETURNING id;\nROLLBACK;\n\\q")
    for _ in range(60):
        if query("""SELECT count(*) FROM pg_stat_activity r JOIN pg_stat_activity h ON h.pid=ANY(pg_blocking_pids(r.pid))
            WHERE r.application_name='manualrt-raw-second' AND h.application_name='manualrt-rating-first';""")=="1":break
        time.sleep(.08)
    else: raise AssertionError("Raw delete did not wait for binding writer")
    feed(holder,"ROLLBACK;\n\\q")
    for p in [holder,raw]:
        _,err=p.communicate(timeout=15)
        if p.returncode:raise AssertionError(err)
finally:
    for p in [holder,raw]:
        if p.poll() is None:p.kill();p.wait()
if query(f"SELECT count(*) FROM public.student_rating_snapshots WHERE request_id='{c_key}';")!="0":
    raise AssertionError("Rolled back rating-first left evidence")
print("PASS rating-first held binding and raw delete waited until rollback")

# Uncontended lower signed direct REPEATABLE READ remains supported. A
# disjoint category/source that raced a committed claim cannot backfill it.
rr_key="ad190000-0000-4000-8000-000000001004"
rr=query(f"""BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','{owner}',true);
{record(rr_key)} COMMIT;
SELECT sealed FROM public.rating_snapshot_request_claims WHERE teacher_id='{owner}' AND request_id='{rr_key}';""")
if rr.splitlines()[-1]!="t":raise AssertionError("Fresh lower RR claim not sealed")
print("PASS fresh lower signed REPEATABLE READ commits a sealed request")

# Privileged history maintenance cannot reopen the request; routine erasure
# of the whole account is separate and the namespace follows parent cascade.
query(f"DELETE FROM public.student_rating_snapshots WHERE teacher_id='{owner}' AND request_id='{rr_key}';")
rr_closed=query(f"""BEGIN; SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.sub','{owner}',true);
 {expected_denial(record(rr_key))}
 ROLLBACK;
 SELECT count(*) FROM public.rating_snapshot_request_claims WHERE teacher_id='{owner}' AND request_id='{rr_key}' AND sealed;""")
if rr_closed.splitlines()[-1]!="1":raise AssertionError("Evaporated sealed request after snapshot removal")
print("PASS retained claim prevents request reuse even after privileged snapshot removal")


# A contender uses an RR snapshot acquired before the distinct writer
# commits. Advisory acquisition cannot refresh it; the durable PK refuses it.
stale_key="ad190000-0000-4000-8000-000000001005"
stale=subprocess.Popen(pg,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
    feed(stale,f"""BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE authenticated;
     SELECT set_config('request.jwt.claim.sub','{owner}',true);
     SELECT count(*) FROM public.student_rating_snapshots WHERE request_id='{stale_key}';
     \\echo pinned""")
    until(stale,"pinned")
    query(f"BEGIN; SET LOCAL ROLE service_role; {call(stale_key)} COMMIT;")
    feed(stale,f"""DO $rr$ BEGIN {record(stale_key)} RAISE EXCEPTION 'Stale RR appended';
      EXCEPTION WHEN serialization_failure THEN NULL; END $rr$;
      ROLLBACK;
      \\q""")
    _,err=stale.communicate(timeout=15)
    if stale.returncode:raise AssertionError(err)
finally:
    if stale.poll() is None:stale.kill();stale.wait()
if query(f"SELECT count(*) FROM public.student_rating_snapshots WHERE request_id='{stale_key}';")!="2":
    raise AssertionError("Stale RR modified sealed provider batch")
print("PASS RR snapshot held before sealed winner rolls back on unique claim")

# The worker's existing lease must remain usable after the narrow lock denial.
consent="ad190000-0000-4000-8000-000000002001"
job="ad190000-0000-4000-8000-000000002002"
input_digest="a"*64
query(f"""INSERT INTO public.student_rating_sync_consents(id,teacher_id,student_id,provider,source_username,enabled,consented_at)
  VALUES('{consent}','{owner}','{a}','lichess','AtomicFixture',true,clock_timestamp());
 INSERT INTO public.student_rating_refresh_jobs(id,teacher_id,student_id,consent_id,provider,source_username,handle_revision,input_digest,idempotency_key,trigger_kind)
  VALUES('{job}','{owner}','{a}','{consent}','lichess','AtomicFixture',1,'{input_digest}',gen_random_uuid(),'manual');""")
lease=json.loads(query(f"SET ROLE service_role; SELECT public.ccp_rating_refresh_claim('{owner}','{job}');"))
token=lease["leaseToken"]
worker_args=f"""'{owner}','{job}','{token}',{lease['attempt']},'{input_digest}','succeeded',
 clock_timestamp(),'{('b'*64)}','[{{"time_control":"blitz","rating":1780,"observed_at":"2026-01-01T12:00:00Z"}}]',NULL"""
raw=conn("authenticated","manualrt-worker-student")
try:
    feed(raw,f"SELECT id FROM public.students WHERE id='{a}' FOR UPDATE;\n\\echo locked")
    until(raw,"locked")
    query(f"""BEGIN; SET LOCAL ROLE service_role; DO $busy$ BEGIN
       PERFORM public.ccp_rating_refresh_finalize({worker_args});
       RAISE EXCEPTION 'Worker finalized during raw lock';
       EXCEPTION WHEN lock_not_available THEN
         IF SQLERRM<>'RATING_SNAPSHOT_CONTEXT_BUSY' THEN RAISE; END IF;
       END $busy$; COMMIT;""")
    if query(f"""SELECT concat_ws(':',status,lease_token,
      (SELECT count(*) FROM public.student_rating_refresh_receipts WHERE job_id='{job}'),
      (SELECT count(*) FROM public.student_rating_snapshots WHERE request_id='{token}'))
      FROM public.student_rating_refresh_jobs WHERE id='{job}';""")!=f"running:{token}:0:0":
        raise AssertionError("Busy worker mutated receipt or lost lease")
    feed(raw,"ROLLBACK;\n\\q"); _,err=raw.communicate(timeout=12)
    if raw.returncode:raise AssertionError(err)
finally:
    if raw.poll() is None:raw.kill();raw.wait()
done=json.loads(query(f"SET ROLE service_role; SELECT public.ccp_rating_refresh_finalize({worker_args});"))
if done.get("status")!="succeeded" or done.get("snapshotsWritten")!=1:
    raise AssertionError("Existing lease did not complete after release")
print("PASS worker busy 55P03 retained lease with zero rows/receipts; exact same lease succeeded")

# An already committed one-shot receipt is replayable under RR after a
# binding change, whereas a fresh request is deliberately denied in RR.
query(f"UPDATE public.students SET lichess_username='LaterAtomicFixture' WHERE id='{a}';")
got=query(f"""BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE service_role;
 {call(keys[0])} ROLLBACK;""")
if json.loads(got)!={"replayed":True}:raise AssertionError(got)
query(f"UPDATE public.students SET lichess_username='AtomicFixture' WHERE id='{a}';")
print("PASS committed reviewed receipt replays in RR after binding drift")

# Existing whole-account deletion, after operator removes snapshot history
# as required by existing RESTRICT FK, cascades the teacher-owned claim.
erase_teacher="ad190000-0000-4000-8000-000000003001"
erase_student="ad190000-0000-4000-8000-000000003002"
erase_key="ad190000-0000-4000-8000-000000003003"
query(f"""INSERT INTO auth.users(id,email,aud,role) VALUES
 ('{erase_teacher}','synthetic-erasure-rating@example.com','authenticated','authenticated');
 INSERT INTO public.teachers(id,email,display_name) VALUES
 ('{erase_teacher}','synthetic-erasure-rating@example.com','Synthetic erasure rating');
 INSERT INTO public.students(id,teacher_id,name) VALUES('{erase_student}','{erase_teacher}','Synthetic erase subject');
 INSERT INTO public.student_rating_snapshots(teacher_id,student_id,provider,time_control,rating,source,observed_at,request_id)
 VALUES('{erase_teacher}','{erase_student}','lichess','rapid',1700,'teacher_manual','2026-01-01T12:00:00Z','{erase_key}');""")
if query(f"SELECT sealed FROM public.rating_snapshot_request_claims WHERE request_id='{erase_key}';")!="t":
    raise AssertionError("Erasure fixture did not own a sealed claim")
query(f"""DELETE FROM public.student_rating_snapshots WHERE teacher_id='{erase_teacher}';
 DELETE FROM auth.users WHERE id='{erase_teacher}';""")
if query(f"SELECT count(*) FROM public.rating_snapshot_request_claims WHERE request_id='{erase_key}';")!="1":
    raise AssertionError("Auth-identity-only removal unexpectedly deleted the tenant's claim")
query(f"DELETE FROM public.teachers WHERE id='{erase_teacher}';")
if query(f"SELECT count(*) FROM public.rating_snapshot_request_claims WHERE request_id='{erase_key}';")!="0":
    raise AssertionError("Whole-account removal left a claim")
print("PASS prior history cleanup plus whole-account removal cascades private claims")

print("PROOF_EPOCH="+epoch)
