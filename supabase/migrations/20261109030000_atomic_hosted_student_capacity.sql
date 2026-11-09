-- Enforce active student quotas at the only race-safe boundary: the database.
-- A locked teacher row serializes all insert/archive/unarchive/delete transactions.
-- Tenant entitlements and counters are changed by trusted server provisioning.
ALTER TABLE public.teachers
 ADD COLUMN hosted_enforced boolean NOT NULL DEFAULT false,
 ADD COLUMN hosted_max_active_students integer NOT NULL DEFAULT 5,
 ADD COLUMN active_student_count integer NOT NULL DEFAULT 0,
 ADD CONSTRAINT ccp_hosted_capacity_range CHECK(hosted_max_active_students BETWEEN 1 AND 1000000),
 ADD CONSTRAINT ccp_active_students_nonnegative CHECK(active_student_count>=0);
UPDATE public.teachers t SET active_student_count=(
 SELECT count(*) FROM public.students s WHERE s.teacher_id=t.id AND s.archived_at IS NULL
);
UPDATE public.teachers SET hosted_enforced=true
 WHERE hosted_plan IN ('trial','pro','founding','gifted');
-- The existing migration grants only safe teacher-profile columns to authenticated.
-- Restate that security invariant so raw PostgREST requests cannot falsify caps.
REVOKE UPDATE ON TABLE public.teachers FROM PUBLIC,anon,authenticated;
GRANT UPDATE(email,display_name,avatar_url,onboarding_tour_completed_at,calendar_token)
 ON TABLE public.teachers TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_student_capacity_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
 v_teacher uuid; v_delta integer:=0; v_count integer; v_max integer;
 v_hosted boolean; v_plan text; v_trial timestamptz; v_gift timestamptz;
BEGIN
 IF TG_OP='INSERT' THEN
   v_teacher:=NEW.teacher_id;
   IF NEW.archived_at IS NULL THEN v_delta:=1; END IF;
 ELSIF TG_OP='DELETE' THEN
   v_teacher:=OLD.teacher_id;
   IF OLD.archived_at IS NULL THEN v_delta:=-1; END IF;
 ELSE
   IF NEW.teacher_id IS DISTINCT FROM OLD.teacher_id THEN
     RAISE EXCEPTION 'STUDENT_OWNER_IMMUTABLE' USING ERRCODE='23514';
   END IF;
   v_teacher:=NEW.teacher_id;
   IF OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
     v_delta:=1;
   ELSIF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
     v_delta:=-1;
     IF EXISTS(SELECT 1 FROM public.lesson_slots
               WHERE teacher_id=v_teacher AND student_id=NEW.id AND active)
       OR EXISTS(SELECT 1 FROM public.lessons
               WHERE teacher_id=v_teacher AND student_id=NEW.id
                 AND starts_at>=clock_timestamp())
       OR EXISTS(SELECT 1 FROM public.teaching_sessions
               WHERE teacher_id=v_teacher AND student_id=NEW.id
                 AND status='scheduled' AND starts_at>=clock_timestamp())
       OR EXISTS(SELECT 1 FROM public.session_participants sp
                 JOIN public.teaching_sessions sess ON sess.id=sp.session_id
               WHERE sp.teacher_id=v_teacher AND sp.student_id=NEW.id
                 AND sess.status='scheduled' AND sess.starts_at>=clock_timestamp())
       OR EXISTS(SELECT 1 FROM public.group_enrollments
               WHERE teacher_id=v_teacher AND student_id=NEW.id) THEN
       RAISE EXCEPTION 'FUTURE_COMMITMENTS' USING ERRCODE='23503';
     END IF;
   END IF;
 END IF;
 IF v_delta<>0 THEN
   SELECT active_student_count,hosted_max_active_students,hosted_enforced,
          hosted_plan,trial_ends_at,gifted_until
   INTO v_count,v_max,v_hosted,v_plan,v_trial,v_gift
   FROM public.teachers WHERE id=v_teacher FOR UPDATE;
   IF FOUND THEN
     IF v_delta>0 AND v_hosted AND
       (v_plan='free'
        OR (v_plan='trial' AND (v_trial IS NULL OR v_trial<=clock_timestamp()))
        OR (v_plan='gifted' AND (v_gift IS NULL OR v_gift<=clock_timestamp())))
        AND v_count+v_delta>v_max THEN
       RAISE EXCEPTION 'HOSTED_LIMIT_REACHED' USING ERRCODE='23514';
     END IF;
     UPDATE public.teachers SET active_student_count=active_student_count+v_delta
       WHERE id=v_teacher;
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_student_capacity_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS ccp_student_capacity_guard ON public.students;
CREATE TRIGGER ccp_student_capacity_guard
 BEFORE INSERT OR UPDATE OR DELETE ON public.students
 FOR EACH ROW EXECUTE FUNCTION public.ccp_student_capacity_guard();

-- No teacher client may edit hosted_plan; the one permitted demotion is a
-- server-verified, owner-only function with expired entitlement preconditions.
CREATE OR REPLACE FUNCTION public.ccp_demote_expired_hosted_plan()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE v_teacher uuid:=auth.uid();
BEGIN
 IF v_teacher IS NULL THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 UPDATE public.teachers SET hosted_plan='free'
 WHERE id=v_teacher AND hosted_enforced=true AND (
   (hosted_plan='trial' AND (trial_ends_at IS NULL OR trial_ends_at<=clock_timestamp()))
   OR (hosted_plan='gifted' AND (gifted_until IS NULL OR gifted_until<=clock_timestamp()))
 );
 RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_demote_expired_hosted_plan() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_demote_expired_hosted_plan() TO authenticated;
