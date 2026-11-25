#!/usr/bin/env python3
"""Concurrent report audience approval proof; disposable seeded stack only."""
import json
import subprocess
import sys
import time
import uuid

if len(sys.argv) != 3 or sys.argv[1] != "--disposable-only":
    raise SystemExit("Usage: report-seal-concurrency.py --disposable-only PSQL")
pg = [sys.argv[2], "-XqAt", "-v", "ON_ERROR_STOP=1"]
owner = "00000000-0000-0000-0000-000000000001"
learner = "10000000-0000-0000-0000-000000000001"

def query(sql):
    got = subprocess.run(pg, input=sql, text=True, capture_output=True, timeout=20)
    if got.returncode:
        raise AssertionError(got.stderr)
    return got.stdout.strip()

def write(p, sql):
    p.stdin.write(sql + "\n")
    p.stdin.flush()

def read_until(p, marker):
    out = []
    for line in p.stdout:
        if line.strip() == marker:
            return out
        if line.strip():
            out.append(line.strip())
    raise AssertionError("Did not reach " + marker + ": " + p.stderr.read())

def connection(label, role="authenticated"):
    p = subprocess.Popen(pg, text=True, stdin=subprocess.PIPE,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    write(p, f"""SET application_name='{label}'; BEGIN;
      SET LOCAL ROLE {role}; SET LOCAL statement_timeout='15s';
      SELECT set_config('request.jwt.claim.sub','{owner}',true);
      \\echo ready""")
    read_until(p, "ready")
    return p

def finish(p, action="COMMIT"):
    write(p, action + ";\n\\q")
    out, err = p.communicate(timeout=20)
    if p.returncode:
        raise AssertionError(err)
    return out.strip()

def confirm_wait(waiter, holder):
    for _ in range(70):
        if query(f"""SELECT count(*) FROM pg_stat_activity w JOIN pg_stat_activity h
        ON h.pid=ANY(pg_blocking_pids(w.pid))
        WHERE w.application_name='{waiter}' AND h.application_name='{holder}';""") == "1":
            return
        time.sleep(.08)
    raise AssertionError("Never observed lock wait")

import re

publication, selected = query("""SELECT p.id,g.id FROM public.report_publications p
 JOIN public.portal_access_grants g ON g.teacher_id=p.teacher_id AND g.student_id=p.student_id AND g.workplace_id=p.workplace_id
 WHERE g.token_digest=encode(sha256(convert_to(repeat('E',43),'UTF8')),'hex');""").split("|")
publication, selected = [str(uuid.UUID(v)) for v in (publication, selected)]
query(f"""INSERT INTO public.teacher_entitlement_grants(
 teacher_id,kind,capability_key,capability_kind,boolean_value,reason,request_id)
 VALUES('{owner}','capability_boost','reports.publish','boolean',true,'Disposable lock proof',gen_random_uuid());""")

for case,ch in (("same-request","G"),("rotated-while-waiting","H")):
    grant = str(uuid.UUID(query(f"""INSERT INTO public.portal_access_grants(
     teacher_id,student_id,workplace_id,contact_id,permissions,token_digest,issued_at,expires_at,revision)
     SELECT teacher_id,student_id,workplace_id,contact_id,permissions,
        encode(sha256(convert_to(repeat('{ch}',43),'UTF8')),'hex'),clock_timestamp(),expires_at,2
     FROM public.portal_access_grants WHERE id='{selected}' RETURNING id;""")))
    digest = query(f"""SET ROLE authenticated; SET request.jwt.claim.sub='{owner}';
     SELECT public.ccp_report_audience_review('{publication}','{grant}')->>'reviewDigest';""")
    assert re.fullmatch(r"[0-9a-f]{64}", digest)
    key = str(uuid.uuid4())
    approve = f"public.ccp_report_audience_approve('{publication}','{grant}','{digest}','{key}',true)"
    hl, wl = f"report-share-holder-{case}", f"report-share-waiter-{case}"
    holder = connection(hl, "postgres" if case.startswith("rotated") else "authenticated")
    waiter = connection(wl)
    try:
        if case == "same-request":
            write(holder,f"SELECT {approve};\n\\echo held")
            initial = json.loads(read_until(holder,"held")[-1])
            pending=f"SELECT {approve};"
        else:
            write(holder,f"""UPDATE public.portal_access_grants SET revision=revision+1,token_digest=NULL,issued_at=NULL
             WHERE id='{grant}';\n\\echo held""")
            read_until(holder,"held")
            pending=f"""DO $reject$ BEGIN PERFORM {approve}; RAISE EXCEPTION 'ROTATED_APPROVAL_WAS_ACCEPTED';
             EXCEPTION WHEN serialization_failure THEN
              IF SQLERRM<>'REPORT_AUDIENCE_REVIEW_STALE' THEN RAISE; END IF;
             END $reject$;"""
        write(waiter,pending+"\nCOMMIT;\n\\q")
        confirm_wait(wl,hl)
        finish(holder)
        out, err = waiter.communicate(timeout=20)
        if waiter.returncode:
            raise AssertionError(err)
        if case == "same-request":
            assert json.loads(out.strip())==initial
        expected = "1" if case == "same-request" else "0"
        assert query(f"""SELECT count(*) FROM public.report_publication_audiences
          WHERE teacher_id='{owner}' AND publication_id='{publication}' AND portal_grant_id='{grant}';""")==expected
        print("PASS",case,"actual lock wait; audience count",expected)
    finally:
        for p in (holder,waiter):
            if p.poll() is None:
                p.kill()
                p.wait()
