-- Explicit chess material coverage; linked studies are NOT automatically "taught".
-- Pre-1.0 schema, fresh installations only. No material content is fetched from Lichess.
CREATE TABLE public.chess_material_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id),
  workplace_id uuid REFERENCES public.workplaces(id),
  session_id uuid REFERENCES public.teaching_sessions(id),
  resource_id uuid NOT NULL REFERENCES public.chess_learning_resources(id),
  stage text NOT NULL CHECK (stage IN ('assigned','taught','completed')),
  occurred_on date NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  void_reason text CHECK (void_reason IS NULL OR (char_length(btrim(void_reason)) BETWEEN 5 AND 500)),
  CONSTRAINT chess_material_progress_request UNIQUE (teacher_id,request_id),
  CONSTRAINT chess_material_progress_void_pair CHECK
    ((voided_at IS NULL) = (void_reason IS NULL))
);
CREATE INDEX chess_material_progress_student_idx
 ON public.chess_material_progress(teacher_id,student_id,occurred_on DESC,id);
CREATE INDEX chess_material_progress_workplace_idx
 ON public.chess_material_progress(teacher_id,workplace_id,occurred_on DESC,id);
CREATE INDEX chess_material_progress_session_idx
 ON public.chess_material_progress(teacher_id,session_id);

ALTER TABLE public.chess_material_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY chess_material_progress_owner ON public.chess_material_progress
 FOR ALL TO authenticated USING (teacher_id = auth.uid())
 WITH CHECK (teacher_id = auth.uid());
GRANT SELECT,INSERT,UPDATE ON public.chess_material_progress TO authenticated;
GRANT ALL ON public.chess_material_progress TO service_role;

-- Bound each student's material claim to teacher-owned resources/rosters/workplace.
-- The trigger also protects direct browser Supabase writes, not just MCP or API.
CREATE FUNCTION public.ccp_material_progress_validate() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_workplace uuid; v_source_student uuid; v_source_session uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.teacher_id,NEW.student_id,NEW.workplace_id,NEW.session_id,
        NEW.resource_id,NEW.stage,NEW.occurred_on,NEW.note,NEW.request_id,
        NEW.created_at)
      IS DISTINCT FROM
       (OLD.teacher_id,OLD.student_id,OLD.workplace_id,OLD.session_id,
        OLD.resource_id,OLD.stage,OLD.occurred_on,OLD.note,OLD.request_id,
        OLD.created_at) THEN
      RAISE EXCEPTION 'MATERIAL_HISTORY_IMMUTABLE';
    END IF;
    IF OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL OR
       NEW.void_reason IS NULL OR length(btrim(NEW.void_reason)) < 5 THEN
      RAISE EXCEPTION 'INVALID_MATERIAL_VOID';
    END IF;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
  END IF;
  PERFORM 1 FROM public.students
   WHERE id=NEW.student_id AND teacher_id=NEW.teacher_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND_STUDENT'; END IF;
  SELECT student_id,session_id INTO v_source_student,v_source_session
    FROM public.chess_learning_resources
    WHERE id=NEW.resource_id AND teacher_id=NEW.teacher_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND_RESOURCE'; END IF;
  IF v_source_student IS NOT NULL AND v_source_student<>NEW.student_id THEN
    RAISE EXCEPTION 'RESOURCE_STUDENT_MISMATCH';
  END IF;
  IF v_source_session IS NOT NULL AND v_source_session IS DISTINCT FROM NEW.session_id THEN
    RAISE EXCEPTION 'RESOURCE_SESSION_MISMATCH';
  END IF;
  IF NEW.workplace_id IS NOT NULL THEN
    PERFORM 1 FROM public.workplaces WHERE id=NEW.workplace_id AND teacher_id=NEW.teacher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND_WORKPLACE'; END IF;
  END IF;
  IF NEW.session_id IS NOT NULL THEN
    SELECT workplace_id INTO v_workplace FROM public.teaching_sessions
      WHERE id=NEW.session_id AND teacher_id=NEW.teacher_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND_SESSION'; END IF;
    IF NEW.workplace_id IS DISTINCT FROM v_workplace THEN
      RAISE EXCEPTION 'SESSION_WORKPLACE_MISMATCH';
    END IF;
    PERFORM 1 FROM public.session_participants
      WHERE teacher_id=NEW.teacher_id AND session_id=NEW.session_id
        AND student_id=NEW.student_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_SESSION_PARTICIPANT'; END IF;
  ELSIF NEW.workplace_id IS NOT NULL THEN
    PERFORM 1 FROM public.workplace_enrollments
      WHERE teacher_id=NEW.teacher_id AND workplace_id=NEW.workplace_id
        AND student_id=NEW.student_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_WORKPLACE_ENROLLED'; END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER ccp_material_progress_validate_trg
 BEFORE INSERT OR UPDATE ON public.chess_material_progress
 FOR EACH ROW EXECUTE FUNCTION public.ccp_material_progress_validate();
REVOKE ALL ON FUNCTION public.ccp_material_progress_validate() FROM PUBLIC,anon,authenticated;
