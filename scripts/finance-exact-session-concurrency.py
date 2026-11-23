#!/usr/bin/env python3
"""Disposable synthetic PostgreSQL only. Invoke with an isolated psql launcher.

The launcher must not accept a production database. For local Compose boot,
launch pg tools with the unique synthetic project selected in runner arguments.
"""
from pathlib import Path
import subprocess
import sys
import time

if len(sys.argv) != 3 or sys.argv[1] != "--disposable-only":
    raise SystemExit("Usage: finance-exact-session-concurrency.py --disposable-only PATH_TO_DISPOSABLE_PSQL")
pg = [sys.argv[2], "-XqAt", "-v", "ON_ERROR_STOP=1"]
teacher = "00000000-0000-0000-0000-000000000001"
fixture = Path(__file__).with_name("finance-exact-session-compensation-synthetic.sql").read_text()
setup = fixture.split("GRANT SELECT ON compensation_exact_fixture", 1)[0] + "\nCOMMIT;\n"
subprocess.run(pg, input=setup, text=True, check=True)


def ordinary_insert(n):
    return f"""
    INSERT INTO public.compensation_agreements(teacher_id,workplace_id,exact_session_id,
      billing_account_id,agreement_role,model,rate_cents,currency,effective_from,effective_to)
    SELECT teacher_id,workplace_id,md5('exact-compensation-session:{n}')::uuid,
      billing_account_id,'coach_earning','hourly',14000,currency,'2052-02-10','2052-02-10'
      FROM public.compensation_agreements WHERE id=md5('exact-compensation-broad')::uuid;
    """


def broad_post(n):
    return f"""
    SELECT public.ccp_finance_post_obligation(md5('exact-compensation-broad')::uuid,1,18000,
      md5('exact-compensation-session:{n}')::uuid,NULL,
      '2052-02-10','2052-02-10',md5('exact-concurrency-broad:{n}')::uuid,true);
    """


def expect_error(statement, expected):
    return f"""
    DO $test$
    BEGIN
      {statement.replace("SELECT public.", "PERFORM public.", 1).strip()}
      RAISE EXCEPTION 'UNEXPECTED_COMPENSATION_COMMIT';
    EXCEPTION WHEN check_violation OR insufficient_privilege THEN
      IF SQLERRM<>'{expected}' THEN RAISE; END IF;
    END;
    $test$;
    """


def child(application):
    p = subprocess.Popen(pg, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    feed(p, f"""
SET application_name='{application}';
BEGIN;
SET LOCAL statement_timeout='15s';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','{teacher}',true);
""")
    return p


def feed(p, sql):
    assert p.stdin is not None
    p.stdin.write(sql + "\n")
    p.stdin.flush()


def confirm_ready(p):
    assert p.stdout is not None
    for line in p.stdout:
        if line.strip() == "winner-ready":
            return
    raise AssertionError("Could not obtain winning transaction lock")


def confirm_waiter(name, winner, event):
    query = f"""
        SELECT count(*) FROM pg_catalog.pg_stat_activity waiting
        JOIN pg_catalog.pg_stat_activity blocker
          ON blocker.pid=ANY(pg_catalog.pg_blocking_pids(waiting.pid))
        WHERE waiting.application_name='{name}' AND blocker.application_name='{winner}'
          AND waiting.wait_event_type='Lock' AND waiting.wait_event {event};
    """
    for _ in range(50):
        probe = subprocess.run(pg, input=query, capture_output=True, text=True, check=True)
        if probe.stdout.strip() == "1":
            return
        time.sleep(0.08)
    raise AssertionError("Competing transaction never blocked on reviewed scope lock")


def prove_order(win, lose, expected, suffix, event):
    winner = "ccp-compensation-winner-" + suffix
    waiter = "ccp-compensation-waiter-" + suffix
    w = child(winner)
    other = None
    try:
        feed(w, win + "\n\\echo winner-ready")
        confirm_ready(w)
        other = child(waiter)
        ending = "COMMIT;" if expected is None else "ROLLBACK;"
        feed(other, (lose if expected is None else expect_error(lose, expected)) + "\n" + ending + "\n\\q")
        confirm_waiter(waiter, winner, event)
        feed(w, "COMMIT;\n\\q")
        for p in [w, other]:
            out, err = p.communicate(timeout=20)
            if p.returncode != 0:
                raise AssertionError(f"Unexpected transaction failure: {err}")
        print(f"PASS {suffix}; competing transaction waited for the winner, then {expected or 'committed'}")
    finally:
        for p in [w, other]:
            if p is not None and p.poll() is None:
                p.kill()
                p.wait(timeout=10)


prove_order(ordinary_insert(3), broad_post(3), "EXACT_AGREEMENT_REVIEW_REQUIRED", "exact-first", "= 'advisory'")
prove_order(broad_post(5), ordinary_insert(5), "EXACT_AGREEMENT_ALREADY_POSTED", "broad-first", "= 'advisory'")


def exact_post(n):
    return f"""
    SELECT public.ccp_finance_post_obligation(
      (SELECT id FROM public.compensation_agreements
        WHERE exact_session_id=md5('exact-compensation-session:{n}')::uuid),
      1,21000,md5('exact-compensation-session:{n}')::uuid,NULL,
      '2052-02-10','2052-02-10',md5('exact-resource-exact:{n}')::uuid,true);
    """


def account_status(status):
    return f"""
    UPDATE public.billing_accounts SET status='{status}',revision=revision+1
       WHERE id=md5('exact-compensation-payer')::uuid;
    """


def authorized_sql(statement):
    subprocess.run(pg, input=f"""
    BEGIN; SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub','{teacher}',true);
    {statement}
    COMMIT;
    """, check=True, capture_output=True, text=True)


row_wait = "IN ('transactionid','tuple')"
authorized_sql(ordinary_insert(6) + ordinary_insert(7))
prove_order(exact_post(6), account_status("archived"), None, "exact-before-archive", row_wait)
authorized_sql(account_status("active"))
prove_order(account_status("archived"), exact_post(7), "BILLING_ACCOUNT_NOT_ACTIVE_OR_OWNED", "archive-before-exact", row_wait)
readback = """
SELECT concat_ws(':',
  (SELECT count(*) FROM public.compensation_agreements WHERE exact_session_id=md5('exact-compensation-session:3')::uuid),
  (SELECT count(*) FROM public.financial_obligations WHERE session_id=md5('exact-compensation-session:3')::uuid),
  (SELECT count(*) FROM public.compensation_agreements WHERE exact_session_id=md5('exact-compensation-session:5')::uuid),
  (SELECT count(*) FROM public.financial_obligations WHERE session_id=md5('exact-compensation-session:5')::uuid),
  (SELECT count(*) FROM public.received_payments WHERE billing_account_id=md5('exact-compensation-payer')::uuid),
  (SELECT count(*) FROM public.financial_obligations WHERE session_id=md5('exact-compensation-session:6')::uuid AND amount_cents=21000),
  (SELECT count(*) FROM public.financial_obligations WHERE session_id=md5('exact-compensation-session:7')::uuid));
"""
check = subprocess.run(pg, input=readback, capture_output=True, text=True, check=True)
if check.stdout.strip() != "1:0:0:1:0:1:0":
    raise AssertionError("Competing operation side effects did not match winner only")
