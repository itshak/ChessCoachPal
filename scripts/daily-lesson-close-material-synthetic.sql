-- Exact canonical seed in a disposable database only. No writes survive.
BEGIN;
CREATE TEMP TABLE ccp_combined_synthetic(
 session_id uuid, failed_key uuid, accepted_key uuid, receipts_before integer
) ON COMMIT DROP;
GRANT SELECT,INSERT ON ccp_combined_synthetic TO authenticated;
UPDATE public.teachers SET selected_workplace_id=NULL
 WHERE id='00000000-0000-0000-0000-000000000001';
INSERT INTO auth.users(id,email)
 VALUES('00000000-0000-0000-0000-000000000088','ccp-combined-foreign@synthetic.invalid');
INSERT INTO public.teachers(id,email,display_name)
 VALUES('00000000-0000-0000-0000-000000000088','ccp-combined-foreign@synthetic.invalid','Synthetic far teacher');
INSERT INTO public.learning_materials(id,teacher_id,kind,title,source_url,request_id,request_hash)
 VALUES('c0000000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000001',
 'external_link','Synthetic exact taught link','https://example.invalid/combined',gen_random_uuid(),repeat('a',64));
DO $acl$
BEGIN
 IF has_function_privilege('anon','public.ccp_teacher_daily_session_complete_with_material(uuid,uuid,uuid,timestamptz,text,jsonb,uuid,bigint,uuid[],date,uuid,boolean)','EXECUTE')
 OR has_function_privilege('service_role','public.ccp_teacher_daily_session_complete_with_material(uuid,uuid,uuid,timestamptz,text,jsonb,uuid,bigint,uuid[],date,uuid,boolean)','EXECUTE') THEN
   RAISE EXCEPTION 'WRONG_COMBINED_ACL';
 END IF;
 PERFORM set_config('ccp.synthetic_receipts_before',(SELECT count(*) FROM public.agent_tool_receipts
   WHERE teacher_id='00000000-0000-0000-0000-000000000001')::text,true);
END;$acl$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $case$
DECLARE
 a uuid:='10000000-0000-0000-0000-000000000001';
 b uuid:='10000000-0000-0000-0000-000000000002';
 material_id uuid:='c0000000-0000-4000-8000-000000000011';
 lesson uuid;
 w uuid;
 d date;
 start_at timestamptz;
 rev timestamptz;
 decisions jsonb;
 failed_key uuid:=gen_random_uuid();
 success_key uuid:=gen_random_uuid();
 receipt jsonb;
 retry jsonb;
