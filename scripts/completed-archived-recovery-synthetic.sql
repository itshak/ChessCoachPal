-- Disposable fresh-install SQL only. The postgres fixture adjusts synthetic
-- archive timestamps before invoking the runtime function as owner.
BEGIN;
CREATE FUNCTION pg_temp.completed_attempt(a jsonb) RETURNS jsonb LANGUAGE plpgsql AS $fixture_call$
BEGIN
 RETURN public.ccp_teacher_completed_archived_recovery_commit(
  (a->>'venue')::uuid,ARRAY(SELECT jsonb_array_elements_text(a->'students')::uuid),
  a->'reactivations',a->>'title',(a->>'start')::timestamptz,45,
  (a->>'teacherDay')::date,a->>'teacherTimezone',(a->>'venueDay')::date,a->>'venueTimezone',
  (a->>'wall')::timestamp,(a->>'offset')::integer,a->'outcomes',(a->>'key')::uuid,
  'Explicit attestation by the synthetic teacher',true);
END;
$fixture_call$;
DO $completed_recovery_proof$
DECLARE
 tid uuid:='00000000-0000-0000-0000-000000000001'; venue uuid;
 returning_a uuid;returning_b uuid;active_c uuid;reject_d uuid;reject_e uuid;plan_ uuid;prior_plan uuid;active_count integer;
 now_ timestamptz:=date_trunc('minute',clock_timestamp()); start_ timestamptz;
 z text;vz text;local_ timestamp;day_ date;vday date;offset_ integer;cal jsonb;
 body jsonb;single_ jsonb;mix_ jsonb;x jsonb;failed boolean;sid uuid;
 ledger_before integer[];ledger_after integer[];
 request_a uuid:=gen_random_uuid();request_b uuid:=gen_random_uuid();candidate text;
