-- Event master record, frozen invitees and RSVP reconciliation are one
-- transaction for both signed-in website and delegated OAuth/MCP callers.
-- No emailed invitations are sent by this function.
CREATE OR REPLACE FUNCTION public.ccp_teacher_event_save(
  p_event_id uuid, p_fields jsonb, p_student_ids uuid[], p_repertoire jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_event public.events%ROWTYPE;
  v_title text;
  v_start timestamptz;
  v_end timestamptz;
  v_ids integer;
  v_roster uuid;
  v_repertoire text;
  v_index integer;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_repertoire) IS DISTINCT FROM 'object'
    OR pg_column_size(p_fields)>16384 OR pg_column_size(p_repertoire)>2097152
    OR EXISTS (SELECT 1 FROM jsonb_each(p_fields) AS f
       WHERE f.key NOT IN (
         'title','description','location','starts_at','ends_at','send_reminder'
       )) THEN
    RAISE EXCEPTION 'EVENT_INVALID_INPUT' USING ERRCODE='22023';
  END IF;
  IF p_student_ids IS NOT NULL AND (
     cardinality(p_student_ids)>200
     OR array_position(p_student_ids,NULL) IS NOT NULL
     OR cardinality(p_student_ids)<>(SELECT count(DISTINCT id)
         FROM unnest(p_student_ids) AS id)
  ) THEN
    RAISE EXCEPTION 'EVENT_INVALID_ROSTER' USING ERRCODE='22023';
  END IF;
  -- No elevated UPDATE rights on teachers are required here. Existing
  -- student-capacity triggers serialize inserts on the teacher row, while
  -- family/event rows and PostgreSQL foreign keys protect their own writes.
  PERFORM 1 FROM public.teachers WHERE id=v_teacher;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF p_student_ids IS NOT NULL THEN
    SELECT count(*) INTO v_ids FROM public.students
      WHERE id=ANY(p_student_ids) AND teacher_id=v_teacher
        AND archived_at IS NULL;
    IF v_ids<>cardinality(p_student_ids) THEN
      RAISE EXCEPTION 'EVENT_STUDENT_NOT_FOUND_OR_ARCHIVED'
        USING ERRCODE='42501';
    END IF;
  END IF;

  IF p_event_id IS NULL THEN
    v_title:=btrim(p_fields->>'title');
    IF v_title IS NULL OR length(v_title) NOT BETWEEN 1 AND 200
       OR nullif(p_fields->>'starts_at','') IS NULL THEN
      RAISE EXCEPTION 'EVENT_TITLE_AND_START_REQUIRED' USING ERRCODE='22023';
    END IF;
    v_start:=(p_fields->>'starts_at')::timestamptz;
    v_end:=nullif(p_fields->>'ends_at','')::timestamptz;
    IF v_end IS NOT NULL AND v_end<=v_start THEN
      RAISE EXCEPTION 'EVENT_END_BEFORE_START' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.events(
      teacher_id,title,description,location,starts_at,ends_at,send_reminder
    ) VALUES(
      v_teacher,v_title,coalesce(p_fields->>'description',''),
      coalesce(p_fields->>'location',''),v_start,v_end,
      coalesce((p_fields->>'send_reminder')::boolean,false)
    ) RETURNING * INTO v_event;
    -- An empty roster is valid for a brand-new event.
    p_student_ids:=coalesce(p_student_ids,ARRAY[]::uuid[]);
  ELSE
    SELECT * INTO v_event FROM public.events
      WHERE id=p_event_id AND teacher_id=v_teacher FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE='42501';
    END IF;
    v_title:=CASE WHEN p_fields ? 'title'
      THEN btrim(p_fields->>'title') ELSE v_event.title END;
    IF v_title IS NULL OR length(v_title) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'EVENT_INVALID_TITLE' USING ERRCODE='22023';
    END IF;
    v_start:=CASE WHEN p_fields ? 'starts_at'
      THEN (p_fields->>'starts_at')::timestamptz ELSE v_event.starts_at END;
    v_end:=CASE WHEN p_fields ? 'ends_at'
      THEN nullif(p_fields->>'ends_at','')::timestamptz ELSE v_event.ends_at END;
    IF v_start IS NULL OR (v_end IS NOT NULL AND v_end<=v_start) THEN
      RAISE EXCEPTION 'EVENT_END_BEFORE_START' USING ERRCODE='22023';
    END IF;
    UPDATE public.events SET
      title=v_title,
      description=CASE WHEN p_fields ? 'description'
        THEN coalesce(p_fields->>'description','') ELSE description END,
      location=CASE WHEN p_fields ? 'location'
        THEN coalesce(p_fields->>'location','') ELSE location END,
      starts_at=v_start,
      ends_at=v_end,
      send_reminder=CASE WHEN p_fields ? 'send_reminder'
        THEN (p_fields->>'send_reminder')::boolean ELSE send_reminder END,
      reminder_sent_at=CASE WHEN v_start IS DISTINCT FROM v_event.starts_at
        THEN NULL ELSE reminder_sent_at END,
      updated_at=now()
    WHERE id=v_event.id AND teacher_id=v_teacher RETURNING * INTO v_event;
  END IF;

  IF p_student_ids IS NOT NULL THEN
    DELETE FROM public.event_students
      WHERE event_id=v_event.id AND NOT (student_id=ANY(p_student_ids));
    FOR v_roster,v_index IN
      SELECT student_id,ordinality::integer
      FROM unnest(p_student_ids) WITH ORDINALITY AS roster(student_id,ordinality)
    LOOP
      v_repertoire:=coalesce(p_repertoire->>v_roster::text,'');
      IF jsonb_typeof(p_repertoire->v_roster::text) NOT IN ('string')
         AND p_repertoire ? v_roster::text THEN
        RAISE EXCEPTION 'EVENT_INVALID_REPERTOIRE' USING ERRCODE='22023';
      END IF;
      IF length(v_repertoire)>10000 THEN
        RAISE EXCEPTION 'EVENT_INVALID_REPERTOIRE' USING ERRCODE='22023';
      END IF;
      INSERT INTO public.event_students(event_id,student_id,repertoire,sort_order)
      VALUES(v_event.id,v_roster,v_repertoire,v_index-1)
      ON CONFLICT(event_id,student_id) DO UPDATE SET
        repertoire=EXCLUDED.repertoire,sort_order=EXCLUDED.sort_order;
    END LOOP;

    -- Keep existing responses for families still invited; add new pending
    -- responses and remove only families no longer represented in the roster.
    DELETE FROM public.event_rsvps r WHERE r.event_id=v_event.id
      AND NOT EXISTS (
        SELECT 1 FROM public.event_students es
        JOIN public.students s ON s.id=es.student_id
        WHERE es.event_id=v_event.id AND s.guardian_id=r.guardian_id
      );
    INSERT INTO public.event_rsvps(event_id,guardian_id,status)
      SELECT DISTINCT v_event.id,s.guardian_id,'pending'::public.rsvp_status
      FROM public.event_students es
      JOIN public.students s ON s.id=es.student_id
      WHERE es.event_id=v_event.id AND s.guardian_id IS NOT NULL
      ON CONFLICT(event_id,guardian_id) DO NOTHING;
  END IF;
  RETURN to_jsonb(v_event);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_teacher_event_save(uuid,jsonb,uuid[],jsonb)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_event_save(uuid,jsonb,uuid[],jsonb)
 TO authenticated;
