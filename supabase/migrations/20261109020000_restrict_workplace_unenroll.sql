-- The workplace/student enrollment is the parent FK for live group membership.
-- PostgreSQL currently cascades group enrollment deletion when this membership is
-- deleted. That must never happen silently from a teacher-facing unenroll.
CREATE OR REPLACE FUNCTION public.ccp_restrict_workplace_unenroll()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  -- Privileged maintenance/account teardown runs through a distinct pathway.
  IF auth.uid() IS NULL THEN
    RETURN OLD;
  END IF;
  IF auth.uid() <> OLD.teacher_id THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.group_enrollments
    WHERE teacher_id=OLD.teacher_id AND workplace_id=OLD.workplace_id
      AND student_id=OLD.student_id
  ) THEN
    RAISE EXCEPTION 'ACTIVE_GROUP_MEMBERSHIP' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.teaching_sessions
    WHERE teacher_id=OLD.teacher_id AND workplace_id=OLD.workplace_id
      AND student_id=OLD.student_id AND status='scheduled'
      AND starts_at >= now()
  ) THEN
    RAISE EXCEPTION 'FUTURE_COMMITMENTS' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_restrict_workplace_unenroll() FROM PUBLIC;
DROP TRIGGER IF EXISTS ccp_restrict_workplace_unenroll ON public.workplace_enrollments;
CREATE TRIGGER ccp_restrict_workplace_unenroll
BEFORE DELETE ON public.workplace_enrollments
FOR EACH ROW EXECUTE FUNCTION public.ccp_restrict_workplace_unenroll();
