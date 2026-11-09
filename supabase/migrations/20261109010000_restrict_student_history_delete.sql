-- Direct owner-scoped student removals must never cascade linked teaching records.
-- The API's deletion impact preview is advisory; the final safety check belongs
-- in the DELETE transaction, after PostgreSQL acquires the student row lock.
-- auth.uid() is empty for privileged migration/maintenance cleanup and those
-- administrator operations retain their existing explicit retention procedures.
CREATE OR REPLACE FUNCTION public.ccp_restrict_student_history_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN OLD;
  END IF;
  IF auth.uid() <> OLD.teacher_id THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lessons WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.lesson_slots WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.teaching_sessions WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.session_participants WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.group_enrollments WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.workplace_enrollments WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.skill_assessments WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.chess_learning_resources WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.chess_observations WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.chess_material_progress WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.event_students WHERE student_id = OLD.id
    UNION ALL SELECT 1 FROM public.credit_packages WHERE student_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'HISTORY_DEPENDENCIES'
      USING ERRCODE = '23503',
            DETAIL = 'Archive the student instead of erasing linked records.';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.ccp_restrict_student_history_delete() FROM PUBLIC;
DROP TRIGGER IF EXISTS ccp_restrict_student_history_delete ON public.students;
CREATE TRIGGER ccp_restrict_student_history_delete
BEFORE DELETE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.ccp_restrict_student_history_delete();
