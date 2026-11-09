-- Historical direct lessons must outlive current workplace enrollment.
-- Existing FK tied lessons to the *live* membership row, making a safe
-- unenroll impossible even for completed/past lessons. Keep student and
-- workplace ownership FKs; enforce CURRENT enrollment on new direct
-- sessions using a row-locking trigger instead.
ALTER TABLE public.teaching_sessions
  DROP CONSTRAINT IF EXISTS teaching_sessions_teacher_id_workplace_id_student_id_fkey;

CREATE OR REPLACE FUNCTION public.ccp_direct_session_enrollment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_enrollment uuid;
BEGIN
  IF NEW.student_id IS NULL THEN RETURN NEW; END IF;
  -- This lock serializes direct lesson creation with current-membership
  -- deletion, so a future lesson cannot silently appear after unenrollment.
  SELECT e.id INTO v_enrollment
    FROM public.workplace_enrollments e
    JOIN public.students s ON s.id=e.student_id AND s.teacher_id=e.teacher_id
    WHERE e.teacher_id=NEW.teacher_id
      AND e.workplace_id=NEW.workplace_id
      AND e.student_id=NEW.student_id
      AND s.archived_at IS NULL
    FOR KEY SHARE OF e;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STUDENT_NOT_ENROLLED'
      USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_direct_session_enrollment_guard()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS ccp_direct_session_enrollment_guard ON public.teaching_sessions;
CREATE TRIGGER ccp_direct_session_enrollment_guard
BEFORE INSERT OR UPDATE OF student_id,workplace_id
ON public.teaching_sessions
FOR EACH ROW EXECUTE FUNCTION public.ccp_direct_session_enrollment_guard();
