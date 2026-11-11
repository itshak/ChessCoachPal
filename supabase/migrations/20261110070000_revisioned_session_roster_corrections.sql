-- Explicit, revision-checked correction of a frozen teaching-session roster.
-- The original roster and removed attendance evidence are preserved in an
-- append-only, owner-scoped audit. Corrections affecting attached chess
-- observations/materials are refused instead of silently deleting teaching
-- evidence. Both website and MCP use this exact authenticated transaction.

CREATE TABLE public.session_roster_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  request_id uuid NOT NULL,
  previous_students jsonb NOT NULL,
  corrected_students jsonb NOT NULL,
  removed_attendance jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id,teacher_id) REFERENCES public.teaching_sessions(id,teacher_id) ON DELETE CASCADE,
  UNIQUE (teacher_id, request_id),
  CONSTRAINT roster_correction_reason_chk CHECK (char_length(btrim(reason)) BETWEEN 8 AND 1000),
  CONSTRAINT roster_correction_students_chk CHECK (
    jsonb_typeof(previous_students)='array' AND jsonb_typeof(corrected_students)='array'
    AND jsonb_typeof(removed_attendance)='array'
  )
);
ALTER TABLE public.session_roster_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_roster_corrections_read_own
 ON public.session_roster_corrections FOR SELECT TO authenticated
 USING (teacher_id=auth.uid());
REVOKE ALL ON public.session_roster_corrections FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.session_roster_corrections TO authenticated;
GRANT ALL ON public.session_roster_corrections TO service_role;

