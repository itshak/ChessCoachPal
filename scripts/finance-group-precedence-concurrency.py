#!/usr/bin/env python3
"""Signed READ COMMITTED ordering proof. Use only the disposable PSQL wrapper."""
from pathlib import Path
import subprocess
import sys
import time

if len(sys.argv) != 3 or sys.argv[1] != "--disposable-only":
    raise SystemExit("Usage: finance-group-precedence-concurrency.py --disposable-only PSQL")
pg = [sys.argv[2], "-XqAt", "-v", "ON_ERROR_STOP=1"]
teacher = "00000000-0000-0000-0000-000000000001"
setup = Path(__file__).with_name("finance-group-precedence-synthetic.sql").read_text().split("GRANT SELECT ON group_scope_fixture", 1)[0]
subprocess.run(pg, input=setup + """
UPDATE public.compensation_agreements SET status='archived'
 WHERE id=md5('gf-scope')::uuid;
INSERT INTO public.compensation_agreements(id,teacher_id,workplace_id,group_id,billing_account_id,
 agreement_role,model,rate_cents,currency,effective_from,effective_to)
 SELECT md5('gf-archive-peer')::uuid,teacher,site,peer,payer,'coach_earning',
  'per_session',20000,'USD',anchor_day,anchor_day FROM group_scope_fixture;
COMMIT;
""", text=True, check=True)

def post(label, occurrence, day):
    return f"""public.ccp_finance_post_obligation(md5('gf-workplace')::uuid,1,10000,
      md5('gf-lesson-{occurrence}')::uuid,NULL,'{day}','{day}',md5('gf-race-{label}')::uuid,true)"""

def group_terms(label, day):
    return f"""INSERT INTO public.compensation_agreements(id,teacher_id,workplace_id,group_id,billing_account_id,
      agreement_role,model,rate_cents,currency,effective_from,effective_to)
      VALUES(md5('gf-race-group-{label}')::uuid,'{teacher}',md5('gf-site')::uuid,
       md5('gf-group')::uuid,md5('gf-payer')::uuid,'coach_earning','per_session',20000,'USD','{day}','{day}');"""

def feed(process, command):
    process.stdin.write(command + "\n")
    process.stdin.flush()

def ready(process, marker):
    for line in process.stdout:
        if line.strip() == marker:
            return
    raise AssertionError(f"Disposable transaction exited before {marker}: {process.stderr.read()}")

