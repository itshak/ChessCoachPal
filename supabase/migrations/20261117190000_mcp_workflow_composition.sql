-- Explicit, additive forward-only current-schema MCP coaching workflow extension.
-- Do NOT apply the fresh-install baseline or reset running teacher databases.
-- Review backup/restore and operator approval before deployment.

-- ChessCoachPal current-schema addition: one confirmed completed group-lesson
-- workflow, using the existing canonical session and attendance transactions.
-- This SQL is intentionally additive/idempotent and must be applied to a live
-- database only via the explicitly reviewed forward-only migration process.
CREATE OR REPLACE FUNCTION public.ccp_teacher_completed_group_lesson_create(
 p_workplace_id uuid,p_student_ids uuid[],p_title text,
 p_starts_at timestamptz,p_duration_minutes integer,p_lesson_note text,
 p_attendance jsonb,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=public,pg_temp AS $completed_group_lesson$
DECLARE
 v_teacher uuid:=auth.uid();
 v_hash text;
 v_saved public.agent_tool_receipts%ROWTYPE;
 v_row jsonb;
 v_roster uuid[]:=ARRAY[]::uuid[];
 v_attendance_students uuid[]:=ARRAY[]::uuid[];
 v_session jsonb;
 v_session_id uuid;
 v_session_revision timestamptz;
 v_attendance jsonb:='[]'::jsonb;
 v_completed jsonb;
 v_receipt jsonb;
 v_session_key uuid;
 v_completion_key uuid;
 v_student uuid;
BEGIN
 IF v_teacher IS NULL THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 IF p_workplace_id IS NULL OR p_request_id IS NULL OR
    p_starts_at IS NULL OR p_duration_minutes NOT BETWEEN 15 AND 480 OR
    cardinality(p_student_ids) NOT BETWEEN 2 AND 50 OR
    jsonb_typeof(p_attendance) IS DISTINCT FROM 'array' OR
    jsonb_array_length(p_attendance)<>cardinality(p_student_ids) OR
    char_length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 160 OR
    char_length(coalesce(p_lesson_note,''))>10000 THEN
  RAISE EXCEPTION 'INVALID_COMPLETED_LESSON' USING ERRCODE='22023';
 END IF;
 FOREACH v_student IN ARRAY p_student_ids LOOP
  IF v_student IS NULL OR v_student=ANY(v_roster) THEN
    RAISE EXCEPTION 'DUPLICATE_ROSTER_REFERENCE' USING ERRCODE='22023';
  END IF;
  v_roster:=array_append(v_roster,v_student);
 END LOOP;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_attendance) LOOP
  IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' OR
     (v_row - ARRAY['studentId','status','note','noticeAt','cancelReason'])<>'{}'::jsonb OR
     jsonb_typeof(v_row->'studentId') IS DISTINCT FROM 'string' OR
     jsonb_typeof(v_row->'status') IS DISTINCT FROM 'string' OR
     v_row->>'status' NOT IN ('present','absent','late','excused','student_cancelled','teacher_cancelled') OR
     char_length(coalesce(v_row->>'note',''))>5000 OR
     (v_row ? 'note' AND jsonb_typeof(v_row->'note') IS DISTINCT FROM 'string') OR
     (v_row ? 'noticeAt' AND jsonb_typeof(v_row->'noticeAt') IS DISTINCT FROM 'string') OR
     (v_row ? 'cancelReason' AND
        (jsonb_typeof(v_row->'cancelReason') IS DISTINCT FROM 'string' OR
         char_length(v_row->>'cancelReason')>1000)) THEN
    RAISE EXCEPTION 'INVALID_COMPLETED_LESSON_ATTENDANCE' USING ERRCODE='22023';
  END IF;
  v_student:=(v_row->>'studentId')::uuid;
  IF v_student<>ALL(v_roster) OR v_student=ANY(v_attendance_students) THEN
    RAISE EXCEPTION 'ATTENDANCE_ROSTER_MISMATCH' USING ERRCODE='22023';
  END IF;
  v_attendance_students:=array_append(v_attendance_students,v_student);
  -- Canonical commit requires an explicit null revision for an unmarked learner.
  v_attendance:=v_attendance||jsonb_build_array(
    v_row||jsonb_build_object('expectedUpdatedAt',NULL));
 END LOOP;
 IF cardinality(v_attendance_students)<>cardinality(v_roster) THEN
   RAISE EXCEPTION 'INCOMPLETE_SESSION_ROSTER' USING ERRCODE='22023';
 END IF;
 v_hash:=md5(jsonb_build_array('lessons.capture.completed',p_workplace_id,
   p_student_ids,p_title,p_starts_at,p_duration_minutes,
   coalesce(p_lesson_note,''),p_attendance)::text);
 -- One teacher lock plus one SQL transaction protects the complete unit of work.
 PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 INSERT INTO public.agent_tool_receipts
   (teacher_id,idempotency_key,operation,request_hash,receipt)
 VALUES(v_teacher,p_request_id,'lessons.capture.completed',v_hash,'{}'::jsonb)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
  SELECT * INTO v_saved FROM public.agent_tool_receipts
   WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
  IF NOT FOUND OR v_saved.operation<>'lessons.capture.completed' OR
     v_saved.request_hash<>v_hash THEN
    RAISE EXCEPTION 'COMPLETED_LESSON_REPLAY_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN v_saved.receipt||jsonb_build_object('replayed',true);
 END IF;
 -- Distinct deterministic child keys; no extra AI-generated UUIDs needed.
 v_session_key:=md5(p_request_id::text||':completed-group-session')::uuid;
 v_completion_key:=md5(p_request_id::text||':completed-group-attendance')::uuid;
 v_session:=public.ccp_teacher_ad_hoc_session_create(
   p_workplace_id,p_student_ids,p_title,p_starts_at,
   p_duration_minutes,coalesce(p_lesson_note,''),v_session_key);
 v_session_id:=(v_session->>'id')::uuid;
 SELECT updated_at INTO v_session_revision FROM public.teaching_sessions
  WHERE teacher_id=v_teacher AND id=v_session_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 v_completed:=public.ccp_teacher_session_commit(
   v_session_id,jsonb_build_object('status','completed'),
   v_attendance,v_session_revision,v_completion_key);
 v_receipt:=jsonb_build_object(
   'sessionId',v_session_id,'workplaceId',p_workplace_id,
   'status','completed','rosterMode','ad_hoc','participantCount',cardinality(v_roster),
   'instructorMinutes',p_duration_minutes,'attendance',
   (SELECT jsonb_agg(jsonb_build_object('studentId',x->>'studentId',
      'status',x->>'status','hasNote',length(coalesce(x->>'note',''))>0))
      FROM jsonb_array_elements(p_attendance) x),
   'oneTransaction',true,'replayed',false,'inferredMastery',false);
 UPDATE public.agent_tool_receipts SET receipt=v_receipt
  WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
 RETURN v_receipt;