BEGIN
 SELECT id INTO w FROM public.workplaces WHERE teacher_id=auth.uid()
  ORDER BY created_at,id LIMIT 1;
 start_at:=((current_date-2)+time '09:35') AT TIME ZONE (SELECT timezone FROM public.workplaces WHERE id=w);
 d:=(start_at AT TIME ZONE (SELECT timezone FROM public.workplaces WHERE id=w))::date;
 lesson:=(public.ccp_teacher_ad_hoc_session_create(w,ARRAY[a,b],'Synthetic combined lesson',
   start_at,35,'Original shared note',gen_random_uuid())->>'id')::uuid;
 SELECT updated_at INTO STRICT rev FROM public.teaching_sessions WHERE id=lesson;
 decisions:=jsonb_build_array(
  jsonb_build_object('studentId',a,'status','present','note','Independent note A','expectedUpdatedAt',null),
  jsonb_build_object('studentId',b,'status','absent','note','Independent note B','expectedUpdatedAt',null));
 BEGIN
  PERFORM public.ccp_teacher_daily_session_complete_with_material(lesson,w,NULL,rev,'Combined shared note',
   decisions,material_id,1,ARRAY[b],d,failed_key,true);
  RAISE EXCEPTION 'UNATTESTED_TEACHING_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'MATERIAL_LEARNER_NOT_PRESENT' THEN RAISE; END IF;
 END;
 IF NOT EXISTS(SELECT 1 FROM public.teaching_sessions WHERE id=lesson AND updated_at=rev
   AND status='scheduled' AND lesson_note='Original shared note')
 OR EXISTS(SELECT 1 FROM public.session_attendance WHERE session_id=lesson)
 OR EXISTS(SELECT 1 FROM public.material_links WHERE session_id=lesson)
 OR EXISTS(SELECT 1 FROM public.material_teaching_evidence WHERE session_id=lesson) THEN
  RAISE EXCEPTION 'COMBINED_PARTIAL_WRITE_ON_MATERIAL_FAILURE';
 END IF;
 BEGIN
  PERFORM public.ccp_teacher_daily_session_complete_with_material(lesson,w,NULL,rev,'Combined shared note',
   decisions,material_id,2,ARRAY[a],d,gen_random_uuid(),true);
  RAISE EXCEPTION 'STALE_MATERIAL_REVISION_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM<>'STALE_DAILY_MATERIAL_REVISION' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000088',true);
 BEGIN
  PERFORM public.ccp_teacher_daily_session_complete_with_material(lesson,w,NULL,rev,'Foreign synthetic attempt',
   decisions,material_id,1,ARRAY[a],d,gen_random_uuid(),true);
  RAISE EXCEPTION 'FOREIGN_COMBINED_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'NOT_FOUND' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 receipt:=public.ccp_teacher_daily_session_complete_with_material(lesson,w,NULL,rev,'Combined shared note',
   decisions,material_id,1,ARRAY[a],d,success_key,true);
 retry:=public.ccp_teacher_daily_session_complete_with_material(lesson,w,NULL,rev,'Combined shared note',
   decisions,material_id,1,ARRAY[a],d,success_key,true);
 IF receipt->>'oneTransaction' IS DISTINCT FROM 'true' OR
    receipt->>'inferredMastery' IS DISTINCT FROM 'false' OR
    retry IS DISTINCT FROM receipt||jsonb_build_object('replayed',true) THEN
  RAISE EXCEPTION 'COMBINED_RECEIPT_MISMATCH';
 END IF;
 BEGIN
  PERFORM public.ccp_teacher_daily_session_complete_with_material(lesson,w,NULL,rev,'Different shared note',
   decisions,material_id,1,ARRAY[a],d,success_key,true);
  RAISE EXCEPTION 'COMBINED_CONFLICT_REPLAY_ALLOWED';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM<>'DAILY_COMBINED_REPLAY_CONFLICT' THEN RAISE; END IF;
 END;
 INSERT INTO ccp_combined_synthetic VALUES(lesson,failed_key,success_key,
   current_setting('ccp.synthetic_receipts_before')::int);
END;$case$;
RESET ROLE;
DO $verify$
DECLARE proof ccp_combined_synthetic%ROWTYPE;
BEGIN
 SELECT * INTO STRICT proof FROM ccp_combined_synthetic;
 IF NOT EXISTS(SELECT 1 FROM public.teaching_sessions WHERE id=proof.session_id
   AND status='completed' AND lesson_note='Combined shared note')
 OR (SELECT count(*) FROM public.session_participants WHERE session_id=proof.session_id)<>2
 OR (SELECT count(*) FROM public.session_attendance WHERE session_id=proof.session_id)<>2
 OR NOT EXISTS(SELECT 1 FROM public.session_attendance WHERE session_id=proof.session_id
   AND status='present' AND note='Independent note A')
 OR NOT EXISTS(SELECT 1 FROM public.session_attendance WHERE session_id=proof.session_id
   AND status='absent' AND note='Independent note B')
 OR (SELECT count(*) FROM public.material_links WHERE session_id=proof.session_id)<>1
 OR (SELECT count(*) FROM public.material_teaching_evidence WHERE session_id=proof.session_id)<>1
 OR NOT EXISTS(SELECT 1 FROM public.material_teaching_evidence WHERE session_id=proof.session_id
   AND stage='taught' AND student_id='10000000-0000-0000-0000-000000000001')
 OR EXISTS(SELECT 1 FROM public.agent_tool_receipts WHERE idempotency_key=proof.failed_key)
 OR NOT EXISTS(SELECT 1 FROM public.agent_tool_receipts WHERE idempotency_key=proof.accepted_key
   AND operation='daily.session.completeWithMaterial.v1')
 OR (SELECT count(*) FROM public.agent_tool_receipts
   WHERE teacher_id='00000000-0000-0000-0000-000000000001')<>proof.receipts_before+3 THEN
  RAISE EXCEPTION 'COMBINED_INDEPENDENT_READBACK_WRONG';
 END IF;
END;$verify$;
ROLLBACK;
SELECT 'DAILY_COMBINED_SYNTHETIC_ATOMIC_PASS';
