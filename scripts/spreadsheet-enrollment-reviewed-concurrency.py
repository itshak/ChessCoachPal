#!/usr/bin/env python3
"""Disposable canonical fresh-stack proof. Pass the isolated psql command."""
import json
import subprocess
import sys
import time
import uuid

PSQL = sys.argv[1:]
OWNER = "00000000-0000-0000-0000-000000000001"
AUTH = f"""
SELECT set_config('request.jwt.claim.sub','{OWNER}',true),
       set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
"""
def run(sql, check=True):
    return subprocess.run(PSQL, input=sql, text=True, capture_output=True,
                          check=check, timeout=12)

def held(sql):
    actor = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True)
    actor.stdin.write(sql + "\nSELECT 'HELD';\n")
    actor.stdin.flush()
    for line in actor.stdout:
        if line.strip() == "HELD":
            return actor
    raise AssertionError(actor.stderr.read())

def release(actor):
    actor.stdin.write("COMMIT;\n")
    actor.stdin.flush()
    out, err = actor.communicate(timeout=12)
    assert actor.returncode == 0, (out, err)

def wait_for_lock(name):
    for _ in range(60):
        blocked = run("SELECT count(*) FROM pg_stat_activity WHERE "
                      f"application_name='{name}' AND wait_event_type='Lock';")
        if blocked.stdout.strip() == "1":
            return
        time.sleep(0.06)
    raise AssertionError(f"{name} did not wait for the expected venue lock")

def start(sql):
    return subprocess.Popen(PSQL + ["-c", sql], stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True)

def quote(payload):
    return "'" + json.dumps(payload).replace("'", "''") + "'::jsonb"

def prove(first):
    site, key = str(uuid.uuid4()), str(uuid.uuid4())
    name = "Reviewed concurrency learner " + key
    run(f"INSERT INTO public.workplaces(id,teacher_id,name) VALUES('{site}','{OWNER}','Disposable {first} venue');")
    row = {"sourceRow": 2, "studentName": name, "workplaceId": site, "archived": False}
    preview = run("BEGIN;" + AUTH + "SELECT public.ccp_teacher_spreadsheet_review(" +
                  quote([row]) + "); COMMIT;")
    payload = json.loads(preview.stdout.splitlines()[-1])["envelope"]
    payload["confirmed"] = True
    statement = f"SELECT public.ccp_teacher_spreadsheet_commit({quote(payload)},'{key}');"
    archive = f"UPDATE public.workplaces SET archived_at=clock_timestamp() WHERE id='{site}';"
    if first == "archive":
        actor = held("BEGIN;" + AUTH + archive)
        waiting = start("BEGIN; SET LOCAL application_name='ccp_import_wait';" + AUTH + statement + "COMMIT;")
        try:
            wait_for_lock("ccp_import_wait")
        finally:
            release(actor)
        _, err = waiting.communicate(timeout=12)
        assert waiting.returncode and "IMPORT_PREVIEW_CHANGED" in err, err
        assert run(f"SELECT count(*) FROM public.students WHERE name='{name}';").stdout.strip() == "0"
    else:
        actor = held("BEGIN;" + AUTH + statement)
        waiting = start("BEGIN; SET LOCAL application_name='ccp_archive_wait';" + AUTH + archive + "COMMIT;")
        try:
            wait_for_lock("ccp_archive_wait")
        finally:
            release(actor)
        _, err = waiting.communicate(timeout=12)
        assert waiting.returncode and "WORKPLACE_FUTURE_COMMITMENTS" in err, err
        assert run(f"SELECT count(*) FROM public.students WHERE name='{name}';").stdout.strip() == "1"

prove("archive")
prove("import")
print("Reviewed spreadsheet import and venue retirement serialized in both orders")
