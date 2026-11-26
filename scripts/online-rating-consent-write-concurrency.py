#!/usr/bin/env python3
"""Synthetic isolated PostgreSQL opt-in atomicity and real lock contention proof."""
import json
import re
import subprocess
import sys

if len(sys.argv)!=3 or sys.argv[1]!="--disposable-only":
    raise SystemExit("expected disposable psql wrapper")
if not re.fullmatch(r"[a-f0-9]{64}",sys.argv[2]):
    raise SystemExit("expected exact isolated container ID")
labels=subprocess.check_output([
    "sudo","-n","docker","inspect","--format",
    '{{index .Config.Labels "com.docker.compose.project"}}:{{index .Config.Labels "com.docker.compose.service"}}',
    sys.argv[2]
],text=True,timeout=10).strip()
if not re.fullmatch(r"ccpratingarchive[0-9]+:db",labels):
    raise SystemExit("expected an isolated rating regression Compose database")
pg=["sudo","-n","docker","exec","-i","-e","PGOPTIONS=-c ccp.rating_synthetic=disposable",
    sys.argv[2],"psql","-U","postgres","-d","postgres","-XqAt","-v","ON_ERROR_STOP=1"]
owner="00000000-0000-0000-0000-000000000001"
a,b=[f"ad360000-0000-4000-8000-00000000001{i}" for i in (1,2)]
k1,k2=[f"ad360000-0000-4000-8000-00000000002{i}" for i in (1,2)]
def query(sql):
    r=subprocess.run(pg,input=sql,text=True,capture_output=True,timeout=18)
    if r.returncode: raise AssertionError(r.stderr)
    return r.stdout.strip()
if query("SELECT current_setting('ccp.rating_synthetic',true);")!="disposable":
    raise AssertionError("missing disposable target marker")
query(f"""INSERT INTO public.students(id,teacher_id,name,lichess_username) VALUES
 ('{a}','{owner}','Synthetic consent contender','SyntheticA'),
 ('{b}','{owner}','Synthetic consent failure injection','SyntheticA');""")
epochs={sid:query(f"SELECT online_rating_binding_epoch FROM public.students WHERE id='{sid}'") for sid in (a,b)}
def invoke(sid,key):
    return f"public.ccp_online_rating_consent_apply('{owner}','{sid}','lichess','SyntheticA','{epochs[sid]}',0,true,'{key}')"
def counts(sid):
    return query(f"""SELECT
  (SELECT count(*) FROM public.student_rating_sync_consents WHERE student_id='{sid}')
   || ':' || (SELECT count(*) FROM public.student_rating_refresh_jobs WHERE student_id='{sid}');""")
def actor_query(sql):
    return query("BEGIN; SET LOCAL ROLE service_role; SET LOCAL statement_timeout='12s';\n"+sql+"\nCOMMIT;")
p=subprocess.Popen(pg,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
def feed(s):
    p.stdin.write(s+"\n")
    p.stdin.flush()
try:
    feed("BEGIN; SET LOCAL ROLE service_role; SET LOCAL statement_timeout='12s';")
    feed(f"SELECT {invoke(a,k1)};")
    first=json.loads(p.stdout.readline())
    assert first["status"]=="accepted" and first["replayed"] is False,first
    assert counts(a)=="0:0"
    actor_query(f"""DO $check$ BEGIN
      PERFORM {invoke(a,k1)};
      RAISE EXCEPTION 'Competing transaction unexpectedly reached consent';
     EXCEPTION WHEN lock_not_available THEN
      IF SQLERRM<>'RATING_CONSENT_CONTEXT_BUSY' THEN RAISE; END IF;
     END $check$;""")
    assert counts(a)=="0:0"
    feed("COMMIT;")
    feed("\\q")
    _,err=p.communicate(timeout=14)
    assert p.returncode==0,err
    replay=json.loads(actor_query(f"SELECT {invoke(a,k1)};"))
    assert replay=={**first,"replayed":True},replay
    assert counts(a)=="1:1"
finally:
    if p.poll() is None: p.kill();p.wait()
print("PASS duplicate contender returns typed retry, then same job; no partial or duplicate state")

failure=actor_query(f"""
 CREATE TEMP TABLE fixture_only(id int);
 -- A deterministic failure at the second write, under real constraints.
 SET LOCAL ROLE postgres;
 ALTER TABLE public.student_rating_refresh_jobs ADD CONSTRAINT synthetic_reject_first_job
 CHECK (student_id <> '{b}') NOT VALID;
 SET LOCAL ROLE service_role;
 DO $check$ BEGIN
   PERFORM {invoke(b,k2)};
   RAISE EXCEPTION 'Expected synthetic queue constraint failure';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM NOT LIKE '%synthetic_reject_first_job%' THEN RAISE; END IF;
 END $check$;
 SET LOCAL ROLE postgres;
 ALTER TABLE public.student_rating_refresh_jobs DROP CONSTRAINT synthetic_reject_first_job;
""")
assert not failure and counts(b)=="0:0",failure
assert json.loads(actor_query(f"SELECT {invoke(b,k2)};"))["status"]=="accepted"
assert counts(b)=="1:1"
print("PASS queue INSERT refusal rolls back permission; exact retry creates one consent and one job")
