-- Synthetic checked scope; run only on disposable baseline plus seed.
BEGIN;
\set ON_ERROR_STOP on
INSERT INTO public.students(id,teacher_id,name,lichess_username) VALUES
 ('ad180000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000001','Synthetic manual rating','ManualFixture'),
 ('ad180000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000001','Synthetic manual rating other','ManualFixture'),
 ('ad180000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000001','Synthetic empty lifetime','ManualFixture');
CREATE TEMP TABLE mro(id uuid PRIMARY KEY, epoch text);
INSERT INTO mro SELECT id,online_rating_binding_epoch::text FROM public.students
 WHERE id IN ('ad180000-0000-4000-8000-000000000001','ad180000-0000-4000-8000-000000000002','ad180000-0000-4000-8000-000000000003');
GRANT SELECT ON mro TO service_role,authenticated;
CREATE FUNCTION pg_temp.manual_obs() RETURNS jsonb LANGUAGE sql AS $$
 SELECT '[{"time_control":"blitz","rating":1500,"rating_deviation":null,"provisional":false,"games":15,"observed_at":"2026-01-01T12:00:00Z"},{"time_control":"rapid","rating":1600,"rating_deviation":60,"provisional":false,"games":20,"observed_at":"2026-01-01T12:00:00Z"}]'::jsonb
$$;
CREATE FUNCTION pg_temp.manual_digest(sid uuid,ep text,provider text DEFAULT 'lichess') RETURNS text LANGUAGE sql AS $$
 SELECT encode(extensions.digest(format('["manual-online-rating-v2","%s","%s","ManualFixture","%s",[["blitz",1500,null,false,15],["rapid",1600,60,false,20]]]',sid,provider,ep),'sha256'),'hex')
$$;
DO $$ BEGIN
 IF has_function_privilege('anon','public.ccp_manual_online_rating_binding(uuid,uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.ccp_manual_online_rating_commit(uuid,uuid,text,text,text,uuid,text,timestamptz,jsonb)','EXECUTE')
 OR has_sequence_privilege('authenticated','public.ccp_online_rating_binding_epoch_seq','USAGE')
 OR has_sequence_privilege('service_role','public.ccp_online_rating_binding_epoch_seq','USAGE')
 THEN RAISE EXCEPTION 'Wrong manual rating grant'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
UPDATE public.students SET teacher_notes='Unrelated',online_rating_binding_epoch=1 WHERE id=(SELECT min(id::text)::uuid FROM mro);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.students s JOIN mro ON s.id=mro.id WHERE s.online_rating_binding_epoch::text<>mro.epoch)
 THEN RAISE EXCEPTION 'Unrelated local edit changed epoch or accepted caller override'; END IF;
END $$;
UPDATE public.students SET lichess_username='TemporaryHandle' WHERE id='ad180000-0000-4000-8000-000000000002';
UPDATE public.students SET lichess_username='ManualFixture' WHERE id='ad180000-0000-4000-8000-000000000002';
SELECT (public.ccp_student_lifecycle_commit('ad180000-0000-4000-8000-000000000002','archive',
  (SELECT updated_at FROM public.students WHERE id='ad180000-0000-4000-8000-000000000002'),
  ARRAY[]::uuid[],gen_random_uuid(),'Synthetic rating lifecycle test',true))->>'mode';
SELECT (public.ccp_student_lifecycle_commit('ad180000-0000-4000-8000-000000000002','reactivate',
  (SELECT updated_at FROM public.students WHERE id='ad180000-0000-4000-8000-000000000002'),
  ARRAY[]::uuid[],gen_random_uuid(),'Synthetic rating lifecycle test',true))->>'mode';
DELETE FROM public.students WHERE id='ad180000-0000-4000-8000-000000000003';
INSERT INTO public.students(id,teacher_id,name,lichess_username,online_rating_binding_epoch) VALUES
 ('ad180000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000001','Synthetic recreated manual rating','ManualFixture',1);
RESET ROLE;
SET LOCAL ROLE service_role;
DO $test$
DECLARE a uuid:='ad180000-0000-4000-8000-000000000001'; b uuid:='ad180000-0000-4000-8000-000000000002'; c uuid:='ad180000-0000-4000-8000-000000000003';
 t uuid:='00000000-0000-0000-0000-000000000001'; other uuid:='00000000-0000-0000-0000-000000000002';
 k uuid:='ad180000-0000-4000-8000-000000001000'; ep text; epold text; epdeleted text; receipt jsonb; bad jsonb;
