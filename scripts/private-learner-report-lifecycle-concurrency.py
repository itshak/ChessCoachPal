#!/usr/bin/env python3
"""Concurrent whole-report lifecycle proof; disposable seeded stack only."""
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
scope, local_day, grant = query(f"""SELECT p.workplace_id,
 p0.candidate->>'from',g.id FROM public.report_publications p
 JOIN public.report_publication_snapshots p0 ON p0.publication_id=p.id AND p0.teacher_id=p.teacher_id
 JOIN public.portal_access_grants g ON g.teacher_id=p.teacher_id AND g.student_id=p.student_id AND g.workplace_id=p.workplace_id
 WHERE p.teacher_id='{owner}' AND p.output_locale='ru'
   AND g.token_digest=encode(sha256(convert_to(repeat('E',43),'UTF8')),'hex');""").split("|")
scope, grant=[str(uuid.UUID(x)) for x in (scope,grant)]
from datetime import date
local_day=date.fromisoformat(local_day).isoformat()
auth_header=f"""SET ROLE authenticated; SET request.jwt.claim.sub='{owner}';"""
query(f"""INSERT INTO public.teacher_entitlement_grants(
 teacher_id,kind,capability_key,capability_kind,boolean_value,reason,request_id)
 VALUES('{owner}','capability_boost','reports.publish','boolean',true,'Disposable lifecycle lock proof',gen_random_uuid());""")

def make_report(locale):
    seal_digest=query(auth_header+f"""SELECT public.ccp_private_report_review('{learner}','{scope}',
     '{local_day}','{local_day}','{locale}')->>'reviewDigest';""")
    assert re.fullmatch(r"[0-9a-f]{64}",seal_digest)
    return str(uuid.UUID(query(auth_header+f"""SELECT public.ccp_private_report_seal('{learner}','{scope}',
     '{local_day}','{local_day}','{locale}','{seal_digest}','{uuid.uuid4()}',true)->>'publicationId';""")))

for case, annotation in (("same-request","en"),("audience-wins","he")):
    publication=make_report(annotation)
    new_report=make_report("ru") if case=="audience-wins" else None
    arg="NULL" if new_report is None else f"'{new_report}'"
    digest=query(auth_header+f"""SELECT public.ccp_private_report_lifecycle_review('{publication}',{arg})->>'reviewDigest';""")
    assert re.fullmatch(r"[0-9a-f]{64}",digest)
    key=str(uuid.uuid4())
    lifecycle=f"public.ccp_private_report_lifecycle_commit('{publication}',{arg},'{digest}','{key}',true)"
    hl, wl=f"lifecycle-holder-{case}",f"lifecycle-waiter-{case}"
    holder,waiter=connection(hl),connection(wl)
    try:
        if case=="same-request":
            write(holder,f"SELECT {lifecycle};\n\\echo held")
            initial=json.loads(read_until(holder,"held")[-1])
            pending=f"SELECT {lifecycle};"
        else:
            write(holder,f"""SELECT public.ccp_report_audience_approve('{publication}','{grant}',
             public.ccp_report_audience_review('{publication}','{grant}')->>'reviewDigest','{uuid.uuid4()}',true);
             \n\\echo held""")
            read_until(holder,"held")
            pending=f"""DO $reject$ BEGIN PERFORM {lifecycle}; RAISE EXCEPTION 'STALE_LIFECYCLE_WAS_ACCEPTED';
             EXCEPTION WHEN serialization_failure THEN
              IF SQLERRM<>'REPORT_LIFECYCLE_STALE' THEN RAISE; END IF;
             END $reject$;"""
        write(waiter,pending+"\nCOMMIT;\n\\q")
        confirm_wait(wl,hl)
        finish(holder)
        out,err=waiter.communicate(timeout=20)
        if waiter.returncode:
            raise AssertionError(err)
        if case=="same-request":
            assert json.loads(out.strip())==initial and initial["status"]=="revoked"
        expected="2|1|0" if case=="same-request" else "1|0|1"
        assert query(f"""SELECT p.revision,
          (SELECT count(*) FROM public.agent_tool_receipts r WHERE r.teacher_id=p.teacher_id AND r.idempotency_key='{key}'),
          (SELECT count(*) FROM public.report_publication_audiences a WHERE a.teacher_id=p.teacher_id AND a.publication_id=p.id)
         FROM public.report_publications p WHERE p.teacher_id='{owner}' AND p.id='{publication}';""")==expected
        print("PASS",case,"actual lock wait and independently verified terminal or unchanged state")
    finally:
        for proc in (holder,waiter):
            if proc.poll() is None:
                proc.kill()
                proc.wait()
