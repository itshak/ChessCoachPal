-- One chess skill-assessment round is one teacher-owned, retry-safe transaction.
-- Retry receipts are private to an authenticated teacher. Historical ratings
-- remain append-only; one UUID cannot mean two different payloads.
CREATE TABLE IF NOT EXISTS public.skill_assessment_write_receipts (
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  student_id uuid NOT NULL,
  payload jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(teacher_id,idempotency_key),
  CONSTRAINT skill_assessment_receipt_student_owner_fk
    FOREIGN KEY(student_id,teacher_id) REFERENCES public.students(id,teacher_id)
    ON DELETE CASCADE
);
ALTER TABLE public.skill_assessment_write_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.skill_assessment_write_receipts FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ccp_skill_assessments_record(
  p_student_id uuid,p_assessed_on date,p_ratings jsonb,p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_payload jsonb;
  v_old_payload jsonb;v_old_result jsonb;
  v_item jsonb;v_dimension uuid;v_rating integer;v_note text;
  v_dimensions uuid[]:='{}'::uuid[];
  v_locked_count integer;v_record jsonb;
  v_result jsonb:='[]'::jsonb;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_student_id IS NULL OR p_assessed_on IS NULL OR p_request_id IS NULL OR
     jsonb_typeof(p_ratings) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_ASSESSMENT' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_ratings) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'INVALID_ASSESSMENT_COUNT' USING ERRCODE='22023';
  END IF;

  -- Do not include today's date in the immutable request payload. An exact
  -- retry after teacher-local midnight must return the original dated rows.
  v_payload:=jsonb_build_object('studentId',p_student_id,'ratings',p_ratings);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_teacher::text||':skill-round:'||p_request_id::text,0));
  SELECT payload,result INTO v_old_payload,v_old_result
    FROM public.skill_assessment_write_receipts
    WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
  IF FOUND THEN
    IF v_old_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'SKILL_REQUEST_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN v_old_result;
  END IF;

  PERFORM 1 FROM public.students
    WHERE id=p_student_id AND teacher_id=v_teacher FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STUDENT_NOT_FOUND' USING ERRCODE='42501';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_ratings) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR
       jsonb_typeof(v_item->'dimensionId') IS DISTINCT FROM 'string' OR
       jsonb_typeof(v_item->'rating') IS DISTINCT FROM 'number' OR
       COALESCE(jsonb_typeof(v_item->'note'),'null') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'INVALID_ASSESSMENT' USING ERRCODE='22023';
    END IF;
    v_dimension:=(v_item->>'dimensionId')::uuid;
    v_rating:=(v_item->>'rating')::integer;
    v_note:=nullif(btrim(v_item->>'note'),'');
    IF v_dimension IS NULL OR v_rating NOT BETWEEN 1 AND 5 OR
       length(v_note)>2000 OR v_dimension=ANY(v_dimensions) THEN
      RAISE EXCEPTION 'INVALID_ASSESSMENT_VALUE' USING ERRCODE='22023';
    END IF;
    v_dimensions:=array_append(v_dimensions,v_dimension);
  END LOOP;

  -- Lock the referenced dimensions before inserting to prevent concurrent
  -- deletion between owner check and the historical rating write.
  SELECT count(*) INTO v_locked_count FROM (
    SELECT id FROM public.skill_dimensions
      WHERE teacher_id=v_teacher AND id=ANY(v_dimensions)
      FOR KEY SHARE
  ) AS owned;
  IF v_locked_count<>jsonb_array_length(p_ratings) THEN
    RAISE EXCEPTION 'SKILL_DIMENSION_NOT_FOUND' USING ERRCODE='42501';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_ratings) LOOP
    v_dimension:=(v_item->>'dimensionId')::uuid;
    v_rating:=(v_item->>'rating')::integer;
    v_note:=nullif(btrim(v_item->>'note'),'');
    INSERT INTO public.skill_assessments(student_id,dimension_id,rating,note,assessed_on)
      VALUES(p_student_id,v_dimension,v_rating,v_note,p_assessed_on)
      RETURNING jsonb_build_object(
        'id',id,'dimension_id',dimension_id,'rating',rating,
        'note',note,'assessed_on',assessed_on,'created_at',created_at
      ) INTO v_record;
    v_result:=v_result||jsonb_build_array(v_record);
  END LOOP;

  INSERT INTO public.skill_assessment_write_receipts(
    teacher_id,idempotency_key,student_id,payload,result
  ) VALUES(v_teacher,p_request_id,p_student_id,v_payload,v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.ccp_skill_assessments_record(uuid,date,jsonb,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_skill_assessments_record(uuid,date,jsonb,uuid)
  TO authenticated;
