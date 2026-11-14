-- Canonical, single-transaction multi-student chapter/material evidence.
-- Links are not mastery; 'taught' is a teacher attestation after completion.
CREATE OR REPLACE FUNCTION public.ccp_session_chapter_evidence_commit(
 p_session_id uuid,p_study_id text,p_chapter_id text,p_stage text,
 p_note text,p_expected_verified_at timestamptz,
 p_expected_roster_hash text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=public,pg_temp AS $chapter_evidence$
DECLARE
 v_teacher uuid:=auth.uid();
 v_session public.teaching_sessions%ROWTYPE;
 v_chapter public.teacher_study_chapter_index%ROWTYPE;
 v_prior public.agent_tool_receipts%ROWTYPE;
 v_receipt jsonb;v_hash text;v_roster_hash text;
 v_material_id uuid;v_link_id uuid;v_count integer:=0;
 v_student uuid;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';END IF;
 IF p_session_id IS NULL OR p_request_id IS NULL OR
    p_study_id !~ '^[A-Za-z0-9]{8}$' OR
    p_chapter_id !~ '^[A-Za-z0-9]{8}$' OR
    p_stage NOT IN ('assigned','taught') OR
    char_length(coalesce(p_note,''))>2000 OR
    p_expected_verified_at IS NULL OR
    coalesce(p_expected_roster_hash,'') !~ '^[a-f0-9]{32}$'
 THEN RAISE EXCEPTION 'CHAPTER_EVIDENCE_INVALID' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_teacher::text,0));
 v_hash:=md5(jsonb_build_array(p_session_id,p_study_id,p_chapter_id,
  p_stage,coalesce(p_note,''),p_expected_verified_at,p_expected_roster_hash)::text);
 INSERT INTO public.agent_tool_receipts(
   teacher_id,idempotency_key,operation,request_hash,receipt
 ) VALUES(v_teacher,p_request_id,'chapter.evidence.commit',v_hash,'{}'::jsonb)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO v_prior FROM public.agent_tool_receipts
    WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
   IF NOT FOUND OR v_prior.operation<>'chapter.evidence.commit' OR
     v_prior.request_hash<>v_hash OR v_prior.receipt='{}'::jsonb
   THEN RAISE EXCEPTION 'CHAPTER_EVIDENCE_REPLAY_CONFLICT' USING ERRCODE='23505';END IF;
   RETURN v_prior.receipt||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO v_session FROM public.teaching_sessions
   WHERE teacher_id=v_teacher AND id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CHAPTER_EVIDENCE_SESSION_NOT_FOUND' USING ERRCODE='42501';END IF;
 IF v_session.status='cancelled' OR
    (p_stage='taught' AND v_session.status<>'completed') THEN
   RAISE EXCEPTION 'CHAPTER_EVIDENCE_SESSION_STATUS' USING ERRCODE='23514';END IF;
 SELECT * INTO v_chapter FROM public.teacher_study_chapter_index
   WHERE teacher_id=v_teacher AND study_id=p_study_id AND chapter_id=p_chapter_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'CHAPTER_EVIDENCE_NOT_INDEXED' USING ERRCODE='42501';END IF;
 IF v_chapter.verified_at IS DISTINCT FROM p_expected_verified_at OR
   v_chapter.verified_at<clock_timestamp()-interval '24 hours' THEN
   RAISE EXCEPTION 'CHAPTER_EVIDENCE_STALE' USING ERRCODE='23505';END IF;
 SELECT md5(coalesce(string_agg(student_id::text,',' ORDER BY student_id),''))
   INTO v_roster_hash FROM public.session_participants
   WHERE teacher_id=v_teacher AND session_id=p_session_id;
 SELECT count(*) INTO v_count FROM public.session_participants
   WHERE teacher_id=v_teacher AND session_id=p_session_id;
 IF v_count NOT BETWEEN 1 AND 100 OR
   v_roster_hash IS DISTINCT FROM p_expected_roster_hash THEN
   RAISE EXCEPTION 'CHAPTER_EVIDENCE_ROSTER_CHANGED' USING ERRCODE='23505';END IF;
 SELECT m.id INTO v_material_id
 FROM public.chess_study_chapters ch
 JOIN public.learning_materials m
  ON m.teacher_id=ch.teacher_id AND m.id=ch.material_id
 WHERE ch.teacher_id=v_teacher AND ch.provider='lichess' AND
   ch.study_id=p_study_id AND ch.chapter_id=p_chapter_id AND m.archived_at IS NULL
 ORDER BY m.created_at,m.id LIMIT 1;
 IF v_material_id IS NULL THEN
   INSERT INTO public.learning_materials(
     teacher_id,kind,title,description,source_url,request_id,request_hash
   ) VALUES(v_teacher,'study_chapter',
     left(v_chapter.chapter_name,160),
     'Teacher-selected, cached authorized Lichess study chapter',
     'https://lichess.org/study/'||p_study_id||'/'||p_chapter_id,
     gen_random_uuid(),md5(p_study_id||':'||p_chapter_id))
   RETURNING id INTO v_material_id;
   INSERT INTO public.chess_study_chapters(
     material_id,teacher_id,provider,study_id,chapter_id
   ) VALUES(v_material_id,v_teacher,'lichess',p_study_id,p_chapter_id);
 END IF;
 SELECT id INTO v_link_id FROM public.material_links
  WHERE teacher_id=v_teacher AND session_id=p_session_id
    AND student_id IS NULL AND material_id=v_material_id
  ORDER BY created_at,id LIMIT 1;
 IF v_link_id IS NULL THEN
   INSERT INTO public.material_links(
     teacher_id,material_id,session_id,request_id
   ) VALUES(v_teacher,v_material_id,p_session_id,gen_random_uuid())
   RETURNING id INTO v_link_id;
 END IF;
 FOR v_student IN SELECT student_id FROM public.session_participants
   WHERE teacher_id=v_teacher AND session_id=p_session_id ORDER BY student_id LOOP
   INSERT INTO public.material_teaching_evidence(
     teacher_id,student_id,workplace_id,session_id,material_id,stage,
     occurred_on,note,request_id
   ) VALUES(v_teacher,v_student,v_session.workplace_id,p_session_id,
     v_material_id,p_stage,
     (v_session.starts_at AT TIME ZONE coalesce(v_session.local_timezone,'UTC'))::date,
     coalesce(p_note,''),gen_random_uuid());
 END LOOP;
 v_receipt:=jsonb_build_object('sessionId',p_session_id,
    'materialId',v_material_id,'linkId',v_link_id,'studyId',p_study_id,
    'chapterId',p_chapter_id,'stage',p_stage,'participantCoverages',v_count,
    'uniqueWorkplaceLessonCount',1,'inferredMastery',false,
    'source','AUTHORIZED_LICHESS_PGN_CACHE');
 UPDATE public.agent_tool_receipts SET receipt=v_receipt
   WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
 RETURN v_receipt||jsonb_build_object('replayed',false);
END;
$chapter_evidence$;
REVOKE ALL ON FUNCTION public.ccp_session_chapter_evidence_commit(
 uuid,text,text,text,text,timestamptz,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_session_chapter_evidence_commit(
 uuid,text,text,text,text,timestamptz,text,uuid) TO authenticated;
