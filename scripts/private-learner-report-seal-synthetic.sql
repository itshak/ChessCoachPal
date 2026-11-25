-- Disposable exact-candidate proof. Nothing is published to recipients.
BEGIN;
CREATE TEMP TABLE seal_fixture(key text PRIMARY KEY,value jsonb) ON COMMIT DROP;
GRANT SELECT,INSERT ON seal_fixture TO authenticated;
DO $seed$
DECLARE t uuid:='00000000-0000-0000-0000-000000000001';
        learner uuid:='10000000-0000-0000-0000-000000000001';
        w uuid; s uuid; i int;
BEGIN
 SELECT id INTO STRICT w FROM public.workplaces WHERE teacher_id=t ORDER BY created_at,id LIMIT 1;
 INSERT INTO seal_fixture VALUES('workplace',to_jsonb(w));
 FOR i IN 1..2 LOOP
  INSERT INTO public.teaching_sessions(teacher_id,workplace_id,roster_mode,local_timezone,
   starts_at,duration_minutes,title,lesson_note,request_id)
  VALUES(t,w,'ad_hoc','Asia/Jerusalem',
   ((current_date-2)+make_time(9+i,0,0)) AT TIME ZONE 'Asia/Jerusalem',
   30,'Private synthetic lesson','Never include this text',gen_random_uuid())
  RETURNING id INTO s;
  INSERT INTO public.session_participants(teacher_id,session_id,student_id) VALUES(t,s,learner);
  UPDATE public.teaching_sessions SET status='completed' WHERE id=s;
  INSERT INTO seal_fixture VALUES('session'||i,to_jsonb(s));
 END LOOP;
 IF has_table_privilege('authenticated','public.report_publication_snapshots','SELECT')
  OR has_table_privilege('service_role','public.report_publication_snapshots','SELECT')
  OR has_function_privilege('anon','public.ccp_private_report_seal(uuid,uuid,date,date,text,text,uuid,boolean)','EXECUTE')
  OR has_function_privilege('anon','public.ccp_private_report_snapshot_get(uuid)','EXECUTE')
  OR has_function_privilege('service_role','public.ccp_private_report_snapshot_get(uuid)','EXECUTE')
  OR has_function_privilege('authenticated','public.ccp_private_report_review_internal(uuid,uuid,uuid,date,date,text)','EXECUTE')
  THEN RAISE EXCEPTION 'UNEXPECTED_SEAL_ACL'; END IF;
