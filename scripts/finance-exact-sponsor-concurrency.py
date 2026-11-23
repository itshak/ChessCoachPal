#!/usr/bin/env python3
"""Test only against a unique disposable PostgreSQL project."""
from pathlib import Path
import subprocess
import sys
import time

if len(sys.argv) != 3 or sys.argv[1] != "--disposable-only":
    raise SystemExit("Usage: finance-exact-sponsor-concurrency.py --disposable-only PATH_TO_DISPOSABLE_PSQL")
pg = [sys.argv[2], "-XqAt", "-v", "ON_ERROR_STOP=1"]
teacher = "00000000-0000-0000-0000-000000000001"
pupil = "10000000-0000-0000-0000-000000000001"
fixture = Path(__file__).with_name("finance-exact-sponsor-synthetic.sql").read_text()
setup = fixture.split("GRANT SELECT ON sponsor_fixture", 1)[0] + "\nCOMMIT;\n"
subprocess.run(pg, input=setup, text=True, check=True)


def sponsor(n):
    return f"""
 SELECT public.ccp_compensation_exact_sponsor_commit(md5('sponsor-fixture-venue')::uuid,
   md5('sponsor-session:{n}')::uuid,'{pupil}',md5('sponsor-explicit-payer')::uuid,
   'per_session',9000,'USD','2050-02-10',NULL,NULL,md5('concurrent-sponsor:{n}')::uuid,true);
 """


def invoice(n):
    return f"""
 SELECT public.ccp_canonical_invoice_generation_commit('2050-02-10','2050-02-10',
   jsonb_build_array(jsonb_build_object('billingAccountId',md5('sponsor-default-payer')::uuid,
   'items',jsonb_build_array(jsonb_build_object('sessionId',md5('sponsor-session:{n}')::uuid,
    'studentId','{pupil}'::uuid,'kind','lesson','description','Synthetic ordinary invoice',
    'quantity',1,'unitCents',6000,'amountCents',6000)))),
   '[]',md5('concurrent-invoice:{n}')::uuid);
 """


def native_default(n):
    return f"""
 SELECT public.ccp_finance_post_obligation(md5('sponsor-broad-default')::uuid,1,6000,
   md5('sponsor-session:{n}')::uuid,'{pupil}','2050-02-10','2050-02-10',
   md5('concurrent-native:{n}')::uuid,true);
 """


def feed(p, text):
    assert p.stdin is not None
    p.stdin.write(text + "\n")
    p.stdin.flush()


def child(label, repeatable=False):
    p = subprocess.Popen(pg, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    feed(p, f"""SET application_name='{label}';
 BEGIN ISOLATION LEVEL {"REPEATABLE READ" if repeatable else "READ COMMITTED"};
 SET LOCAL statement_timeout='16s';
 SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.sub','{teacher}',true);
 SELECT count(*) FROM public.session_participants WHERE teacher_id='{teacher}';
 \\echo ready
 """)
    assert p.stdout is not None
    for line in p.stdout:
        if line.strip()=="ready":
            return p
    raise AssertionError("Could not establish disposable transaction")


def finish_waiting(waiter, winner):
    probe_sql = f"""
      SELECT count(*) FROM pg_stat_activity w JOIN pg_stat_activity b
       ON b.pid=ANY(pg_blocking_pids(w.pid))
       WHERE w.application_name='{waiter}' AND b.application_name='{winner}' AND w.wait_event_type='Lock';
    """
    for _ in range(40):
        observed = subprocess.run(pg, input=probe_sql, check=True, capture_output=True, text=True)
        if observed.stdout.strip()=="1":
            return
        time.sleep(0.08)
    raise AssertionError("Competing source did not block")


for n, winner_fn, loser_fn, rr, expected in [
    (6,sponsor,invoice,False,"EXACT_SPONSOR_REVIEW_REQUIRED"),
    (7,invoice,sponsor,False,"EXACT_SPONSOR_RETAINED_BILLING_SOURCE"),
    (8,sponsor,invoice,True,"40001"),
    (9,invoice,sponsor,False,"EXACT_SPONSOR_RETAINED_BILLING_SOURCE"),
    (10,sponsor,native_default,False,"EXACT_SPONSOR_REVIEW_REQUIRED"),
    (11,native_default,sponsor,False,"EXACT_AGREEMENT_ALREADY_POSTED"),
    (12,sponsor,native_default,True,"40001"),
]:
    winner_label, loser_label=f"sponsor-winner-{n}",f"sponsor-loser-{n}"
    w, l = child(winner_label,n==9), child(loser_label,rr)
    try:
        feed(w,winner_fn(n)+"\n\\echo applied")
        assert w.stdout is not None
        for line in w.stdout:
            if line.strip()=="applied":
                break
        else:
            raise AssertionError("Winning operation failed")
        if expected=="40001":
            handler="WHEN serialization_failure THEN NULL;"
        else:
            handler=f"WHEN check_violation THEN IF SQLERRM<>'{expected}' THEN RAISE; END IF;"
        sql=loser_fn(n).replace(" SELECT public."," PERFORM public.",1)
        feed(l,"DO $proof$ BEGIN "+sql+" RAISE EXCEPTION 'UNEXPECTED_WRITE'; EXCEPTION "+handler+" END; $proof$;\nROLLBACK;\n\\q")
        finish_waiting(loser_label,winner_label)
        feed(w,"COMMIT;\n\\q")
        for p in (w,l):
            out, err = p.communicate(timeout=20)
            if p.returncode:
                raise AssertionError(f"Unexpected operation failure: {err}")
        print(f"PASS case {n}; specific blocker observed; expected post-lock {expected}")
    finally:
        for p in (w,l):
            if p.poll() is None:
                p.kill()
                p.wait(timeout=10)

# A known exact receipt does not need a fresh-mutation isolation gate.
replay_check=f"""
 BEGIN ISOLATION LEVEL REPEATABLE READ;
 SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.sub','{teacher}',true);
 {sponsor(6).replace("SELECT public.ccp_compensation_exact_sponsor_commit", "SELECT (public.ccp_compensation_exact_sponsor_commit", 1).rstrip().removesuffix(";")})->>'replayed';
 {native_default(13)}
 COMMIT;
"""
rr=subprocess.run(pg,input=replay_check,check=True,capture_output=True,text=True)
if rr.stdout.splitlines()[1]!="true":
    raise AssertionError("Stored sponsor receipt did not replay in repeatable read")
print("PASS retained sponsor receipt and unrelated dated participant posting in repeatable read")

readback="""
 SELECT concat_ws(':',
   (SELECT count(*) FROM public.compensation_agreements WHERE exact_session_id IS NOT NULL),
   (SELECT count(*) FROM public.invoice_items WHERE session_id IN
      (md5('sponsor-session:7')::uuid,md5('sponsor-session:9')::uuid)),
   (SELECT count(*) FROM public.invoice_items WHERE session_id IN
      (md5('sponsor-session:6')::uuid,md5('sponsor-session:8')::uuid)),
   (SELECT count(*) FROM public.session_participants WHERE sponsor_billing_review_required),
   (SELECT count(*) FROM public.financial_obligations WHERE session_id IN
      (md5('sponsor-session:11')::uuid,md5('sponsor-session:13')::uuid)),
   (SELECT count(*) FROM public.financial_obligations WHERE session_id IN
      (md5('sponsor-session:10')::uuid,md5('sponsor-session:12')::uuid)));
"""
out=subprocess.run(pg,input=readback,check=True,capture_output=True,text=True).stdout.strip()
if out!="4:2:0:4:2:0":
    raise AssertionError(f"Synthetic winner-only state mismatched: {out}")