BEGIN
 SELECT epoch INTO ep FROM mro WHERE id=a; SELECT epoch INTO epold FROM mro WHERE id=b; SELECT epoch INTO epdeleted FROM mro WHERE id=c;
 IF public.ccp_manual_online_rating_binding(other,a,'lichess') IS NOT NULL OR
   public.ccp_manual_online_rating_binding(t,b,'lichess')->>'epoch'=epold OR
   public.ccp_manual_online_rating_binding(t,c,'lichess')->>'epoch'=epdeleted THEN
  RAISE EXCEPTION 'Wrong owner or recreated epoch';
 END IF;
 BEGIN
  PERFORM public.ccp_manual_online_rating_commit(t,b,'lichess','ManualFixture',epold,k,pg_temp.manual_digest(b,epold),now(),pg_temp.manual_obs());
  RAISE EXCEPTION 'Handle and archive ABA accepted stale epoch';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'RATING_MANUAL_REFRESH_STALE' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ccp_manual_online_rating_commit(t,c,'lichess','ManualFixture',epdeleted,k,pg_temp.manual_digest(c,epdeleted),now(),pg_temp.manual_obs());
  RAISE EXCEPTION 'Recreated student accepted stale epoch';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'RATING_MANUAL_REFRESH_STALE' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ccp_manual_online_rating_commit(other,a,'lichess','ManualFixture',ep,k,pg_temp.manual_digest(a,ep),now(),pg_temp.manual_obs());
  RAISE EXCEPTION 'Foreign student accepted';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'RATING_MANUAL_REFRESH_STALE' THEN RAISE; END IF;
 END;
 bad:=jsonb_set(pg_temp.manual_obs(),'{1,rating}','1999');
 BEGIN
  PERFORM public.ccp_manual_online_rating_commit(t,a,'lichess','ManualFixture',ep,k,pg_temp.manual_digest(a,ep),now(),bad);
  RAISE EXCEPTION 'Mismatched evidence accepted';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'RATING_MANUAL_REFRESH_EVIDENCE_MISMATCH' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ccp_manual_online_rating_commit(t,a,'fide','ManualFixture',ep,k,pg_temp.manual_digest(a,ep,'fide'),now(),pg_temp.manual_obs());
  RAISE EXCEPTION 'Official provider accepted in online manual path';
 EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM<>'RATING_MANUAL_REFRESH_BAD_PAYLOAD' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.student_rating_snapshots WHERE teacher_id=t AND request_id=k) THEN RAISE EXCEPTION 'Partial evidence persisted'; END IF;
 receipt:=public.ccp_manual_online_rating_commit(t,a,'lichess','ManualFixture',ep,k,pg_temp.manual_digest(a,ep),now(),pg_temp.manual_obs());
 IF receipt<>'{"replayed":false}' OR (SELECT count(*) FROM public.student_rating_snapshots WHERE teacher_id=t AND request_id=k)<>2 THEN
  RAISE EXCEPTION 'Authoritative batch was not exact'; END IF;
END $test$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT (public.ccp_student_lifecycle_commit('ad180000-0000-4000-8000-000000000001','archive',
  (SELECT updated_at FROM public.students WHERE id='ad180000-0000-4000-8000-000000000001'),
  ARRAY[]::uuid[],gen_random_uuid(),'Synthetic rating lifecycle test',true))->>'mode';
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE a uuid:='ad180000-0000-4000-8000-000000000001'; ep text;
BEGIN
 SELECT epoch INTO ep FROM mro WHERE id=a;
 IF public.ccp_manual_online_rating_commit('00000000-0000-0000-0000-000000000001',a,'lichess','ManualFixture',ep,
  'ad180000-0000-4000-8000-000000001000',pg_temp.manual_digest(a,ep),now(),pg_temp.manual_obs())<>'{"replayed":true}' THEN
  RAISE EXCEPTION 'Existing exact receipt lost after archive';
 END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  INSERT INTO public.student_rating_snapshots(teacher_id,student_id,provider,time_control,rating,source,observed_at,request_id)
  VALUES('00000000-0000-0000-0000-000000000001','ad180000-0000-4000-8000-000000000002','lichess','bullet',1470,'teacher_manual',now(),'ad180000-0000-4000-8000-000000001000');
  RAISE EXCEPTION 'Raw manual entry mixed disjoint categories with earlier provider batch';
 EXCEPTION WHEN unique_violation THEN IF SQLERRM<>'RATING_REQUEST_CONFLICT' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;
ROLLBACK;
