-- Isolated PG fixture only; no real finance or user data.
BEGIN;
CREATE TEMP TABLE pv AS SELECT
 '00000000-0000-0000-0000-000000000001'::uuid teacher,
 '10000000-0000-0000-0000-000000000001'::uuid student,
 md5('series-fixture-site')::uuid venue,md5('series-fixture-payer')::uuid payer,
 md5('series-fixture-root')::uuid root,md5('series-fixture-tail')::uuid tail,
 md5('series-fixture-unrelated-root')::uuid unrelated,
 date '2059-12-01' lesson_on;
INSERT INTO public.workplaces(id,teacher_id,name,timezone,currency)
 SELECT venue,teacher,'Synthetic series compensation','UTC','USD' FROM pv;
INSERT INTO public.workplace_enrollments(teacher_id,student_id,workplace_id,starts_on,source)
 SELECT teacher,student,venue,'2059-01-01','manual' FROM pv;
INSERT INTO public.billing_accounts(id,teacher_id,display_name,account_kind)
 SELECT payer,teacher,'Synthetic series payer','organization' FROM pv;
INSERT INTO public.lesson_slots(id,teacher_id,student_id,workplace_id,start_date,end_date,
 day_of_week,start_time,duration_minutes,series_id)
 SELECT root,teacher,student,venue,lesson_on,lesson_on,extract(dow from lesson_on)::int,time '10:00',60,root FROM pv
 UNION ALL SELECT tail,teacher,student,venue,lesson_on+7,lesson_on+28,extract(dow from lesson_on)::int,time '10:00',60,root FROM pv
 UNION ALL SELECT unrelated,teacher,student,venue,lesson_on,lesson_on+7,extract(dow from lesson_on)::int,time '13:00',60,unrelated FROM pv;
INSERT INTO public.compensation_agreements(id,teacher_id,workplace_id,billing_account_id,agreement_role,model,rate_cents,currency,effective_from)
 SELECT md5('series-fixture-broad')::uuid,teacher,venue,payer,'coach_earning','per_session',10000,'USD',lesson_on-30 FROM pv;
-- Simulate one older retained occurrence whose slot link was detached. Do not infer a root.
INSERT INTO public.teaching_sessions(id,teacher_id,student_id,workplace_id,title,starts_at,duration_minutes,
 status,slot_occurrence_date,local_timezone)
 SELECT md5('series-fixture-old-null')::uuid,teacher,student,venue,'Legacy detached synthetic',
 (lesson_on+time '16:00') AT TIME ZONE 'UTC',60,'completed',lesson_on,'UTC' FROM pv;
