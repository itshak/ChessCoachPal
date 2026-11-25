#!/usr/bin/env python3
"""Prove revocation/cancellation lock order on an explicit disposable seeded database."""
import json
import re
import secrets
import subprocess
import sys
import time
import uuid

if len(sys.argv) != 3 or sys.argv[1] != "--disposable-only":
    raise SystemExit("Usage: portal-revocation-concurrency.py --disposable-only PSQL_WRAPPER")
pg = [sys.argv[2], "-XqAt", "-v", "ON_ERROR_STOP=1"]
owner = "00000000-0000-0000-0000-000000000001"
student = "10000000-0000-0000-0000-000000000001"
contact = "50000000-0000-0000-0000-000000000001"


def query(sql):
    row = subprocess.run(pg, input=sql, text=True, capture_output=True, timeout=22)
    if row.returncode:
        raise AssertionError("Unexpected fixture SQL failure: " + row.stderr)
    return row.stdout.strip()


def send(process, sql):
    process.stdin.write(sql + "\n")
    process.stdin.flush()


def until(process, marker):
    output = []
    for line in process.stdout:
        value = line.strip()
        if value == marker:
            return output
        if value:
            output.append(value)
    raise AssertionError("Unexpected transaction failure before " + marker)


def connection(label, role):
    process = subprocess.Popen(pg, text=True, stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    send(process, f"""SET application_name='{label}'; BEGIN;
    SET LOCAL ROLE {role}; SET LOCAL statement_timeout='18s';
    SELECT set_config('request.jwt.claim.sub','{owner}',true);
    \\echo ready""")
    until(process, "ready")
    return process


def collect(process):
    out, err = process.communicate(timeout=22)
    if process.returncode:
        raise AssertionError("Unexpected competing transaction failure: " + err)
    return out.strip()


def waiting(leader, follower):
    for _ in range(55):
        if query(f"""SELECT count(*) FROM pg_stat_activity waiting
          JOIN pg_stat_activity holding ON holding.pid=ANY(pg_blocking_pids(waiting.pid))
          WHERE waiting.application_name='{follower}'
          AND holding.application_name='{leader}';""") == "1":
            return
        time.sleep(0.08)
    raise AssertionError("Did not observe the expected actual row-lock wait")


def must_deny(call):
    return f"""DO $assert$ BEGIN
      PERFORM {call};
      RAISE EXCEPTION 'Expected the revoked grant to deny cancellation';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM<>'PORTAL_NOT_FOUND' THEN RAISE; END IF;
    END $assert$;"""


def check_scope():
    acquired = query(f"""
    SELECT CASE WHEN current_setting('chesscoachpal.disposable_portal_check',true)='yes'
      AND (SELECT count(*) FROM auth.users)=1
      AND EXISTS (SELECT 1 FROM auth.users WHERE id='{owner}' AND email='teacher@example.com')
      AND EXISTS (SELECT 1 FROM public.student_contacts WHERE teacher_id='{owner}'
        AND student_id='{student}' AND contact_id='{contact}' AND active_to IS NULL)
      AND NOT EXISTS (SELECT 1 FROM storage.objects)
      THEN 'synthetic-only' ELSE 'refuse' END;""")
    if acquired != "synthetic-only":
        raise SystemExit("This proof requires its own disposable synthetic seed database.")


def make_fixture(index):
    session, grant = (str(uuid.uuid4()) for _ in range(2))
    token = secrets.token_urlsafe(32)
    assert re.fullmatch(r"[A-Za-z0-9_-]{43}", token)
    query(f"""BEGIN;
    INSERT INTO public.teaching_sessions
      (id,teacher_id,workplace_id,student_id,title,starts_at,duration_minutes,local_timezone)
    SELECT '{session}','{owner}',id,'{student}','Synthetic revoke contention',
      date_trunc('day',clock_timestamp()) + interval '{72+index} days' + interval '12 hours',40,'UTC'
    FROM public.workplaces WHERE teacher_id='{owner}' AND kind='personal';
    DO $roster$ BEGIN
      IF (SELECT count(*) FROM public.session_participants
          WHERE teacher_id='{owner}' AND session_id='{session}' AND student_id='{student}')<>1
      THEN RAISE EXCEPTION 'Expected one canonical frozen participant'; END IF;
    END $roster$;
    INSERT INTO public.portal_access_grants
      (id,teacher_id,contact_id,student_id,workplace_id,permissions,token_digest,issued_at,expires_at,revision)
    SELECT '{grant}','{owner}','{contact}','{student}',workplace_id,ARRAY['cancel'],
      encode(extensions.digest('{token}','sha256'),'hex'),clock_timestamp(),
      clock_timestamp()+interval '1 day',2
    FROM public.teaching_sessions WHERE id='{session}';
    COMMIT;""")
    cancel = f"public.ccp_scoped_portal_cancel('{token}','{session}','{student}','Synthetic confirmation')"
    revoke = f"""UPDATE public.portal_access_grants SET revoked_at=clock_timestamp(),
       revision=3, token_digest=NULL WHERE id='{grant}' AND teacher_id='{owner}'
       AND revision=2 AND revoked_at IS NULL RETURNING 'revoked';"""
    return session, grant, cancel, revoke


def proof(case, index):
    session, grant, cancel, revoke = make_fixture(index)
    leader_name, follower_name = f"portal-lock-{case}-leader", f"portal-lock-{case}-follower"
    revoke_first = case == "revoke-first"
    leader = connection(leader_name, "authenticated" if revoke_first else "service_role")
    follower = None
    try:
        follower = connection(follower_name, "service_role" if revoke_first else "authenticated")
        first = revoke if revoke_first else f"SELECT {cancel};"
        send(leader, first + "\n\\echo held")
        lead_rows = until(leader, "held")
        if revoke_first:
            assert lead_rows == ["revoked"]
        else:
            assert json.loads(lead_rows[-1])["ok"] is True
            assert json.loads(lead_rows[-1])["replayed"] is False
        second = must_deny(cancel) if revoke_first else revoke
        send(follower, second + "\nCOMMIT;\n\\q")
        waiting(leader_name, follower_name)
        send(leader, "COMMIT;\n\\q")
        collect(leader)
        follow_rows = collect(follower)
        assert follow_rows == ("" if revoke_first else "revoked")
        assert query(f"""SELECT count(*) FROM public.portal_access_grants
          WHERE id='{grant}' AND revision=3 AND revoked_at IS NOT NULL AND token_digest IS NULL;""") == "1"
        assert query(f"""SELECT count(*) FROM public.session_attendance WHERE teacher_id='{owner}'
          AND session_id='{session}' AND student_id='{student}' AND status='student_cancelled';""") == (
              "0" if revoke_first else "1")
        query("SET ROLE service_role;\n" + must_deny(cancel))
        print("PASS:", case, "actual row-lock wait; post-revoke requests denied", flush=True)
    finally:
        for process in (leader, follower):
            if process is not None and process.poll() is None:
                process.kill()
                process.wait()


check_scope()
proof("revoke-first", 0)
proof("cancel-first", 1)
