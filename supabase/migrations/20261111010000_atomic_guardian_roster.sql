-- Every website/MCP family + member mutation is one owner-scoped transaction.
-- Previously a successful guardian insert could survive failed student creation,
-- or a partial member reassignment could detach only some students.
-- Direct RPC calls are also validated: no arbitrary owner or foreign student IDs.
CREATE OR REPLACE FUNCTION public.ccp_guardian_save(
  p_guardian_id uuid,
  p_fields jsonb,
  p_student_ids uuid[],
  p_replace_members boolean,
  p_new_students jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_guardian public.guardians%ROWTYPE;
  v_name text;
  v_new jsonb;
  v_existing_ids integer;
  v_assigned integer;
  v_prior_guardians uuid[];
  v_old uuid;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object'
     OR pg_column_size(p_fields)>16384
     OR EXISTS (
       SELECT 1 FROM jsonb_each(p_fields) AS f
       WHERE f.key NOT IN (
         'name','family_name','email','phone','secondary_name',
         'secondary_email','secondary_phone','email_recipients'
       ) OR (f.value<>'null'::jsonb AND jsonb_typeof(f.value)<>'string')
     )
     OR jsonb_typeof(p_new_students) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_new_students)>50 THEN
    RAISE EXCEPTION 'GUARDIAN_INVALID_INPUT' USING ERRCODE='22023';
  END IF;
  IF p_fields ? 'name' THEN
    v_name:=btrim(p_fields->>'name');
    IF v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'GUARDIAN_INVALID_NAME' USING ERRCODE='22023';
    END IF;
  END IF;
  IF p_fields ? 'email_recipients' AND
     p_fields->>'email_recipients' NOT IN ('primary','secondary','both') THEN
    RAISE EXCEPTION 'GUARDIAN_INVALID_RECIPIENTS' USING ERRCODE='22023';
  END IF;
  -- Serializes concurrent family changes and student capacity reservations.
  -- No elevated UPDATE rights on teachers are required here. Existing
  -- student-capacity triggers serialize inserts on the teacher row, while
  -- family/event rows and PostgreSQL foreign keys protect their own writes.
  PERFORM 1 FROM public.teachers WHERE id=v_teacher;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;

  -- Validate the complete replacement roster before creating or editing it.
  IF p_replace_members THEN
    IF p_student_ids IS NULL OR cardinality(p_student_ids)>200
       OR cardinality(p_student_ids) <> (
         SELECT count(DISTINCT x) FROM unnest(p_student_ids) AS x
       ) THEN
      RAISE EXCEPTION 'GUARDIAN_INVALID_ROSTER' USING ERRCODE='22023';
    END IF;
    SELECT count(*) INTO v_existing_ids FROM public.students
      WHERE teacher_id=v_teacher AND id=ANY(p_student_ids);
    IF v_existing_ids<>cardinality(p_student_ids) THEN
      RAISE EXCEPTION 'GUARDIAN_STUDENT_NOT_FOUND' USING ERRCODE='42501';
    END IF;
  END IF;

  IF p_guardian_id IS NULL THEN
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'GUARDIAN_INVALID_NAME' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.guardians (
      teacher_id,name,family_name,email,phone,secondary_name,
      secondary_email,secondary_phone,email_recipients,portal_token
    ) VALUES (
      v_teacher,v_name,nullif(btrim(p_fields->>'family_name'),''),
      nullif(btrim(p_fields->>'email'),''),
      nullif(btrim(p_fields->>'phone'),''),
      nullif(btrim(p_fields->>'secondary_name'),''),
      nullif(btrim(p_fields->>'secondary_email'),''),
      nullif(btrim(p_fields->>'secondary_phone'),''),
      coalesce(p_fields->>'email_recipients','primary'),
      encode(extensions.gen_random_bytes(24),'hex')
    ) RETURNING * INTO v_guardian;
  ELSE
    SELECT * INTO v_guardian FROM public.guardians
      WHERE id=p_guardian_id AND teacher_id=v_teacher FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'GUARDIAN_NOT_FOUND' USING ERRCODE='42501';
    END IF;
    UPDATE public.guardians SET
      name=CASE WHEN p_fields ? 'name' THEN v_name ELSE name END,
      family_name=CASE WHEN p_fields ? 'family_name'
        THEN nullif(btrim(p_fields->>'family_name'),'') ELSE family_name END,
      email=CASE WHEN p_fields ? 'email'
        THEN nullif(btrim(p_fields->>'email'),'') ELSE email END,
      phone=CASE WHEN p_fields ? 'phone'
        THEN nullif(btrim(p_fields->>'phone'),'') ELSE phone END,
      secondary_name=CASE WHEN p_fields ? 'secondary_name'
        THEN nullif(btrim(p_fields->>'secondary_name'),'') ELSE secondary_name END,
      secondary_email=CASE WHEN p_fields ? 'secondary_email'
        THEN nullif(btrim(p_fields->>'secondary_email'),'') ELSE secondary_email END,
      secondary_phone=CASE WHEN p_fields ? 'secondary_phone'
        THEN nullif(btrim(p_fields->>'secondary_phone'),'') ELSE secondary_phone END,
      email_recipients=CASE WHEN p_fields ? 'email_recipients'
        THEN p_fields->>'email_recipients' ELSE email_recipients END
    WHERE id=v_guardian.id AND teacher_id=v_teacher
    RETURNING * INTO v_guardian;
  END IF;

  IF p_replace_members THEN
    SELECT array_agg(DISTINCT guardian_id) INTO v_prior_guardians
      FROM public.students WHERE teacher_id=v_teacher
        AND id=ANY(p_student_ids) AND guardian_id IS NOT NULL
        AND guardian_id<>v_guardian.id;
    UPDATE public.students SET guardian_id=NULL
      WHERE teacher_id=v_teacher AND guardian_id=v_guardian.id
        AND NOT (id=ANY(p_student_ids));
    UPDATE public.students SET guardian_id=v_guardian.id
      WHERE teacher_id=v_teacher AND id=ANY(p_student_ids);
    GET DIAGNOSTICS v_assigned = ROW_COUNT;
    -- A student may have disappeared between preflight and the write.
    -- Never acknowledge a partly reassigned roster.
    IF v_assigned<>cardinality(p_student_ids) THEN
      RAISE EXCEPTION 'GUARDIAN_ROSTER_CHANGED' USING ERRCODE='40001';
    END IF;
  END IF;

  FOR v_new IN SELECT value FROM jsonb_array_elements(p_new_students) LOOP
    v_name:=btrim(v_new->>'name');
    IF jsonb_typeof(v_new) IS DISTINCT FROM 'object'
      OR v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 200
      OR (v_new ? 'birthdate' AND v_new->'birthdate'<>'null'::jsonb
        AND jsonb_typeof(v_new->'birthdate')<>'string') THEN
      RAISE EXCEPTION 'GUARDIAN_INVALID_STUDENT' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.students(teacher_id,guardian_id,name,birthdate)
    VALUES(v_teacher,v_guardian.id,v_name,nullif(v_new->>'birthdate','')::date);
  END LOOP;

  -- Preserve the previous optional cleanup, without allowing any FK conflict
  -- from an unrelated historic record to roll back a successful roster edit.
  IF v_prior_guardians IS NOT NULL THEN
    FOREACH v_old IN ARRAY v_prior_guardians LOOP
      BEGIN
        DELETE FROM public.guardians g
          WHERE g.id=v_old AND g.teacher_id=v_teacher
            AND NOT EXISTS (SELECT 1 FROM public.students s
              WHERE s.teacher_id=v_teacher AND s.guardian_id=g.id)
            AND NOT EXISTS (SELECT 1 FROM public.invoices i
              WHERE i.teacher_id=v_teacher AND i.guardian_id=g.id);
      EXCEPTION WHEN foreign_key_violation THEN
        NULL;
      END;
    END LOOP;
  END IF;
  RETURN to_jsonb(v_guardian);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_guardian_save(uuid,jsonb,uuid[],boolean,jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_guardian_save(uuid,jsonb,uuid[],boolean,jsonb)
  TO authenticated;