def child(label,repeatable=False):
    p = subprocess.Popen(pg, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    isolation=" ISOLATION LEVEL REPEATABLE READ" if repeatable else ""
    feed(p, f"""SET application_name='{label}'; BEGIN{isolation}; SET LOCAL ROLE authenticated;
SET LOCAL statement_timeout='12s'; SELECT set_config('request.jwt.claim.sub','{teacher}',true);
SELECT count(*) FROM public.compensation_agreements;
\\echo ready""")
    ready(p, "ready")
    return p

def wait_order(case, first, second, reject_second=False, repeatable_writer=False):
    labels = [f"gf-race-{case}-{x}" for x in ["winner","waiter"]]
    winner, waiter = child(labels[0]), child(labels[1],repeatable_writer)
    try:
        feed(winner, first + "\n\\echo applied")
        ready(winner, "applied")
        if reject_second:
            second = f"""DO $proof$ BEGIN {second}
             RAISE EXCEPTION 'Wrong broad approval';
             EXCEPTION WHEN check_violation THEN
               IF SQLERRM<>'GROUP_AGREEMENT_REVIEW_REQUIRED' THEN RAISE; END IF;
             END; $proof$;"""
        feed(waiter, second + "\nCOMMIT;\n\\q")
        for _ in range(50):
            r = subprocess.run(pg, input=f"""SELECT count(*) FROM pg_stat_activity waiting
             JOIN pg_stat_activity winning ON winning.pid=ANY(pg_blocking_pids(waiting.pid))
              WHERE waiting.application_name='{labels[1]}' AND winning.application_name='{labels[0]}';""",
               stdout=subprocess.PIPE, text=True, check=True)
            if r.stdout.strip() == "1":
                break
            time.sleep(.08)
        else:
            raise AssertionError(f"{case}: did not observe a selected blocking wait")
        feed(winner, "COMMIT;\n\\q")
        for p in (winner, waiter):
            _, err=p.communicate(timeout=16)
            if p.returncode:
                raise AssertionError(err)
        print(f"PASS {case}: observed blocked wait and winner order")
    finally:
        for p in (winner,waiter):
            if p.poll() is None:
                p.kill()
                p.wait(timeout=10)

first_day, second_day = "2059-12-01", "2059-12-02"
wait_order("terms-first",group_terms("terms-first",first_day),
  f"PERFORM {post('terms-first','opening',first_day)};",True)
wait_order("broad-first",f"SELECT {post('broad-first','inclusive-end',second_day)};",
  group_terms("broad-first",second_day))
wait_order("archive-first",
  "UPDATE public.compensation_agreements SET status='archived',revision=revision+1 WHERE id=md5('gf-archive-peer')::uuid;",
  f"SELECT {post('archive-first','other-group',first_day)};")

# The inherited direct authenticated terms endpoint uses advisory locking plus
# MVCC overlap reads. A repeatable-read writer begun beforehand can retain its
# old view after the lock; prove the fresh posting fence refuses both choices.
ambiguous_day="2059-12-03"
wait_order("preexisting-rr-ambiguity",group_terms("rr-winner",ambiguous_day),
 group_terms("rr-stale",ambiguous_day),repeatable_writer=True)
ambiguity = subprocess.run(pg,input=f"""
SELECT count(*) FROM public.compensation_agreements WHERE group_id=md5('gf-group')::uuid
 AND effective_from='{ambiguous_day}' AND status='active';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','{teacher}',true);
DO $proof$ BEGIN
 BEGIN
  PERFORM {post('ambiguous-broad','day-after',ambiguous_day)};
  RAISE EXCEPTION 'Broad fallback accepted ambiguous group authority';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'GROUP_AGREEMENT_REVIEW_REQUIRED' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ccp_finance_post_obligation(md5('gf-race-group-rr-winner')::uuid,1,20000,
   md5('gf-lesson-day-after')::uuid,NULL,'{ambiguous_day}','{ambiguous_day}',
   md5('gf-rr-ambiguous-group-approval')::uuid,true);
  RAISE EXCEPTION 'Selected group term accepted competing applicable group authority';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'GROUP_AGREEMENT_REVIEW_REQUIRED' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.financial_obligations WHERE session_id=md5('gf-lesson-day-after')::uuid)
 THEN RAISE EXCEPTION 'Ambiguous source persisted'; END IF;
END; $proof$;
ROLLBACK;
""",stdout=subprocess.PIPE,text=True,check=True)
if ambiguity.stdout.splitlines() != ["2",teacher]:
    raise AssertionError(ambiguity.stdout)
print("PASS preexisting raw repeatable-read ambiguity exists and fresh approval held both scopes")
result = subprocess.run(pg,input=f"""
SELECT concat_ws(':',
 (SELECT count(*) FROM public.financial_obligations WHERE session_id=md5('gf-lesson-opening')::uuid),
 (SELECT amount_cents FROM public.financial_obligations WHERE session_id=md5('gf-lesson-inclusive-end')::uuid),
 (SELECT amount_cents FROM public.financial_obligations WHERE session_id=md5('gf-lesson-other-group')::uuid));
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','{teacher}',true);
SELECT ({post('broad-first','inclusive-end',second_day)})->>'replayed';
DO $proof$ BEGIN PERFORM {post('rr-fresh','inclusive-end',second_day)};
 RAISE EXCEPTION 'Fresh issuance entered repeatable read';
 EXCEPTION WHEN serialization_failure THEN
  IF SQLERRM<>'EXACT_AGREEMENT_READ_COMMITTED_REQUIRED' THEN RAISE; END IF;
END; $proof$;
ROLLBACK;
""",stdout=subprocess.PIPE,text=True,check=True)
if result.stdout.splitlines() != ["0:10000:10000",teacher,"true"]:
    raise AssertionError(result.stdout)
print("PASS final 0:10000:10000 and old exact replay inside repeatable read")
