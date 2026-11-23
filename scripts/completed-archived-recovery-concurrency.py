"""Disposable PostgreSQL only. Usage: script <psql command and args>.
 prove active-completed and completed-recovery serialize in both orders.
"""
import json
import subprocess
import sys
import time

psql = sys.argv[1:]
if not psql:
    raise SystemExit("Supply the explicit disposable psql command")

teacher = "00000000-0000-0000-0000-000000000001"

def execute(sql):
    return subprocess.run(psql, input=sql, text=True, capture_output=True, check=True).stdout.strip()

def quote(v):
    return "'" + str(v).replace("'", "''") + "'"

def uuid_array(ids):
    return "ARRAY[" + ",".join(quote(x) + "::uuid" for x in ids) + "]"

def j(v):
    return quote(json.dumps(v)) + "::jsonb"

setup = r"""
CREATE TEMP TABLE fixture(z text,vz text,workplace uuid,return_a uuid,return_b uuid,active_c uuid,active_d uuid,first_at timestamptz,second_at timestamptz);
DO $setup$
DECLARE teacher uuid:='00000000-0000-0000-0000-000000000001'; now_ timestamptz:=date_trunc('minute',clock_timestamp());
 z text;vz text;w uuid;a uuid;b uuid;c uuid;d uuid;td date;
BEGIN
 SELECT teacher_zone,venue_zone INTO z,vz FROM (VALUES
  ('UTC','Etc/GMT-1'),('Etc/GMT-8','Etc/GMT-9'),('Etc/GMT+8','Etc/GMT+7')
 ) zones(teacher_zone,venue_zone)
 WHERE extract(hour FROM now_ AT TIME ZONE teacher_zone) BETWEEN 8 AND 20 LIMIT 1;
 IF z IS NULL THEN RAISE EXCEPTION 'fixture calendar unavailable';END IF;
 td:=(now_ AT TIME ZONE z)::date;
 UPDATE public.teacher_settings SET timezone=z WHERE teacher_id=teacher;
 INSERT INTO public.workplaces(teacher_id,name,timezone,currency,locale)
  VALUES(teacher,'Synthetic completion challenge',vz,'USD','en') RETURNING id INTO w;
 INSERT INTO public.students(teacher_id,name) VALUES(teacher,'Lock archived A') RETURNING id INTO a;
 INSERT INTO public.students(teacher_id,name) VALUES(teacher,'Lock archived B') RETURNING id INTO b;
 INSERT INTO public.students(teacher_id,name) VALUES(teacher,'Lock active C') RETURNING id INTO c;
 INSERT INTO public.students(teacher_id,name) VALUES(teacher,'Lock active D') RETURNING id INTO d;
 INSERT INTO public.workplace_enrollments(teacher_id,workplace_id,student_id,starts_on,ends_on)
 SELECT teacher,w,i,td-20,CASE WHEN i IN(a,b) THEN td-1 ELSE NULL END FROM unnest(ARRAY[a,b,c,d]) i;
 UPDATE public.students SET archived_at=now_-interval '6 hours' WHERE id IN(a,b);
 INSERT INTO fixture VALUES(z,vz,w,a,b,c,d,now_-interval '4 hours',now_-interval '2 hours');
END;
$setup$;
SELECT jsonb_build_object('w',workplace,'z',z,'vz',vz,'a',return_a,'b',return_b,'c',active_c,'d',active_d,
 'revA',(SELECT updated_at FROM public.students WHERE id=return_a),
 'revB',(SELECT updated_at FROM public.students WHERE id=return_b),
 'dates',jsonb_build_array(first_at,second_at),
 'wall',jsonb_build_array(first_at AT TIME ZONE vz,second_at AT TIME ZONE vz),
 'td',(clock_timestamp() AT TIME ZONE z)::date,'vd',(clock_timestamp() AT TIME ZONE vz)::date,
 'offset',extract(epoch FROM ((first_at AT TIME ZONE vz)-(first_at AT TIME ZONE 'UTC')))/60)
FROM fixture;
"""
f = json.loads(execute(setup))
def command(kind,i):
    a=f["a"] if i==0 else f["b"]
    if kind=="active":
        ids=[f["c"],f["d"]]
        args=[quote(f["w"]),uuid_array(ids),quote("Ordinary lock "+str(i)),quote(f["dates"][i]),
              "45","''",j([{"studentId":x,"status":"present"} for x in ids]),"gen_random_uuid()"]
        return "SELECT public.ccp_teacher_completed_group_lesson_create("+",".join(args)+");"
    ids=[a,f["c"]]
    args=[quote(f["w"]),uuid_array(ids),j([{"studentId":a,"expectedUpdatedAt":f["revA" if i==0 else "revB"]}]),
          quote("Recovery lock "+str(i)),quote(f["dates"][i]),"45",quote(f["td"]),quote(f["z"]),
          quote(f["vd"]),quote(f["vz"]),quote(f["wall"][i]),str(int(f["offset"])),
          j([{"studentId":x,"status":"present"} for x in ids]),"gen_random_uuid()",
          "'Synthetic reviewed concurrency attestation'","true"]
    return "SELECT public.ccp_teacher_completed_archived_recovery_commit("+",".join(args)+");"

def process(kind,i,name,hold):
    client=subprocess.Popen(psql,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    script=("BEGIN; SET LOCAL ROLE authenticated; SET LOCAL statement_timeout='9s'; "
          +"SET LOCAL application_name="+quote(name)+"; "
          +"SELECT set_config('request.jwt.claim.sub',"+quote(teacher)+",true); "+command(kind,i)
          +(" SELECT pg_sleep(2.5);" if hold else "")+" COMMIT;")
    client.stdin.write(script)
    client.stdin.close()
    client.stdin=None
    return client

for i,(first,second,rejection) in enumerate([
    ("active","recovery","COMPLETED_RECOVERY_SCHEDULE_OVERLAP"),
    ("recovery","active","COMPLETED_ARCHIVED_RECOVERY_SCHEDULE_OVERLAP"),
]):
    name="completed_archived_lock_fixture_"+str(i)
    winner=process(first,i,name,True)
    deadline=time.monotonic()+5
    while True:
        held=execute("SELECT EXISTS(SELECT 1 FROM pg_stat_activity s JOIN pg_locks l ON l.pid=s.pid WHERE s.application_name="+quote(name)+" AND l.locktype='advisory' AND l.granted);")
        if held=="t":
            break
        if winner.poll() is not None or time.monotonic()>deadline:
            raise RuntimeError("fixture never acquired canonical advisory lock: "+repr(winner.communicate()))
        time.sleep(.05)
    loser=process(second,i,name+"_loser",False)
    out,err=winner.communicate(timeout=12)
    other,denial=loser.communicate(timeout=12)
    if winner.returncode!=0 or '"status": "completed"' not in out or loser.returncode==0 or rejection not in denial:
        raise RuntimeError(f"{first}/{second} serialization failed: {out} {err} {other} {denial}")
    persisted=execute("SELECT count(*) FROM public.teaching_sessions WHERE teacher_id="+quote(teacher)+
        " AND starts_at="+quote(f["dates"][i])+" AND status='completed';")
    if persisted!="1":
        raise RuntimeError("expected exactly one committed instructor interval")
    print(first+" first: exclusive completed interval verified under concurrent wait")
