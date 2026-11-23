#!/usr/bin/env python3
"""Controlled RC contention. Call only through isolated PG fixture wrapper."""
from pathlib import Path
import subprocess
import sys
import time

if len(sys.argv) != 3 or sys.argv[1] != "--disposable-only":
    raise SystemExit("Usage: finance-private-series-concurrency.py --disposable-only PATH_TO_DISPOSABLE_PSQL")
pg = [sys.argv[2], "-XqAt", "-v", "ON_ERROR_STOP=1"]
teacher = "00000000-0000-0000-0000-000000000001"
student = "10000000-0000-0000-0000-000000000001"
setup = Path(__file__).with_name("finance-private-series-synthetic.sql").read_text().split("GRANT SELECT ON pv", 1)[0]
subprocess.run(pg, input=setup + """
INSERT INTO public.teaching_sessions(id,teacher_id,student_id,workplace_id,title,
 starts_at,duration_minutes,status,slot_id,slot_occurrence_date,local_timezone)
 SELECT md5('series-race-root-lesson')::uuid,teacher,student,venue,'Synthetic RC series root',
 (lesson_on+time '10:00') AT TIME ZONE 'UTC',60,'completed',root,lesson_on,'UTC' FROM pv
 UNION ALL
 SELECT md5('series-race-independent-lesson')::uuid,teacher,student,venue,'Synthetic RC independent root',
 (lesson_on+time '13:00') AT TIME ZONE 'UTC',60,'completed',unrelated,lesson_on,'UTC' FROM pv;
INSERT INTO public.session_attendance(teacher_id,session_id,student_id,status,marked_at)
 SELECT teacher_id,id,student_id,'present',clock_timestamp() FROM public.teaching_sessions
 WHERE id IN(md5('series-race-root-lesson')::uuid,md5('series-race-independent-lesson')::uuid);
COMMIT;
""", text=True, check=True)

def statement(kind, scope):
    if kind == "terms":
        return f"""public.ccp_private_series_compensation_commit(md5('series-fixture-site')::uuid,
          md5('series-fixture-{({'root':'root','unrelated':'unrelated-root'})[scope]}')::uuid,md5('series-fixture-payer')::uuid,'per_session',
          20000,'USD','2059-12-01','2059-12-22',NULL,NULL,md5('series-race-terms-{scope}')::uuid,true)"""
    return f"""public.ccp_finance_post_obligation(md5('series-fixture-broad')::uuid,1,10000,
      md5('series-race-{({'root':'root','unrelated':'independent'})[scope]}-lesson')::uuid,NULL,
      '2059-12-01','2059-12-01',md5('series-race-post-{scope}')::uuid,true)"""

def feed(process, cmd):
    process.stdin.write(cmd + "\n")
    process.stdin.flush()

def ready(process, marker):
    for line in process.stdout:
        if line.strip() == marker:
            return
    raise AssertionError("Disposable transaction exited before " + marker)

def child(label):
    p = subprocess.Popen(pg, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    feed(p, f"""SET application_name='{label}'; BEGIN; SET LOCAL ROLE authenticated;
SET LOCAL statement_timeout='15s'; SELECT set_config('request.jwt.claim.sub','{teacher}',true);
\\echo ready""")
    ready(p, "ready")
    return p

for scope, first, second in [("root", "terms", "broad"), ("unrelated", "broad", "terms")]:
    wlabel, llabel = ("series-case-w-" + scope), ("series-case-l-" + scope)
    w, l = child(wlabel), child(llabel)
    try:
        feed(w, f"SELECT {statement(first,scope)};\n\\echo applied")
        ready(w, "applied")
        body = f"SELECT {statement(second,scope)};\nCOMMIT;"
        if second == "broad":
            body = f"""DO $proof$ BEGIN PERFORM {statement(second,scope)};
              RAISE EXCEPTION 'Wrong broad rate: scope winner ignored';
              EXCEPTION WHEN check_violation THEN
                IF SQLERRM<>'PRIVATE_SERIES_AGREEMENT_REVIEW_REQUIRED' THEN RAISE; END IF;
              END; $proof$; ROLLBACK;"""
        feed(l, body + "\n\\q")
        for _ in range(50):
            result = subprocess.run(pg, input=f"""SELECT count(*) FROM pg_stat_activity wait
              JOIN pg_stat_activity win ON win.pid=ANY(pg_blocking_pids(wait.pid))
              WHERE wait.application_name='{llabel}' AND win.application_name='{wlabel}';""",
                stdout=subprocess.PIPE, text=True, check=True)
            if result.stdout.strip() == "1":
                break
            time.sleep(.08)
        else:
            raise AssertionError("Expected scope lock contention was not observed")
        feed(w, "COMMIT;\n\\q")
        for p in (w,l):
            _, err = p.communicate(timeout=18)
            if p.returncode:
                raise AssertionError(err)
        print(f"PASS {scope}: {first} commit before {second}; checked locus")
    finally:
        for p in (w,l):
            if p.poll() is None:
                p.kill()
                p.wait(timeout=10)

sql = """SELECT concat_ws(':',
  (SELECT count(*) FROM public.compensation_agreements WHERE private_series_id IS NOT NULL),
  (SELECT count(*) FROM public.financial_obligations WHERE session_id=md5('series-race-root-lesson')::uuid),
  (SELECT amount_cents FROM public.financial_obligations WHERE session_id=md5('series-race-independent-lesson')::uuid));"""
result = subprocess.run(pg,input=sql,stdout=subprocess.PIPE,text=True,check=True)
if result.stdout.strip() != "2:0:10000":
    raise AssertionError("Wrong durable financial winner: " + result.stdout)
