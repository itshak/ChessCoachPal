-- New pre-1.0 fresh-stack migration. Agent writes are atomic, tenant-scoped and replay-safe.
-- No old-schema or CogNote compatibility contract is provided.
ALTER TABLE public.workplaces ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.class_groups ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.ccp_touch_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER ccp_workplaces_revision BEFORE UPDATE ON public.workplaces
FOR EACH ROW EXECUTE FUNCTION public.ccp_touch_revision();
CREATE TRIGGER ccp_students_revision BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.ccp_touch_revision();
CREATE TRIGGER ccp_groups_revision BEFORE UPDATE ON public.class_groups
FOR EACH ROW EXECUTE FUNCTION public.ccp_touch_revision();

-- Allow application writers to see revisions so web and MCP edits share one lock version.
-- The RPC acts under the end-user's JWT, not a service-role elevated identity.
CREATE OR REPLACE FUNCTION public.agent_coaching_mutate(
  p_operation text,
  p_payload jsonb,
  p_expected_updated_at timestamptz,
  p_idempotency_key uuid,
  p_client_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_hash text;
  v_saved public.agent_tool_receipts%ROWTYPE;
  v_receipt jsonb;
  v_id uuid;
  v_workplace uuid;
  v_student uuid;
  v_group uuid;
  v_start timestamptz;
  v_duration integer;
  v_revision timestamptz;
  v_existing_status text;
BEGIN
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_idempotency_key IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR p_client_id IS NULL OR length(p_client_id) > 200 OR length(p_client_id) < 1 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR';
  END IF;
  IF p_operation NOT IN (
    'workplaces.create','workplaces.update','workplaces.enroll',
    'students.create','students.update','groups.create','groups.update',
    'groups.enroll','groups.unenroll','sessions.create','sessions.reschedule','sessions.cancel'
  ) THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  IF p_operation IN ('workplaces.update','students.update','groups.update',
                     'sessions.reschedule','sessions.cancel')
     AND p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  IF p_operation NOT IN ('workplaces.update','students.update','groups.update',
                         'sessions.reschedule','sessions.cancel')
     AND p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;

  -- The unique (teacher_id, idempotency_key) row lock serializes racing retries.
  -- The entire transaction rolls back on validation/conflict/permission failures.
  v_hash := md5(jsonb_build_array(p_operation,p_payload,p_expected_updated_at,p_client_id)::text);
  INSERT INTO public.agent_tool_receipts(teacher_id,idempotency_key,operation,request_hash,receipt)
  VALUES(v_teacher,p_idempotency_key,p_operation,v_hash,'{}'::jsonb)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_saved FROM public.agent_tool_receipts
    WHERE teacher_id = v_teacher AND idempotency_key = p_idempotency_key;
    IF NOT FOUND OR v_saved.operation <> p_operation OR v_saved.request_hash <> v_hash
    THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    RETURN v_saved.receipt;
  END IF;

  IF p_operation = 'workplaces.create' THEN
    INSERT INTO public.workplaces(teacher_id,name,timezone,currency,locale,policy)
    VALUES(v_teacher,p_payload->>'name',p_payload->>'timezone',p_payload->>'currency',
           p_payload->>'locale',p_payload->'policy')
    RETURNING id,updated_at INTO v_id,v_revision;

  ELSIF p_operation = 'workplaces.update' THEN
    UPDATE public.workplaces SET
      name = COALESCE(p_payload->>'name',name),
      timezone = COALESCE(p_payload->>'timezone',timezone),
      currency = COALESCE(p_payload->>'currency',currency),
      locale = COALESCE(p_payload->>'locale',locale),
      policy = COALESCE(p_payload->'policy',policy)
    WHERE id = (p_payload->>'workplaceId')::uuid AND teacher_id = v_teacher
      AND updated_at = p_expected_updated_at
    RETURNING id,updated_at INTO v_id,v_revision;
    IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT_OR_NOT_FOUND'; END IF;

  ELSIF p_operation = 'students.create' THEN
    INSERT INTO public.students(teacher_id,name,level)
    VALUES(v_teacher,p_payload->>'name',p_payload->>'level')
    RETURNING id,updated_at INTO v_id,v_revision;

  ELSIF p_operation = 'students.update' THEN
    UPDATE public.students SET
      name = COALESCE(p_payload->>'name',name),
      level = CASE WHEN p_payload ? 'level' THEN p_payload->>'level' ELSE level END
    WHERE id = (p_payload->>'studentId')::uuid AND teacher_id = v_teacher
      AND archived_at IS NULL AND updated_at = p_expected_updated_at
    RETURNING id,updated_at INTO v_id,v_revision;
    IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT_OR_NOT_FOUND'; END IF;

  ELSIF p_operation = 'workplaces.enroll' THEN
    v_workplace := (p_payload->>'workplaceId')::uuid;
    v_student := (p_payload->>'studentId')::uuid;
    PERFORM 1 FROM public.workplaces WHERE id=v_workplace AND teacher_id=v_teacher;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    PERFORM 1 FROM public.students WHERE id=v_student AND teacher_id=v_teacher AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    INSERT INTO public.workplace_enrollments(teacher_id,workplace_id,student_id)
    VALUES(v_teacher,v_workplace,v_student) ON CONFLICT DO NOTHING;
    v_id := v_student;

  ELSIF p_operation = 'groups.create' THEN
    v_workplace := (p_payload->>'workplaceId')::uuid;
    PERFORM 1 FROM public.workplaces WHERE id=v_workplace AND teacher_id=v_teacher;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    INSERT INTO public.class_groups(teacher_id,workplace_id,name)
    VALUES(v_teacher,v_workplace,p_payload->>'name')
    RETURNING id,updated_at INTO v_id,v_revision;

  ELSIF p_operation = 'groups.update' THEN
    UPDATE public.class_groups SET name = p_payload->>'name'
    WHERE id=(p_payload->>'groupId')::uuid AND teacher_id=v_teacher
      AND workplace_id=(p_payload->>'workplaceId')::uuid
      AND updated_at=p_expected_updated_at
    RETURNING id,updated_at INTO v_id,v_revision;
    IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT_OR_NOT_FOUND'; END IF;

  ELSIF p_operation IN ('groups.enroll','groups.unenroll') THEN
    v_group := (p_payload->>'groupId')::uuid;
    v_student := (p_payload->>'studentId')::uuid;
    SELECT workplace_id INTO v_workplace FROM public.class_groups
    WHERE id=v_group AND teacher_id=v_teacher;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    PERFORM 1 FROM public.students WHERE id=v_student AND teacher_id=v_teacher AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF p_operation = 'groups.enroll' THEN
      INSERT INTO public.workplace_enrollments(teacher_id,workplace_id,student_id)
      VALUES(v_teacher,v_workplace,v_student) ON CONFLICT DO NOTHING;
      INSERT INTO public.group_enrollments(teacher_id,group_id,workplace_id,student_id)
      VALUES(v_teacher,v_group,v_workplace,v_student) ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM public.group_enrollments
      WHERE teacher_id=v_teacher AND group_id=v_group AND student_id=v_student;
      IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    END IF;
    v_id := v_group;

  ELSIF p_operation = 'sessions.create' THEN
    v_workplace := (p_payload->>'workplaceId')::uuid;
    v_group := NULLIF(p_payload->>'groupId','')::uuid;
    v_student := NULLIF(p_payload->>'studentId','')::uuid;
    IF (v_group IS NULL) = (v_student IS NULL) THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
    SELECT id INTO v_id FROM public.workplaces WHERE id=v_workplace AND teacher_id=v_teacher;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v_group IS NOT NULL THEN
      PERFORM 1 FROM public.class_groups WHERE id=v_group AND workplace_id=v_workplace
        AND teacher_id=v_teacher;
    ELSE
      PERFORM 1 FROM public.workplace_enrollments WHERE workplace_id=v_workplace
        AND student_id=v_student AND teacher_id=v_teacher;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    v_start := (p_payload->>'startsAt')::timestamptz;
    v_duration := (p_payload->>'durationMinutes')::integer;
    IF v_start IS NULL OR v_duration NOT BETWEEN 15 AND 480 THEN
      RAISE EXCEPTION 'VALIDATION_ERROR';
    END IF;
    -- Serializes MCP-created sessions for the same teacher, preventing MCP/MCP overlap races.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_teacher::text,0));
    IF EXISTS (
      SELECT 1 FROM public.teaching_sessions s
      WHERE s.teacher_id=v_teacher AND s.status <> 'cancelled'
        AND tstzrange(s.starts_at, s.starts_at+s.duration_minutes*interval '1 minute','[)')
          && tstzrange(v_start,v_start+v_duration*interval '1 minute','[)')
    ) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    INSERT INTO public.teaching_sessions(
      teacher_id,workplace_id,group_id,student_id,title,starts_at,
      duration_minutes,lesson_note,request_id)
    VALUES(v_teacher,v_workplace,v_group,v_student,p_payload->>'title',v_start,
           v_duration,COALESCE(p_payload->>'lessonNote',''),p_idempotency_key)
    RETURNING id,updated_at INTO v_id,v_revision;

  ELSIF p_operation IN ('sessions.reschedule','sessions.cancel') THEN
    v_id := (p_payload->>'sessionId')::uuid;
    -- Block concurrent MCP writes while evaluating the new time interval.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_teacher::text,0));
    SELECT status,starts_at,duration_minutes INTO v_existing_status,v_start,v_duration
    FROM public.teaching_sessions
    WHERE id=v_id AND teacher_id=v_teacher AND updated_at=p_expected_updated_at
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT_OR_NOT_FOUND'; END IF;
    IF v_existing_status <> 'scheduled' THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    IF p_operation = 'sessions.reschedule' THEN
      v_start := (p_payload->>'startsAt')::timestamptz;
      v_duration := (p_payload->>'durationMinutes')::integer;
      IF v_start IS NULL OR v_duration NOT BETWEEN 15 AND 480 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.teaching_sessions s
        WHERE s.teacher_id=v_teacher AND s.id <> v_id AND s.status <> 'cancelled'
          AND tstzrange(s.starts_at,s.starts_at+s.duration_minutes*interval '1 minute','[)')
            && tstzrange(v_start,v_start+v_duration*interval '1 minute','[)')
      ) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
      UPDATE public.teaching_sessions SET starts_at=v_start,duration_minutes=v_duration,
        updated_at=clock_timestamp() WHERE id=v_id AND teacher_id=v_teacher
      RETURNING updated_at INTO v_revision;
    ELSE
      UPDATE public.teaching_sessions SET status='cancelled',updated_at=clock_timestamp()
      WHERE id=v_id AND teacher_id=v_teacher RETURNING updated_at INTO v_revision;
    END IF;
  END IF;

  -- Never persist notes, student names, OAuth credentials or arbitrary payloads in receipts.
  v_receipt := jsonb_build_object('operation',p_operation,'entityId',v_id,
    'revision',v_revision,'timestamp',clock_timestamp(),
    'actorId',v_teacher,'clientId',p_client_id,'idempotencyKey',p_idempotency_key);
  UPDATE public.agent_tool_receipts SET receipt=v_receipt
  WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
  RETURN v_receipt;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_coaching_mutate(text,jsonb,timestamptz,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_coaching_mutate(text,jsonb,timestamptz,uuid,text) TO authenticated;