GRANT SELECT ON pv TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $fixture$
DECLARE f pv%ROWTYPE; q jsonb; r jsonb; v_move jsonb; v_slot_rev timestamptz; k uuid:=md5('series-fixture-create')::uuid;
BEGIN
 SELECT * INTO f FROM pv;
 q:=jsonb_build_array(
  jsonb_build_object('slot_id',f.root,'teacher_id',f.teacher,'workplace_id',f.venue,'student_id',f.student,
  'slot_occurrence_date',f.lesson_on,'starts_at',(f.lesson_on+time '10:00') AT TIME ZONE 'UTC','local_timezone','UTC','duration_minutes',60,'is_home_visit',false),
  jsonb_build_object('slot_id',f.tail,'teacher_id',f.teacher,'workplace_id',f.venue,'student_id',f.student,
  'slot_occurrence_date',f.lesson_on+7,'starts_at',(f.lesson_on+7+time '10:00') AT TIME ZONE 'UTC','local_timezone','UTC','duration_minutes',60,'is_home_visit',false),
  jsonb_build_object('slot_id',f.unrelated,'teacher_id',f.teacher,'workplace_id',f.venue,'student_id',f.student,
  'slot_occurrence_date',f.lesson_on,'starts_at',(f.lesson_on+time '13:00') AT TIME ZONE 'UTC','local_timezone','UTC','duration_minutes',60,'is_home_visit',false));
 IF public.ccp_canonical_slot_materialize(q)->>'inserted'<>'3' OR public.ccp_canonical_slot_materialize(q)->>'inserted'<>'0' THEN RAISE EXCEPTION 'Series materialization or replay changed'; END IF;
 IF (SELECT count(*) FROM public.teaching_sessions WHERE source_private_series_id=f.root)<>2 OR
    (SELECT count(*) FROM public.teaching_sessions WHERE source_private_series_id=f.unrelated)<>1 THEN RAISE EXCEPTION 'Wrong durable root'; END IF;
 SELECT updated_at INTO STRICT v_slot_rev FROM public.lesson_slots WHERE id=f.tail;
 v_move:=public.ccp_canonical_reschedule_unmaterialized_slot(f.tail,f.lesson_on+14,f.lesson_on+15,
    time '11:00',v_slot_rev,'Synthetic private series test move',NULL,NULL,false);
 v_move:=public.ccp_canonical_reschedule_unmaterialized_slot(f.tail,f.lesson_on+14,f.lesson_on+15,
    time '11:00',v_slot_rev,'Synthetic private series test move',v_move->>'reviewDigest',gen_random_uuid(),true);
 IF NOT EXISTS(SELECT 1 FROM public.teaching_sessions t WHERE t.id=(v_move->>'sessionId')::uuid
   AND t.source_private_series_id=f.root AND t.slot_occurrence_date=f.lesson_on+14
   AND (t.starts_at AT TIME ZONE 'UTC')::date=f.lesson_on+15) THEN RAISE EXCEPTION 'Moved root/date changed'; END IF;
 BEGIN
   INSERT INTO public.compensation_agreements(teacher_id,workplace_id,private_series_id,billing_account_id,
      agreement_role,model,rate_cents,currency,effective_from,effective_to)
   VALUES(f.teacher,f.venue,f.root,f.payer,'coach_earning','per_session',20000,'USD',f.lesson_on,f.lesson_on+28);
   RAISE EXCEPTION 'Raw table minted series finance terms';
 EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM<>'PRIVATE_SERIES_CONFIRMED_RPC_REQUIRED' THEN RAISE; END IF;
 END;
 r:=public.ccp_private_series_compensation_commit(f.venue,f.root,f.payer,'per_session',20000,'USD',f.lesson_on,f.lesson_on+28,NULL,NULL,k,true);
 IF NOT(r @> jsonb_build_object('revision',1,'status','active','privateSeriesId',f.root)) THEN RAISE EXCEPTION 'Wrong series agreement'; END IF;
 IF public.ccp_private_series_compensation_commit(f.venue,f.root,f.payer,'per_session',20000,'USD',f.lesson_on,f.lesson_on+28,NULL,NULL,k,true)
    IS DISTINCT FROM r||'{"replayed":true}'::jsonb THEN RAISE EXCEPTION 'Terms replay changed'; END IF;
 BEGIN
  PERFORM public.ccp_private_series_compensation_commit(f.venue,f.root,f.payer,'per_session',25000,'USD',f.lesson_on+7,f.lesson_on+14,NULL,NULL,gen_random_uuid(),true);
  RAISE EXCEPTION 'Series overlap allowed';
 EXCEPTION WHEN unique_violation THEN IF SQLERRM<>'OVERLAPPING_COMPENSATION_AGREEMENT' THEN RAISE; END IF;
 END;
END;
$fixture$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
-- Fixtures set a future synthetic completion directly as operator, as in
-- surrounding finance tests. Finance approval below is the signed boundary.
UPDATE public.teaching_sessions SET status='completed' WHERE workplace_id=(SELECT venue FROM pv);
INSERT INTO public.session_attendance(teacher_id,session_id,student_id,status,marked_at)
 SELECT t.teacher_id,t.id,t.student_id,'present',clock_timestamp()
 FROM public.teaching_sessions t WHERE t.workplace_id=(SELECT venue FROM pv);
UPDATE public.teaching_sessions SET slot_id=NULL WHERE slot_id=(SELECT tail FROM pv);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $finance$
DECLARE f pv%ROWTYPE; a uuid; s uuid; b uuid:=md5('series-fixture-broad')::uuid;
 i uuid:=gen_random_uuid(); r jsonb; v_exact uuid;