CREATE OR REPLACE FUNCTION public.ccp_session_roster_correct(
 p_session_id uuid,
 p_student_ids uuid[],
 p_expected_updated_at timestamptz,
 p_request_id uuid,
 p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_teacher uuid:=auth.uid();
 v_session public.teaching_sessions%ROWTYPE;
 v_before uuid[];v_after uuid[];v_removed uuid[];v_added uuid[];
 v_removed_attendance jsonb;
 v_hash text;v_saved public.agent_tool_receipts%ROWTYPE;
 v_updated timestamptz;v_audit_id uuid;v_receipt jsonb;
BEGIN
 IF v_teacher IS NULL THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 IF p_session_id IS NULL OR p_expected_updated_at IS NULL
   OR p_request_id IS NULL OR p_student_ids IS NULL
   OR cardinality(p_student_ids) NOT BETWEEN 1 AND 100
   OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 8 AND 1000
   OR array_position(p_student_ids,NULL) IS NOT NULL
 THEN
   RAISE EXCEPTION 'INVALID_ROSTER_CORRECTION' USING ERRCODE='22023';
 END IF;

 v_after:=ARRAY(SELECT x FROM unnest(p_student_ids) AS x ORDER BY x);
 IF (SELECT count(DISTINCT x) FROM unnest(v_after) AS x)<>cardinality(v_after) THEN
   RAISE EXCEPTION 'DUPLICATE_ROSTER_STUDENT' USING ERRCODE='22023';
 END IF;

 -- Lock the tenant so concurrent browser/MCP writes cannot interleave roster
 -- and attendance changes. Replayed IDs return their original receipt.
 PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
 END IF;
 v_hash:=md5(jsonb_build_array(
   'session.roster.correct',p_session_id,to_jsonb(v_after),
   p_expected_updated_at,p_reason)::text);
 INSERT INTO public.agent_tool_receipts(
   teacher_id,idempotency_key,operation,request_hash,receipt
 ) VALUES(v_teacher,p_request_id,'session.roster.correct',v_hash,'{}'::jsonb)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO v_saved FROM public.agent_tool_receipts
   WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
   IF NOT FOUND OR v_saved.operation<>'session.roster.correct'
     OR v_saved.request_hash<>v_hash THEN
     RAISE EXCEPTION 'ROSTER_REPLAY_CONFLICT' USING ERRCODE='23505';
   END IF;
   RETURN v_saved.receipt;
 END IF;

 SELECT * INTO v_session FROM public.teaching_sessions
 WHERE id=p_session_id AND teacher_id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';END IF;
 IF v_session.updated_at IS DISTINCT FROM p_expected_updated_at THEN
   RAISE EXCEPTION 'ROSTER_REVISION_CONFLICT' USING ERRCODE='23505';
 END IF;
 IF v_session.student_id IS NOT NULL
   AND NOT v_session.student_id=ANY(v_after) THEN
   RAISE EXCEPTION 'PRIVATE_LESSON_STUDENT_REQUIRED' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(v_after) AS x
   WHERE NOT EXISTS(
     SELECT 1 FROM public.students s
     WHERE s.id=x AND s.teacher_id=v_teacher
   )) THEN
   RAISE EXCEPTION 'ROSTER_STUDENT_NOT_FOUND' USING ERRCODE='42501';
 END IF;

 v_before:=ARRAY(SELECT student_id FROM public.session_participants
   WHERE session_id=p_session_id AND teacher_id=v_teacher ORDER BY student_id);
 v_removed:=ARRAY(SELECT x FROM unnest(v_before) AS x
   WHERE NOT x=ANY(v_after));
 v_added:=ARRAY(SELECT x FROM unnest(v_after) AS x
   WHERE NOT x=ANY(v_before));
 IF cardinality(v_removed)=0 AND cardinality(v_added)=0 THEN
   RAISE EXCEPTION 'ROSTER_UNCHANGED' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM public.chess_observations o
   WHERE o.teacher_id=v_teacher AND o.session_id=p_session_id
     AND o.student_id=ANY(v_removed))
   OR EXISTS(SELECT 1 FROM public.chess_learning_resources r
   WHERE r.teacher_id=v_teacher AND r.session_id=p_session_id
     AND r.student_id=ANY(v_removed)) THEN
   RAISE EXCEPTION 'ROSTER_HAS_LINKED_CHESS_EVIDENCE' USING ERRCODE='23514';
 END IF;

 -- The only deleted session-attendance rows are captured in the audit with
 -- their original status, notes and timestamps; historical lesson records
 -- and the parent session itself remain unchanged.
 SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.student_id),'[]'::jsonb)
 INTO v_removed_attendance
 FROM public.session_attendance a
 WHERE a.teacher_id=v_teacher AND a.session_id=p_session_id
   AND a.student_id=ANY(v_removed);

 DELETE FROM public.session_attendance
 WHERE teacher_id=v_teacher AND session_id=p_session_id
   AND student_id=ANY(v_removed);
 DELETE FROM public.session_participants
 WHERE teacher_id=v_teacher AND session_id=p_session_id
   AND student_id=ANY(v_removed);

 INSERT INTO public.session_participants(teacher_id,session_id,student_id)
 SELECT v_teacher,p_session_id,x FROM unnest(v_added) AS x;
 INSERT INTO public.session_attendance(teacher_id,session_id,student_id,status)
 SELECT v_teacher,p_session_id,x,'unmarked' FROM unnest(v_added) AS x;

 UPDATE public.teaching_sessions SET updated_at=clock_timestamp()
 WHERE id=p_session_id AND teacher_id=v_teacher
 RETURNING updated_at INTO v_updated;
 INSERT INTO public.session_roster_corrections(
   teacher_id,session_id,request_id,previous_students,corrected_students,
   removed_attendance,reason
 ) VALUES(
   v_teacher,p_session_id,p_request_id,to_jsonb(v_before),to_jsonb(v_after),
   v_removed_attendance,btrim(p_reason)
 ) RETURNING id INTO v_audit_id;
 v_receipt:=jsonb_build_object(
   'ok',true,'sessionId',p_session_id,'updatedAt',v_updated,
   'auditId',v_audit_id,'addedStudentIds',to_jsonb(v_added),
   'removedStudentIds',to_jsonb(v_removed)
 );
 UPDATE public.agent_tool_receipts SET receipt=v_receipt
 WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
 RETURN v_receipt;
END;
$$;

REVOKE ALL ON FUNCTION public.ccp_session_roster_correct(
 uuid,uuid[],timestamptz,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_session_roster_correct(
 uuid,uuid[],timestamptz,uuid,text) TO authenticated;
