-- Atomic, tenant-scoped one-off teaching sessions for 2–50 students.
-- No permanent group membership or mutating the frozen roster is necessary.
ALTER TABLE public.teaching_sessions
  ADD COLUMN roster_mode text NOT NULL DEFAULT 'standard',
  ADD CONSTRAINT ccp_session_roster_mode CHECK (roster_mode IN ('standard','ad_hoc'));
ALTER TABLE public.teaching_sessions DROP CONSTRAINT teaching_sessions_check;
ALTER TABLE public.teaching_sessions ADD CONSTRAINT ccp_session_roster_shape CHECK (
  (roster_mode='standard' AND ((group_id IS NULL) <> (student_id IS NULL)))
  OR (roster_mode='ad_hoc' AND group_id IS NULL AND student_id IS NULL)
);

-- Restrict direct API clients from switching roster mode. Existing standard
-- website calls retain INSERT rights on all preexisting public columns.
REVOKE INSERT, UPDATE ON public.teaching_sessions FROM authenticated;
GRANT INSERT (
  id,teacher_id,workplace_id,group_id,student_id,title,starts_at,
  duration_minutes,status,updated_at,lesson_note,request_id,created_at
) ON public.teaching_sessions TO authenticated;
GRANT UPDATE (
  title,starts_at,duration_minutes,status,updated_at,lesson_note
) ON public.teaching_sessions TO authenticated;

-- The same teacher lock protects direct website inserts/edits and MCP RPC.
CREATE OR REPLACE FUNCTION public.ccp_session_schedule_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='scheduled' THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(NEW.teacher_id::text,0));
   IF EXISTS(
      SELECT 1 FROM public.teaching_sessions s
      WHERE s.teacher_id=NEW.teacher_id AND s.id<>NEW.id
        AND s.status='scheduled'
        AND tstzrange(s.starts_at,s.starts_at+s.duration_minutes*interval '1 minute','[)')
          && tstzrange(NEW.starts_at,NEW.starts_at+NEW.duration_minutes*interval '1 minute','[)')
   ) THEN
     RAISE EXCEPTION 'SESSION_CONFLICT' USING ERRCODE='23P01';
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_session_schedule_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS ccp_session_schedule_guard ON public.teaching_sessions;
CREATE TRIGGER ccp_session_schedule_guard
 BEFORE INSERT OR UPDATE OF starts_at,duration_minutes,status,roster_mode
 ON public.teaching_sessions FOR EACH ROW EXECUTE FUNCTION public.ccp_session_schedule_guard();

CREATE OR REPLACE FUNCTION public.ccp_teacher_ad_hoc_session_create(
  p_workplace_id uuid,p_student_ids uuid[],p_title text,p_starts_at timestamptz,
  p_duration_minutes integer,p_lesson_note text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_teacher uuid:=auth.uid();v_session public.teaching_sessions%ROWTYPE;
 v_count integer;v_participants uuid[];
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';END IF;
 IF p_workplace_id IS NULL OR p_request_id IS NULL
    OR length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 160
    OR length(coalesce(p_lesson_note,''))>10000
    OR p_starts_at IS NULL OR p_duration_minutes NOT BETWEEN 15 AND 480
    OR coalesce(array_length(p_student_ids,1),0) NOT BETWEEN 2 AND 50
    OR array_position(p_student_ids,NULL) IS NOT NULL THEN
   RAISE EXCEPTION 'INVALID_AD_HOC_SESSION' USING ERRCODE='22023';
 END IF;
 SELECT array_agg(x ORDER BY x),count(DISTINCT x)
 INTO v_participants,v_count FROM unnest(p_student_ids) x;
 IF v_count<>array_length(p_student_ids,1) THEN
   RAISE EXCEPTION 'DUPLICATE_PARTICIPANTS' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_teacher::text,0));
 PERFORM 1 FROM public.workplaces WHERE id=p_workplace_id AND teacher_id=v_teacher;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';END IF;
 SELECT count(*) INTO v_count
 FROM public.students s JOIN public.workplace_enrollments e
   ON e.teacher_id=s.teacher_id AND e.student_id=s.id
   AND e.workplace_id=p_workplace_id
 WHERE s.teacher_id=v_teacher AND s.archived_at IS NULL
   AND s.id=ANY(p_student_ids);
 IF v_count<>array_length(p_student_ids,1) THEN
   RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_session FROM public.teaching_sessions
 WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_session.roster_mode<>'ad_hoc' OR v_session.workplace_id<>p_workplace_id
     OR v_session.title<>btrim(p_title)
     OR v_session.starts_at<>p_starts_at
     OR v_session.duration_minutes<>p_duration_minutes
     OR v_session.lesson_note<>coalesce(p_lesson_note,'')
     OR (SELECT array_agg(student_id ORDER BY student_id)
       FROM public.session_participants
       WHERE session_id=v_session.id AND teacher_id=v_teacher)
        IS DISTINCT FROM v_participants
   THEN RAISE EXCEPTION 'SESSION_REPLAY_CONFLICT' USING ERRCODE='23505';END IF;
 ELSE
   INSERT INTO public.teaching_sessions(
     teacher_id,workplace_id,roster_mode,title,starts_at,
     duration_minutes,lesson_note,request_id
   ) VALUES(
     v_teacher,p_workplace_id,'ad_hoc',btrim(p_title),p_starts_at,
     p_duration_minutes,coalesce(p_lesson_note,''),p_request_id
   ) RETURNING * INTO v_session;
   -- The standard AFTER INSERT snapshot trigger inserts no members for an
   -- ad-hoc session; the exact roster and register are populated here.
   INSERT INTO public.session_participants(teacher_id,session_id,student_id)
     SELECT v_teacher,v_session.id,x FROM unnest(p_student_ids) x;
   INSERT INTO public.session_attendance(
     teacher_id,session_id,student_id,status
   ) SELECT v_teacher,v_session.id,x,'unmarked' FROM unnest(p_student_ids) x;
 END IF;
 RETURN jsonb_build_object(
  'id',v_session.id,'title',v_session.title,'starts_at',v_session.starts_at,
  'duration_minutes',v_session.duration_minutes,'lesson_note',v_session.lesson_note,
  'status',v_session.status,'workplace_id',v_session.workplace_id,
  'group_id',v_session.group_id,'student_id',v_session.student_id,
  'roster_mode',v_session.roster_mode
 );
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_teacher_ad_hoc_session_create(
 uuid,uuid[],text,timestamptz,integer,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_ad_hoc_session_create(
 uuid,uuid[],text,timestamptz,integer,text,uuid) TO authenticated;