END;
$seed$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $base_plan$
DECLARE learner uuid:='10000000-0000-0000-0000-000000000001';
 w uuid:=(SELECT (value#>>'{}')::uuid FROM seal_fixture WHERE key='workplace');
 d date:=current_date-2; review jsonb;
BEGIN
 review:=public.ccp_private_report_review(learner,w,d,d,'en');
 IF jsonb_array_length(review->'candidate'->'records')<>2 THEN
  RAISE EXCEPTION 'PREVIEW_WRONGLY_REQUIRES_ENTITLEMENT';
 END IF;
 BEGIN
  PERFORM public.ccp_private_report_seal(learner,w,d,d,'en',review->>'reviewDigest',gen_random_uuid(),true);
  RAISE EXCEPTION 'UNENTITLED_REPORT_SEAL_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'UPGRADE_REQUIRED' THEN RAISE; END IF;
 END;
END;
$base_plan$;
RESET ROLE;
INSERT INTO public.teacher_entitlement_grants(teacher_id,kind,capability_key,capability_kind,
 boolean_value,reason,request_id)
VALUES('00000000-0000-0000-0000-000000000001','capability_boost',
 'reports.publish','boolean',true,'Disposable report seal proof',gen_random_uuid());
SET LOCAL ROLE authenticated;
DO $acceptance$
DECLARE
 learner uuid:='10000000-0000-0000-0000-000000000001';
 owner_id uuid:=auth.uid();
 w uuid:=(SELECT (value#>>'{}')::uuid FROM seal_fixture WHERE key='workplace');
 a uuid:=(SELECT (value#>>'{}')::uuid FROM seal_fixture WHERE key='session1');
 b uuid:=(SELECT (value#>>'{}')::uuid FROM seal_fixture WHERE key='session2');
 d date:=current_date-2;
 req uuid:=gen_random_uuid();
 first_read jsonb; latest jsonb; receipt jsonb; empty_review jsonb; saved jsonb;
BEGIN
 PERFORM public.ccp_canonical_attendance_mutate(a,learner,'present','Private A',NULL,'',NULL,gen_random_uuid(),false);
 PERFORM public.ccp_canonical_attendance_mutate(b,learner,'excused','Private B',NULL,'',NULL,gen_random_uuid(),false);
 empty_review:=public.ccp_private_report_review(learner,w,d-180,d-180,'he');
 IF jsonb_array_length(empty_review->'candidate'->'records')<>0 THEN
  RAISE EXCEPTION 'EMPTY_REPORT_TEST_RANGE_NOT_EMPTY';
 END IF;
 BEGIN
  PERFORM public.ccp_private_report_seal(learner,w,d-180,d-180,'he',empty_review->>'reviewDigest',gen_random_uuid(),true);
  RAISE EXCEPTION 'EMPTY_REPORT_SEALED';
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM<>'REPORT_REVIEW_EMPTY' THEN RAISE; END IF;
 END;
 first_read:=public.ccp_private_report_review(learner,w,d,d,'he');
 IF first_read->'candidate'->'records' IS DISTINCT FROM jsonb_build_array(
    jsonb_build_object('localDate',d::text,'attendance','excused'),
    jsonb_build_object('localDate',d::text,'attendance','present'))
  OR first_read ? 'evidence' OR first_read::text LIKE '%Private%' THEN
   RAISE EXCEPTION 'PRIVATE_REPORT_PREVIEW_SHAPE:%',first_read;
 END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000088',true);
 BEGIN
  PERFORM public.ccp_private_report_review(learner,w,d,d,'he');
  RAISE EXCEPTION 'FOREIGN_REPORT_SCOPE_ACCEPTED';
 EXCEPTION WHEN no_data_found THEN
  IF SQLERRM<>'REPORT_SCOPE_NOT_FOUND' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 PERFORM public.ccp_canonical_attendance_mutate(a,learner,'excused','Private revised A',NULL,'',
  (SELECT updated_at FROM public.session_attendance WHERE session_id=a AND student_id=learner),gen_random_uuid(),false);
 PERFORM public.ccp_canonical_attendance_mutate(b,learner,'present','Private revised B',NULL,'',
  (SELECT updated_at FROM public.session_attendance WHERE session_id=b AND student_id=learner),gen_random_uuid(),false);
 latest:=public.ccp_private_report_review(learner,w,d,d,'he');
 IF latest->'candidate' IS DISTINCT FROM first_read->'candidate'
  OR latest->>'reviewDigest' IS NOT DISTINCT FROM first_read->>'reviewDigest'
  THEN RAISE EXCEPTION 'SAME_RENDERED_ROWS_DID_NOT_BIND_CHANGED_SOURCE'; END IF;
 BEGIN
  PERFORM public.ccp_private_report_seal(learner,w,d,d,'he',first_read->>'reviewDigest',req,true);
  RAISE EXCEPTION 'STALE_REPORT_REVIEW_ACCEPTED';
 EXCEPTION WHEN serialization_failure THEN
  IF SQLERRM<>'REPORT_REVIEW_STALE' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.report_publications WHERE request_id=req) THEN
  RAISE EXCEPTION 'STALE_REPORT_PARTIALLY_WRITTEN';
 END IF;
 BEGIN
  PERFORM public.ccp_private_report_seal(learner,w,d,d,'he',latest->>'reviewDigest',req,false);
  RAISE EXCEPTION 'UNCONFIRMED_REPORT_ACCEPTED';
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM<>'REPORT_APPROVAL_REQUIRED' THEN RAISE; END IF;
 END;
 receipt:=public.ccp_private_report_seal(learner,w,d,d,'he',latest->>'reviewDigest',req,true);
 PERFORM public.ccp_canonical_attendance_mutate(a,learner,'late','Private after approval',NULL,'',
  (SELECT updated_at FROM public.session_attendance WHERE session_id=a AND student_id=learner),gen_random_uuid(),false);
 IF public.ccp_private_report_seal(learner,w,d,d,'he',latest->>'reviewDigest',req,true)
    IS DISTINCT FROM receipt THEN RAISE EXCEPTION 'REPORT_REPLAY_CHANGED_RECEIPT'; END IF;
 saved:=public.ccp_private_report_snapshot_get((receipt->>'publicationId')::uuid);
 IF saved IS DISTINCT FROM jsonb_build_object('publicationId',receipt->'publicationId',
   'snapshotDigest',receipt->'snapshotDigest','revision','1','status','sealed','candidate',latest->'candidate')
  THEN RAISE EXCEPTION 'SEALED_OWNER_READ_IS_NOT_EXACT'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000088',true);
 BEGIN
  PERFORM public.ccp_private_report_snapshot_get((receipt->>'publicationId')::uuid);
  RAISE EXCEPTION 'FOREIGN_REPORT_SNAPSHOT_VISIBLE';
 EXCEPTION WHEN no_data_found THEN
  IF SQLERRM<>'REPORT_SCOPE_NOT_FOUND' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 BEGIN
  PERFORM public.ccp_private_report_seal(learner,w,d,d,'en',latest->>'reviewDigest',req,true);
  RAISE EXCEPTION 'REPORT_CONFLICT_REPLAY_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM<>'REPORT_REQUEST_CONFLICT' THEN RAISE; END IF;
 END;
 INSERT INTO seal_fixture VALUES('receipt',receipt),('review',latest),
 ('replay',jsonb_build_object('student',learner,'workplace',w,'day',d,'locale','he',
  'reviewDigest',latest->>'reviewDigest','requestId',req,'receipt',receipt));
END;
$acceptance$;
RESET ROLE;
DO $readback$
DECLARE snap public.report_publication_snapshots%ROWTYPE;
 pub public.report_publications%ROWTYPE;
 receipt jsonb:=(SELECT value FROM seal_fixture WHERE key='receipt');
 approved jsonb:=(SELECT value FROM seal_fixture WHERE key='review');
 a uuid:=(SELECT (value#>>'{}')::uuid FROM seal_fixture WHERE key='session1');
 b uuid:=(SELECT (value#>>'{}')::uuid FROM seal_fixture WHERE key='session2');
BEGIN
 SELECT * INTO STRICT pub FROM public.report_publications WHERE id=(receipt->>'publicationId')::uuid;
 SELECT * INTO STRICT snap FROM public.report_publication_snapshots WHERE publication_id=pub.id;
 IF snap.candidate IS DISTINCT FROM approved->'candidate' OR snap.review_digest IS DISTINCT FROM approved->>'reviewDigest'
  OR pub.snapshot_digest<>encode(sha256(convert_to(snap.candidate::text,'UTF8')),'hex')
  OR NOT snap.evidence @> jsonb_build_array(jsonb_build_object('sessionId',a,'attendance','excused'),
                                        jsonb_build_object('sessionId',b,'attendance','present'))
  OR snap.evidence::text LIKE '%Private%'
  OR EXISTS(SELECT 1 FROM public.report_publication_audiences WHERE publication_id=pub.id) THEN
  RAISE EXCEPTION 'SEALED_EVIDENCE_OR_AUDIENCE_WRONG';
 END IF;
 BEGIN
  UPDATE public.report_publication_snapshots SET candidate='{}' WHERE publication_id=pub.id;
  RAISE EXCEPTION 'SEALED_REPORT_MUTABLE';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'IMMUTABLE_REPORT_SNAPSHOT' THEN RAISE; END IF;
 END;
END;
$readback$;
\if :{?persist_seal_fixture}
SELECT value FROM seal_fixture WHERE key='replay';
COMMIT;
\else
ROLLBACK;
\endif
SELECT 'Disposable private report sealing, provenance binding and exact replay passed.';