END;
$completed_group_lesson$;
REVOKE ALL ON FUNCTION public.ccp_teacher_completed_group_lesson_create(
 uuid,uuid[],text,timestamptz,integer,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_completed_group_lesson_create(
 uuid,uuid[],text,timestamptz,integer,text,jsonb,uuid) TO authenticated;

-- Atomic teacher-approved material use in one existing canonical completed lesson.
-- Scope: typed catalog material (existing or newly created) + one session link +
-- independent per-participant teacher attestations. No inference of mastery,
-- calendar session creation, external provider write, email or payment.
CREATE OR REPLACE FUNCTION public.ccp_teacher_lesson_material_use_commit(
 p_session_id uuid,p_expected_updated_at timestamptz,
 p_material_id uuid,p_new_material jsonb,p_student_evidence jsonb,
 p_occurred_on date,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=public,pg_temp AS $lesson_material_use$
DECLARE
 v_teacher uuid:=auth.uid();
 v_session public.teaching_sessions%ROWTYPE;
 v_material uuid;
 v_created boolean:=false;
 v_material_receipt jsonb;
 v_link_id uuid;
 v_link_request_id uuid;
 v_row jsonb;
 v_student uuid;
 v_seen uuid[]:=ARRAY[]::uuid[];
 v_evidence_ids uuid[]:=ARRAY[]::uuid[];
 v_counter integer:=0;
 v_hash text;
 v_saved public.agent_tool_receipts%ROWTYPE;
 v_receipt jsonb;
 v_timezone text;
BEGIN
 IF v_teacher IS NULL THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 IF p_session_id IS NULL OR p_expected_updated_at IS NULL OR
    p_request_id IS NULL OR p_occurred_on IS NULL OR
    (p_material_id IS NULL)=(p_new_material IS NULL) OR
    (p_new_material IS NOT NULL AND
      (jsonb_typeof(p_new_material)<>'object' OR
       (p_new_material - ARRAY['kind','title','description','sourceUrl','details','requestId'])<>'{}'::jsonb)) OR
    jsonb_typeof(p_student_evidence) IS DISTINCT FROM 'array' OR
    jsonb_array_length(p_student_evidence) NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'INVALID_LESSON_MATERIAL_USE' USING ERRCODE='22023';
 END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_student_evidence) LOOP
  IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' OR
     (v_row - ARRAY['studentId','stage','note'])<>'{}'::jsonb OR
     jsonb_typeof(v_row->'studentId') IS DISTINCT FROM 'string' OR
     v_row->>'stage' NOT IN ('assigned','taught','completed') OR
     (v_row ? 'note' AND jsonb_typeof(v_row->'note') IS DISTINCT FROM 'string') OR
     char_length(coalesce(v_row->>'note',''))>2000 THEN
   RAISE EXCEPTION 'INVALID_LESSON_MATERIAL_EVIDENCE' USING ERRCODE='22023';
  END IF;
  v_student:=(v_row->>'studentId')::uuid;
  IF v_student=ANY(v_seen) THEN
   RAISE EXCEPTION 'DUPLICATE_MATERIAL_STUDENT' USING ERRCODE='22023';
  END IF;
  v_seen:=array_append(v_seen,v_student);
 END LOOP;
 PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';END IF;
 v_hash:=md5(jsonb_build_array('lesson.material.use',p_session_id,
   p_expected_updated_at,p_material_id,p_new_material,p_student_evidence,p_occurred_on)::text);
 INSERT INTO public.agent_tool_receipts(teacher_id,idempotency_key,operation,request_hash,receipt)
 VALUES(v_teacher,p_request_id,'lesson.material.use',v_hash,'{}'::jsonb)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
  SELECT * INTO v_saved FROM public.agent_tool_receipts
   WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
  IF NOT FOUND OR v_saved.operation<>'lesson.material.use' OR
     v_saved.request_hash<>v_hash THEN
    RAISE EXCEPTION 'LESSON_MATERIAL_REPLAY_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN v_saved.receipt||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO v_session FROM public.teaching_sessions
  WHERE id=p_session_id AND teacher_id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF v_session.status<>'completed' THEN
  RAISE EXCEPTION 'LESSON_NOT_COMPLETED' USING ERRCODE='23514';
 END IF;
 IF v_session.updated_at IS DISTINCT FROM p_expected_updated_at THEN
  RAISE EXCEPTION 'STALE_LESSON_REVISION' USING ERRCODE='23505';
 END IF;
 SELECT timezone INTO v_timezone FROM public.workplaces
  WHERE id=v_session.workplace_id AND teacher_id=v_teacher;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';END IF;
 IF (v_session.starts_at AT TIME ZONE coalesce(v_session.local_timezone,v_timezone))::date
   <>p_occurred_on THEN
  RAISE EXCEPTION 'MATERIAL_DATE_MISMATCH' USING ERRCODE='22023';
 END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_student_evidence) LOOP
  IF v_row->>'stage' IN ('taught','completed') AND NOT EXISTS(
   SELECT 1 FROM public.session_attendance
    WHERE teacher_id=v_teacher AND session_id=p_session_id
      AND student_id=(v_row->>'studentId')::uuid
      AND status IN ('present','late')
  ) THEN
   RAISE EXCEPTION 'MATERIAL_LEARNER_NOT_PRESENT' USING ERRCODE='23514';
  END IF;
 END LOOP;
 FOREACH v_student IN ARRAY v_seen LOOP
  PERFORM 1 FROM public.session_participants
    WHERE teacher_id=v_teacher AND session_id=p_session_id
      AND student_id=v_student;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'MATERIAL_STUDENT_NOT_IN_SESSION' USING ERRCODE='42501';
  END IF;
 END LOOP;
 IF p_material_id IS NOT NULL THEN
  SELECT id INTO v_material FROM public.learning_materials
   WHERE teacher_id=v_teacher AND id=p_material_id AND archived_at IS NULL
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 ELSE
  -- Existing exact title must be reviewed and selected instead of silently
  -- creating a second, superficially identical resource.
  PERFORM 1 FROM public.learning_materials
   WHERE teacher_id=v_teacher AND kind=p_new_material->>'kind'
     AND lower(btrim(title))=lower(btrim(p_new_material->>'title'))
     AND archived_at IS NULL;
  IF FOUND THEN
   RAISE EXCEPTION 'MATERIAL_TITLE_ALREADY_EXISTS' USING ERRCODE='23505';
  END IF;
  v_material_receipt:=public.ccp_material_catalog_create(
   p_new_material->>'kind',p_new_material->>'title',
   coalesce(p_new_material->>'description',''),
   nullif(p_new_material->>'sourceUrl',''),p_new_material->'details',
   (p_new_material->>'requestId')::uuid);
  v_material:=(v_material_receipt->>'id')::uuid;
  v_created:=true;
 END IF;
 IF EXISTS(
   SELECT 1 FROM public.material_links WHERE teacher_id=v_teacher
     AND material_id=v_material AND session_id=p_session_id AND student_id IS NULL
 ) THEN
   RAISE EXCEPTION 'MATERIAL_ALREADY_LINKED' USING ERRCODE='23505';
 END IF;
 v_link_request_id:=md5(p_request_id::text||':lesson-material-link')::uuid;
 INSERT INTO public.material_links(teacher_id,material_id,session_id,request_id)
 VALUES(v_teacher,v_material,p_session_id,v_link_request_id)
 RETURNING id INTO v_link_id;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_student_evidence) LOOP
  v_counter:=v_counter+1;
  INSERT INTO public.material_teaching_evidence(
   teacher_id,student_id,workplace_id,session_id,material_id,
   stage,occurred_on,note,request_id)
  VALUES(v_teacher,(v_row->>'studentId')::uuid,v_session.workplace_id,
   p_session_id,v_material,v_row->>'stage',p_occurred_on,
   coalesce(v_row->>'note',''),md5(p_request_id::text||':student-evidence:'||v_counter)::uuid)
  RETURNING id INTO v_student;
  v_evidence_ids:=array_append(v_evidence_ids,v_student);
 END LOOP;
 v_receipt:=jsonb_build_object('sessionId',p_session_id,
  'materialId',v_material,'linkId',v_link_id,'newMaterialCreated',v_created,
  'evidenceIds',v_evidence_ids,'evidenceCount',v_counter,
  'oneTransaction',true,'replayed',false,'inferredMastery',false);
 UPDATE public.agent_tool_receipts SET receipt=v_receipt
  WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
 RETURN v_receipt;
END;
$lesson_material_use$;
REVOKE ALL ON FUNCTION public.ccp_teacher_lesson_material_use_commit(
 uuid,timestamptz,uuid,jsonb,jsonb,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_lesson_material_use_commit(
 uuid,timestamptz,uuid,jsonb,jsonb,date,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