BEGIN
 IF NOT has_function_privilege('authenticated',
  'public.ccp_teacher_completed_archived_recovery_commit(uuid,uuid[],jsonb,text,timestamptz,integer,date,text,date,text,timestamp,integer,jsonb,uuid,text,boolean)','EXECUTE')
  OR has_function_privilege('anon',
  'public.ccp_teacher_completed_archived_recovery_commit(uuid,uuid[],jsonb,text,timestamptz,integer,date,text,date,text,timestamp,integer,jsonb,uuid,text,boolean)','EXECUTE')
  OR has_function_privilege('service_role',
  'public.ccp_teacher_completed_archived_recovery_commit(uuid,uuid[],jsonb,text,timestamptz,integer,date,text,date,text,timestamp,integer,jsonb,uuid,text,boolean)','EXECUTE')
 THEN RAISE EXCEPTION 'unexpected recovery writer grants'; END IF;
 SELECT teacher_zone,venue_zone INTO z,vz FROM (VALUES
  ('UTC','Etc/GMT-1'),('Etc/GMT-8','Etc/GMT-9'),('Etc/GMT+8','Etc/GMT+7')
 ) AS zones(teacher_zone,venue_zone)
 WHERE extract(hour FROM now_ AT TIME ZONE teacher_zone) BETWEEN 8 AND 20 LIMIT 1;
 IF z IS NULL THEN RAISE EXCEPTION 'fixture calendar setup failed'; END IF;
 UPDATE public.teacher_settings SET timezone=z,no_show_earns_makeup=true WHERE teacher_id=tid;
 INSERT INTO public.workplaces(teacher_id,name,timezone,currency,locale)
 VALUES(tid,'Synthetic completed recovery',vz,'USD','en') RETURNING id INTO venue;
 day_:=(now_ AT TIME ZONE z)::date;
 vday:=(now_ AT TIME ZONE vz)::date;
 INSERT INTO public.students(teacher_id,name) VALUES(tid,'Synthetic returning A') RETURNING id INTO returning_a;
 INSERT INTO public.students(teacher_id,name) VALUES(tid,'Synthetic returning B') RETURNING id INTO returning_b;
 INSERT INTO public.students(teacher_id,name) VALUES(tid,'Synthetic active C') RETURNING id INTO active_c;
 INSERT INTO public.students(teacher_id,name) VALUES(tid,'Synthetic reject D') RETURNING id INTO reject_d;
 INSERT INTO public.students(teacher_id,name) VALUES(tid,'Synthetic quota E') RETURNING id INTO reject_e;
 INSERT INTO public.workplace_enrollments(teacher_id,workplace_id,student_id,starts_on,ends_on,source)
 SELECT tid,venue,id,day_-20,CASE WHEN id=active_c THEN NULL ELSE day_-1 END,'manual'
 FROM unnest(ARRAY[returning_a,returning_b,active_c,reject_d,reject_e]) id;
 UPDATE public.students SET archived_at=now_-interval '7 hours'
 WHERE id IN (returning_a,returning_b,reject_d,reject_e);
 PERFORM set_config('request.jwt.claim.sub',tid::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 cal:=public.ccp_completed_archived_recovery_calendar(venue);
 IF cal->>'teacherDay'<>day_::text OR cal->>'venueDay'<>vday::text
  OR cal->>'teacherTimezone'<>z OR cal->>'venueTimezone'<>vz THEN
   RAISE EXCEPTION 'wrong authoritative calendar: %',cal;
 END IF;
 start_:=now_-interval '5 hours';
 local_:=start_ AT TIME ZONE vz;
 offset_:=extract(epoch FROM local_-(start_ AT TIME ZONE 'UTC'))/60;
 body:=cal||jsonb_build_object('venue',venue,'start',start_,'wall',local_,'offset',offset_);
 single_:=body||jsonb_build_object('students',to_jsonb(ARRAY[returning_a]),
  'reactivations',jsonb_build_array(jsonb_build_object('studentId',returning_a,
   'expectedUpdatedAt',(SELECT updated_at FROM public.students WHERE id=returning_a))),
  'title','Explicitly attended private lesson','key',request_a,
  'outcomes',jsonb_build_array(jsonb_build_object('studentId',returning_a,'status','present')));
 SELECT ARRAY[(SELECT count(*) FROM public.financial_obligations WHERE teacher_id=tid),
  (SELECT count(*) FROM public.credit_adjustment_events WHERE teacher_id=tid),
  (SELECT count(*) FROM public.credit_redemptions WHERE teacher_id=tid),
  (SELECT count(*) FROM public.received_payments WHERE teacher_id=tid),
  (SELECT count(*) FROM public.invoices WHERE teacher_id=tid),
  (SELECT count(*) FROM public.portal_access_grants WHERE teacher_id=tid),
  (SELECT count(*) FROM public.session_notes WHERE teacher_id=tid)] INTO ledger_before;

 EXECUTE 'SET LOCAL ROLE authenticated';
 x:=pg_temp.completed_attempt(single_);
 IF x->>'status'<>'completed' OR x->>'replayed'<>'false' THEN RAISE EXCEPTION 'single recovery not completed: %',x;END IF;
 sid:=(x->>'sessionId')::uuid;
 x:=pg_temp.completed_attempt(single_);
 IF x->>'replayed'<>'true' OR (x->>'sessionId')::uuid<>sid THEN RAISE EXCEPTION 'single exact replay failed';END IF;
 BEGIN
  PERFORM pg_temp.completed_attempt(single_||jsonb_build_object('title','Changed review'));
  RAISE EXCEPTION 'changed replay allowed';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM<>'COMPLETED_RECOVERY_REPLAY_CONFLICT' THEN RAISE;END IF;
 END;
 EXECUTE 'RESET ROLE';
 IF NOT EXISTS(SELECT 1 FROM public.teaching_sessions WHERE id=sid AND student_id=returning_a
  AND local_timezone=vz AND starts_at=start_ AND status='completed') OR
  NOT EXISTS(SELECT 1 FROM public.session_attendance WHERE session_id=sid AND student_id=returning_a AND status='present') OR
  NOT EXISTS(SELECT 1 FROM public.workplace_enrollments WHERE student_id=returning_a AND starts_on=day_ AND ends_on IS NULL)
 THEN RAISE EXCEPTION 'single stored snapshot, attendance or period differs';END IF;

 start_:=now_-interval '3 hours';
 mix_:=body||jsonb_build_object('students',to_jsonb(ARRAY[active_c,returning_b]),
  'reactivations',jsonb_build_array(jsonb_build_object('studentId',returning_b,
   'expectedUpdatedAt',(SELECT updated_at FROM public.students WHERE id=returning_b))),
  'start',start_,'wall',start_ AT TIME ZONE vz,'title','Mixed attendance proof','key',request_b,
  'outcomes',jsonb_build_array(jsonb_build_object('studentId',active_c,'status','excused'),
   jsonb_build_object('studentId',returning_b,'status','late')));
 EXECUTE 'SET LOCAL ROLE authenticated';
 x:=pg_temp.completed_attempt(mix_);
 IF x->>'status'<>'completed' OR jsonb_array_length(x->'attendance')<>2
 THEN RAISE EXCEPTION 'mixed recovery not completed';END IF;
 sid:=(x->>'sessionId')::uuid;
 EXECUTE 'RESET ROLE';
 IF NOT EXISTS(SELECT 1 FROM public.teaching_sessions WHERE id=sid AND roster_mode='ad_hoc'
  AND local_timezone=vz AND duration_minutes=45 AND status='completed') OR
  (SELECT count(*) FROM public.session_participants WHERE session_id=sid)<>2 OR
  (SELECT count(*) FROM public.session_attendance WHERE session_id=sid AND status IN ('excused','late'))<>2
 THEN RAISE EXCEPTION 'mixed frozen roster or evidence missing';END IF;

 -- The normal active-only writer must also refuse the reverse ordering,
 -- without broadening its independent historical policy.
 EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN
  PERFORM public.ccp_teacher_completed_group_lesson_create(venue,ARRAY[returning_a,active_c],
   'Overlaps newly recovered completion',start_,45,'',
   jsonb_build_array(jsonb_build_object('studentId',returning_a,'status','present'),
    jsonb_build_object('studentId',active_c,'status','present')),gen_random_uuid());
  RAISE EXCEPTION 'active writer overlapped completed recovery';
 EXCEPTION WHEN exclusion_violation THEN
  IF SQLERRM<>'COMPLETED_ARCHIVED_RECOVERY_SCHEDULE_OVERLAP' THEN RAISE;END IF;
 END;
 -- Exact half-open adjacency works and creates only one instructor occurrence.
 PERFORM public.ccp_teacher_completed_group_lesson_create(venue,ARRAY[returning_a,active_c],
  'Adjacent existing completion',start_+interval '45 minutes',45,'',
  jsonb_build_array(jsonb_build_object('studentId',returning_a,'status','present'),
   jsonb_build_object('studentId',active_c,'status','present')),gen_random_uuid());
 EXECUTE 'RESET ROLE';

 -- A remaining archived identity supplies independent read-only rejection checks.
 body:=body||jsonb_build_object('students',to_jsonb(ARRAY[reject_d]),
  'reactivations',jsonb_build_array(jsonb_build_object('studentId',reject_d,
   'expectedUpdatedAt',(SELECT updated_at FROM public.students WHERE id=reject_d))),
  'title','Rejected completed recovery','key',gen_random_uuid(),
  'start',now_-interval '6 hours 15 minutes','wall',(now_-interval '6 hours 15 minutes') AT TIME ZONE vz,
  'outcomes',jsonb_build_array(jsonb_build_object('studentId',reject_d,'status','present')));
 INSERT INTO public.teaching_sessions(teacher_id,workplace_id,student_id,title,
  starts_at,duration_minutes,request_id)
 VALUES(tid,venue,active_c,'Existing synthetic child key',now_-interval '90 minutes',30,
  md5((body->>'key')||':completed-archived-session')::uuid);
 EXECUTE 'SET LOCAL ROLE authenticated';
 FOR candidate IN SELECT unnest(ARRAY['offset','day','outcome','pending','pre_archive','overlap','revision','foreign','child']) LOOP
  x:=CASE candidate
   WHEN 'offset' THEN body||jsonb_build_object('offset',offset_+60)
   WHEN 'day' THEN body||jsonb_build_object('teacherDay',day_-1)
   WHEN 'outcome' THEN body||jsonb_build_object('outcomes',jsonb_build_array(jsonb_build_object('studentId',reject_d,'status','absent')))
   WHEN 'pending' THEN body||jsonb_build_object('start',now_-interval '5 minutes','wall',(now_-interval '5 minutes') AT TIME ZONE vz)
   WHEN 'pre_archive' THEN body||jsonb_build_object('start',now_-interval '8 hours','wall',(now_-interval '8 hours') AT TIME ZONE vz)
   WHEN 'revision' THEN body||jsonb_build_object('reactivations',jsonb_build_array(jsonb_build_object('studentId',reject_d,'expectedUpdatedAt',now_-interval '1 year')))
   WHEN 'foreign' THEN body||jsonb_build_object('venue',gen_random_uuid())
   WHEN 'overlap' THEN body||jsonb_build_object('key',gen_random_uuid(),
    'start',start_+interval '45 minutes','wall',(start_+interval '45 minutes') AT TIME ZONE vz)
   ELSE body END;
  IF candidate<>'child' THEN x:=x||jsonb_build_object('key',gen_random_uuid());END IF;
  BEGIN
   PERFORM pg_temp.completed_attempt(x);
   RAISE EXCEPTION 'unexpected completed recovery success: %',candidate;
  EXCEPTION WHEN invalid_parameter_value OR unique_violation OR exclusion_violation OR insufficient_privilege THEN
   IF candidate='offset' AND SQLERRM<>'COMPLETED_RECOVERY_UNREVIEWED_LOCAL_TIME'
   OR candidate='day' AND SQLERRM<>'COMPLETED_RECOVERY_PREVIEW_CHANGED'
   OR candidate='outcome' AND SQLERRM<>'UNSUPPORTED_COMPLETED_RECOVERY_OUTCOME'
   OR candidate='pending' AND SQLERRM<>'COMPLETED_RECOVERY_SAME_DAY_ONLY'
   OR candidate='pre_archive' AND SQLERRM<>'COMPLETED_RECOVERY_PRE_ARCHIVE_HISTORY'
   OR candidate='revision' AND SQLERRM<>'COMPLETED_RECOVERY_PREVIEW_CHANGED'
   OR candidate='foreign' AND SQLERRM<>'RECOVERY_CALENDAR_UNAVAILABLE'
   OR candidate='child' AND SQLERRM<>'COMPLETED_RECOVERY_CHILD_ALREADY_EXISTS'
   OR candidate='overlap' AND SQLERRM<>'COMPLETED_RECOVERY_SCHEDULE_OVERLAP'
   THEN RAISE;END IF;
  END;
 END LOOP;
 EXECUTE 'RESET ROLE';
 IF (SELECT archived_at FROM public.students WHERE id=reject_d) IS NULL OR
    EXISTS(SELECT 1 FROM public.workplace_enrollments WHERE student_id=reject_d AND starts_on=day_) OR
    EXISTS(SELECT 1 FROM public.agent_tool_receipts WHERE idempotency_key=(body->>'key')::uuid)
 THEN RAISE EXCEPTION 'a rejected operation left lifecycle state';END IF;
 -- One slot can fit the first lifecycle writer but not the second;
 -- the complete mixed-roster operation must unwind both updates.
 SELECT active_student_count,baseline_plan_version_id INTO active_count,prior_plan
 FROM public.teacher_entitlement_state WHERE teacher_id=tid;
 INSERT INTO public.plan_versions(code,version,lifecycle)
 VALUES('test_'||replace(gen_random_uuid()::text,'-',''),1,'draft') RETURNING id INTO plan_;
 INSERT INTO public.plan_capabilities(plan_version_id,capability_key,capability_kind,integer_value,boolean_value,unlimited)
 VALUES(plan_,'students.active','integer_limit',active_count+1,NULL,false),
       (plan_,'workplaces.professional','integer_limit',NULL,NULL,true),
       (plan_,'reports.publish','boolean',NULL,false,false);
 UPDATE public.plan_versions SET lifecycle='published',effective_at='2020-01-01Z' WHERE id=plan_;
 UPDATE public.teacher_entitlement_state SET baseline_plan_version_id=plan_ WHERE teacher_id=tid;
 x:=body||jsonb_build_object('key',gen_random_uuid(),'students',to_jsonb(ARRAY[reject_d,reject_e,active_c]),
  'reactivations',(SELECT jsonb_agg(jsonb_build_object('studentId',id,'expectedUpdatedAt',updated_at))
   FROM public.students WHERE id IN (reject_d,reject_e)),
  'outcomes',jsonb_build_array(jsonb_build_object('studentId',reject_d,'status','present'),
   jsonb_build_object('studentId',reject_e,'status','present'),jsonb_build_object('studentId',active_c,'status','late')));
 EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN
  PERFORM pg_temp.completed_attempt(x);
  RAISE EXCEPTION 'mixed double reactivation over quota was accepted';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'CAPACITY_EXCEEDED' THEN RAISE;END IF;
 END;
 EXECUTE 'RESET ROLE';
 IF (SELECT active_student_count FROM public.teacher_entitlement_state WHERE teacher_id=tid)<>active_count
  OR EXISTS(SELECT 1 FROM public.students WHERE id IN (reject_d,reject_e) AND archived_at IS NULL)
  OR EXISTS(SELECT 1 FROM public.workplace_enrollments WHERE student_id IN (reject_d,reject_e) AND starts_on=day_)
  OR EXISTS(SELECT 1 FROM public.agent_tool_receipts WHERE idempotency_key=(x->>'key')::uuid)
 THEN RAISE EXCEPTION 'quota failure did not roll back both learners';END IF;
 UPDATE public.teacher_entitlement_state SET baseline_plan_version_id=prior_plan WHERE teacher_id=tid;
 x:=body||jsonb_build_object('key',gen_random_uuid(),'start',start_-interval '45 minutes',
  'wall',(start_-interval '45 minutes') AT TIME ZONE vz,'title','Recovery half-open adjacency');
 EXECUTE 'SET LOCAL ROLE authenticated';
 x:=pg_temp.completed_attempt(x);
 EXECUTE 'RESET ROLE';
 IF x->>'status'<>'completed' THEN RAISE EXCEPTION 'adjacent recovery was rejected'; END IF;
 SELECT ARRAY[(SELECT count(*) FROM public.financial_obligations WHERE teacher_id=tid),
  (SELECT count(*) FROM public.credit_adjustment_events WHERE teacher_id=tid),
  (SELECT count(*) FROM public.credit_redemptions WHERE teacher_id=tid),
  (SELECT count(*) FROM public.received_payments WHERE teacher_id=tid),
  (SELECT count(*) FROM public.invoices WHERE teacher_id=tid),
  (SELECT count(*) FROM public.portal_access_grants WHERE teacher_id=tid),
  (SELECT count(*) FROM public.session_notes WHERE teacher_id=tid)] INTO ledger_after;
 IF ledger_before IS DISTINCT FROM ledger_after THEN RAISE EXCEPTION 'recovery wrote unrelated ledger state';END IF;
 IF cardinality(public.ccp_canonical_wall_instants('2026-03-08 02:30','America/Chicago'))<>0 OR
    cardinality(public.ccp_canonical_wall_instants('2026-11-01 01:30','America/Chicago'))<>2 THEN
  RAISE EXCEPTION 'DST gap/fold do not fail closed';
 END IF;
 RAISE NOTICE 'completed archived recovery SQL proof passed: owned single/mixed, replay, date/offset/DST and rollback';
END;
$completed_recovery_proof$;
ROLLBACK;