BEGIN
 SELECT * INTO f FROM pv;
 SELECT id INTO STRICT a FROM public.compensation_agreements WHERE private_series_id=f.root;
 SELECT id INTO STRICT s FROM public.teaching_sessions WHERE source_private_series_id=f.root AND slot_occurrence_date=f.lesson_on+7 AND slot_id IS NULL;
 BEGIN
  PERFORM public.ccp_finance_post_obligation(b,1,10000,s,NULL,f.lesson_on+7,f.lesson_on+7,gen_random_uuid(),true);
  RAISE EXCEPTION 'Broad bypassed active terms';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'PRIVATE_SERIES_AGREEMENT_REVIEW_REQUIRED' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ccp_finance_post_obligation(a,1,20000,s,NULL,f.lesson_on+7,f.lesson_on+7,i,true);
  RAISE EXCEPTION 'Generic approval accepted private series terms';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'PRIVATE_SERIES_APPROVAL_SCOPE_REQUIRED' THEN RAISE; END IF;
 END;
 r:=public.ccp_finance_post_private_series_obligation(a,1,20000,s,f.root,f.lesson_on+7,i,true);
 IF NOT(r @> jsonb_build_object('obligation',jsonb_build_object('amount_cents',20000,
    'agreement_snapshot',jsonb_build_object('scope','private_series','privateSeriesId',f.root,'originalOccurrenceOn',f.lesson_on+7)))) THEN
  RAISE EXCEPTION 'Wrong exact posted snapshot';
 END IF;
 IF public.ccp_finance_post_private_series_obligation(a,1,20000,s,f.root,f.lesson_on+7,i,true)
     IS DISTINCT FROM r||'{"replayed":true}'::jsonb THEN RAISE EXCEPTION 'Posted replay changed'; END IF;
 BEGIN
  PERFORM public.ccp_finance_post_private_series_obligation(a,1,20000,md5('series-fixture-old-null')::uuid,f.root,f.lesson_on,gen_random_uuid(),true);
  RAISE EXCEPTION 'Legacy inferred';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'PRIVATE_SERIES_AGREEMENT_SOURCE_UNVERIFIED' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ccp_finance_post_obligation(b,1,10000,md5('series-fixture-old-null')::uuid,NULL,f.lesson_on,f.lesson_on,gen_random_uuid(),true);
  RAISE EXCEPTION 'Legacy detached silently repriced';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'PRIVATE_SERIES_AGREEMENT_REVIEW_REQUIRED' THEN RAISE; END IF;
 END;
 SELECT id INTO STRICT s FROM public.teaching_sessions WHERE slot_id=f.root AND slot_occurrence_date=f.lesson_on;
 INSERT INTO public.compensation_agreements(teacher_id,workplace_id,exact_session_id,billing_account_id,
      agreement_role,model,rate_cents,currency,effective_from,effective_to)
   VALUES(f.teacher,f.venue,s,f.payer,'coach_earning','per_session',30000,'USD',f.lesson_on,f.lesson_on)
   RETURNING id INTO v_exact;
 BEGIN
   PERFORM public.ccp_finance_post_private_series_obligation(a,1,20000,s,f.root,f.lesson_on,gen_random_uuid(),true);
   RAISE EXCEPTION 'Series bypassed exact override';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'EXACT_AGREEMENT_REVIEW_REQUIRED' THEN RAISE; END IF;
 END;
 PERFORM public.ccp_finance_post_obligation(v_exact,1,30000,s,NULL,f.lesson_on,f.lesson_on,gen_random_uuid(),true);
 SELECT id INTO STRICT s FROM public.teaching_sessions WHERE source_private_series_id=f.root AND slot_occurrence_date=f.lesson_on+14;
 PERFORM public.ccp_finance_post_private_series_obligation(a,1,20000,s,f.root,f.lesson_on+15,gen_random_uuid(),true);
 SELECT id INTO STRICT s FROM public.teaching_sessions WHERE source_private_series_id=f.unrelated;
 PERFORM public.ccp_finance_post_obligation(b,1,10000,s,NULL,f.lesson_on,f.lesson_on,gen_random_uuid(),true);
 IF EXISTS(SELECT 1 FROM public.received_payments WHERE billing_account_id=f.payer) THEN RAISE EXCEPTION 'Unexpected received payment'; END IF;
END;
$finance$;
ROLLBACK;
