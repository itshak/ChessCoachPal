#!/usr/bin/env python3
"""Concurrent, independently read-back proof; disposable seeded stack only."""
import json
import subprocess
import sys
import time
import uuid

if len(sys.argv) != 3 or sys.argv[1] != "--disposable-only":
    raise SystemExit("Usage: combined-concurrency.py --disposable-only PSQL")
pg = [sys.argv[2], "-XqAt", "-v", "ON_ERROR_STOP=1"]
owner = "00000000-0000-0000-0000-000000000001"
a, b = [f"10000000-0000-0000-0000-00000000000{i}" for i in (1, 2)]
material = "c0000000-0000-4000-8000-000000000021"

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

def denied(call, code):
    return f"""DO $expected$ BEGIN PERFORM {call};
      RAISE EXCEPTION 'EXPECTED_DENIAL_NOT_SEEN';
      EXCEPTION WHEN unique_violation THEN IF SQLERRM<>'{code}' THEN RAISE; END IF;
    END $expected$;"""

scope = query(f"""SELECT id FROM public.workplaces WHERE teacher_id='{owner}'
 ORDER BY created_at,id LIMIT 1;""")
query(f"""UPDATE public.teachers SET selected_workplace_id=NULL WHERE id='{owner}';
 INSERT INTO public.learning_materials(id,teacher_id,kind,title,source_url,request_id,request_hash)
 VALUES('{material}','{owner}','external_link','Fixture race material','https://example.invalid/race',
   gen_random_uuid(),repeat('b',64));""")
decisions = json.dumps([
  {"studentId":a,"status":"present","note":"Race A","expectedUpdatedAt":None},
  {"studentId":b,"status":"late","note":"Race B","expectedUpdatedAt":None},
], separators=(",",":"))

def setup(i):
    lesson = query(f"""SET ROLE authenticated; SET request.jwt.claim.sub='{owner}';
      SELECT public.ccp_teacher_ad_hoc_session_create('{scope}',ARRAY['{a}'::uuid,'{b}'::uuid],
      'Combined race {i}',((current_date-{i+3})+time '10:21') AT TIME ZONE
      (SELECT timezone FROM public.workplaces WHERE id='{scope}'),35,'Racing initial note',gen_random_uuid())->>'id';""")
    rev, day = query(f"""SELECT s.updated_at,(s.starts_at AT TIME ZONE coalesce(s.local_timezone,w.timezone))::date
      FROM public.teaching_sessions s JOIN public.workplaces w ON w.id=s.workplace_id
      WHERE s.id='{lesson}';""").split("|")
    return lesson, rev, day

def combined(lesson, rev, day, key, note="Race reviewed shared note"):
    return f"""public.ccp_teacher_daily_session_complete_with_material(
      '{lesson}','{scope}',NULL,'{rev}','{note}','{decisions}'::jsonb,'{material}',1,
      ARRAY['{a}'::uuid,'{b}'::uuid],'{day}','{key}',true)"""

def counts(lesson):
    return query(f"""SELECT status,
      (SELECT count(*) FROM public.session_attendance WHERE session_id=s.id),
      (SELECT count(*) FROM public.material_links WHERE session_id=s.id),
      (SELECT count(*) FROM public.material_teaching_evidence WHERE session_id=s.id),
      (SELECT count(*) FROM public.agent_tool_receipts WHERE teacher_id='{owner}'
          AND receipt->>'sessionId'=s.id::text)
      FROM public.teaching_sessions s WHERE id='{lesson}';""")

for i, kind in enumerate(["same_key", "changed_same_key", "new_key", "context", "standalone_material"]):
    lesson, rev, day = setup(i)
    key = str(uuid.uuid4())
    win_label, wait_label = f"combined-win-{i}", f"combined-wait-{i}"
    winner, waiter = connection(win_label), connection(wait_label)
    run = combined(lesson, rev, day, key)
    try:
        if kind == "context":
            write(winner, f"UPDATE public.teachers SET selected_workplace_id='{scope}' WHERE id='{owner}';\n\\echo held")
        else:
            write(winner, "SELECT " + run + ";\n\\echo held")
        before = read_until(winner, "held")
        if kind == "same_key":
            sql = "SELECT " + run + ";"
        elif kind == "changed_same_key":
            sql = denied(combined(lesson,rev,day,key,"Different approved content"),"DAILY_COMBINED_REPLAY_CONFLICT")
        elif kind == "new_key":
            sql = denied(combined(lesson,rev,day,str(uuid.uuid4())),"DAILY_LESSON_NOT_ACTIONABLE")
        elif kind == "context":
            sql = denied(run,"STALE_WORKPLACE_CONTEXT")
        else:
            other = str(uuid.uuid4())
            payload = json.dumps([{"studentId":a,"stage":"taught","note":""}])
            separate = f"""public.ccp_teacher_lesson_material_use_commit('{lesson}','{rev}',
              '{material}',NULL,'{payload}','{day}','{other}')"""
            sql = denied(separate,"STALE_LESSON_REVISION")
        write(waiter, sql + "\nCOMMIT;\n\\q")
        confirm_wait(wait_label, win_label)
        finish(winner)
        out, error = waiter.communicate(timeout=20)
        if waiter.returncode:
            raise AssertionError(error)
        if kind == "same_key":
            first, second = json.loads(before[-1]), json.loads(out.strip())
            first["replayed"] = True
            assert second == first
        assert counts(lesson) == ("scheduled|0|0|0|0" if kind == "context" else "completed|2|1|2|3")
        if kind == "context":
            query(f"UPDATE public.teachers SET selected_workplace_id=NULL WHERE id='{owner}';")
        print("PASS", kind, "actual lock wait and independent exact persisted counts")
    finally:
        for p in (winner,waiter):
            if p.poll() is None:
                p.kill()
                p.wait()

# This race is deliberately no-wait; no snapshot is claimed when the reviewed
# material is being edited. After the edit commits, its prior revision is stale.
lesson, rev, day = setup(5)
key = str(uuid.uuid4())
editor = connection("combined-catalog-editor")
run = combined(lesson,rev,day,key)
try:
    write(editor, f"""SELECT public.ccp_material_catalog_update('{material}',1,'external_link',
      'Edited fixture race material','','https://example.invalid/race-revised','{{}}'::jsonb,
      gen_random_uuid());
      \\echo held""")
    read_until(editor, "held")
    query(f"""SET ROLE authenticated; SET request.jwt.claim.sub='{owner}';
      DO $busy$ BEGIN PERFORM {run}; RAISE EXCEPTION 'EXPECTED_BUSY';
        EXCEPTION WHEN lock_not_available THEN
          IF SQLERRM<>'DAILY_MATERIAL_REVIEW_BUSY' THEN RAISE; END IF;
      END $busy$;""")
    assert counts(lesson) == "scheduled|0|0|0|0"
    finish(editor)
    query(f"SET ROLE authenticated; SET request.jwt.claim.sub='{owner}'; "+
          denied(run,"STALE_DAILY_MATERIAL_REVISION"))
    assert counts(lesson) == "scheduled|0|0|0|0"
    assert query(f"SELECT revision FROM public.learning_materials WHERE id='{material}';")=="2"
    print("PASS catalog_change no-wait while editing, stale after commit, no partial writes")
finally:
    if editor.poll() is None:
        editor.kill()
        editor.wait()
