-- Backup restoration is one authenticated database transaction, not a
-- sequence of independently committed PostgREST table upserts. An invalid
-- dependent row, tenant/RLS violation or failed quota check rolls back ALL
-- earlier writes and the replay receipt, for both website and MCP callers.
CREATE TABLE public.teacher_backup_import_receipts (
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, digest)
);
ALTER TABLE public.teacher_backup_import_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY teacher_backup_receipts_owner ON public.teacher_backup_import_receipts
  FOR ALL TO authenticated USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());
REVOKE ALL ON public.teacher_backup_import_receipts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE(result) ON public.teacher_backup_import_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_teacher_backup_restore(
  p_tables jsonb, p_display_name text, p_digest text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_table text;
  v_source jsonb;
  v_row jsonb;
  v_rows jsonb;
  v_columns text;
  v_updates text;
  v_pkeys text;
  v_count integer;
  v_updated integer;
  v_counts jsonb := '{}'::jsonb;
  v_result jsonb;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_tables) IS DISTINCT FROM 'object'
    OR p_digest !~ '^[a-f0-9]{64}$' OR p_digest IS NULL
    OR pg_column_size(p_tables) > 2097152 THEN
    RAISE EXCEPTION 'IMPORT_VALIDATION_ERROR' USING ERRCODE = '22023';
  END IF;

  -- Independent backups for the same teacher cannot interleave; the receipt
  -- insert also serializes concurrent retries of an identical approved digest.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_teacher::text, 0));
  INSERT INTO public.teacher_backup_import_receipts (teacher_id, digest, result)
  VALUES (v_teacher, p_digest, '{}'::jsonb) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT result INTO v_result FROM public.teacher_backup_import_receipts
    WHERE teacher_id = v_teacher AND digest = p_digest;
    IF v_result IS NULL THEN
      RAISE EXCEPTION 'IMPORT_RECEIPT_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_result;
  END IF;

  -- Match the portable backup's FK-safe ordering. The list is fixed in SQL;
  -- arbitrary JSON table names are ignored, never interpolated into SQL.
  FOREACH v_table IN ARRAY ARRAY[
    'studio_policies', 'guardians', 'students', 'workplaces', 'class_groups',
    'workplace_enrollments', 'group_enrollments', 'teaching_sessions',
    'session_participants', 'session_attendance', 'chess_skill_categories',
    'chess_observations', 'chess_learning_resources', 'lesson_slots', 'lessons',
    'attendance', 'lesson_notes', 'skill_dimensions', 'skill_assessments',
    'invoices', 'invoice_items', 'payments', 'events', 'event_students',
    'event_rsvps', 'credit_packages', 'credit_redemptions'
  ] LOOP
    v_source := p_tables -> v_table;
    IF v_table = 'studio_policies' THEN
      IF v_source IS NULL OR v_source = 'null'::jsonb THEN
        v_rows := '[]'::jsonb;
      ELSIF jsonb_typeof(v_source) = 'object' THEN
        v_rows := jsonb_build_array(v_source);
      ELSE
        RAISE EXCEPTION 'IMPORT_INVALID_TABLE:%', v_table USING ERRCODE='22023';
      END IF;
    ELSIF v_source IS NULL THEN
      v_rows := '[]'::jsonb;
    ELSIF jsonb_typeof(v_source) = 'array' THEN
      v_rows := v_source;
    ELSE
      RAISE EXCEPTION 'IMPORT_INVALID_TABLE:%', v_table USING ERRCODE='22023';
    END IF;

    v_count := 0;
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY key_cols.ordinality)
      INTO v_pkeys
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS key_cols(attnum, ordinality)
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key_cols.attnum
    WHERE i.indrelid = format('public.%I', v_table)::regclass AND i.indisprimary;
    IF v_pkeys IS NULL THEN
      RAISE EXCEPTION 'IMPORT_UNSUPPORTED_TABLE:%', v_table USING ERRCODE='22023';
    END IF;

    FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
      IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'IMPORT_INVALID_ROW:%', v_table USING ERRCODE='22023';
      END IF;
      IF v_table = ANY(ARRAY[
        'studio_policies', 'guardians', 'students', 'workplaces', 'class_groups',
        'workplace_enrollments', 'group_enrollments', 'teaching_sessions',
        'session_participants', 'session_attendance', 'chess_skill_categories',
        'chess_observations', 'chess_learning_resources', 'lesson_slots', 'lessons',
        'skill_dimensions', 'invoices', 'events', 'credit_packages',
        'credit_redemptions'
      ]) THEN
        v_row := jsonb_set(v_row, '{teacher_id}', to_jsonb(v_teacher::text), true);
      END IF;
      IF v_table = 'studio_policies' THEN
        v_row := v_row - 'stripe_secret_key' - 'stripe_publishable_key'
                 - 'stripe_webhook_secret' - 'ai_api_key';
      END IF;
      IF v_table = 'guardians'
        AND nullif(btrim(v_row ->> 'portal_token'), '') IS NULL THEN
        v_row := jsonb_set(v_row, '{portal_token}', to_jsonb(
          rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=')
        ), true);
      END IF;

      -- Insert only supplied columns so database defaults survive sparse
      -- portable exports. PostgreSQL performs the whole operation under RLS:
      -- a foreign owner's ID cannot be overwritten or attached via child FK.
      SELECT string_agg(format('%I', field), ', ' ORDER BY field),
             string_agg(format('%I = EXCLUDED.%I', field, field), ', ' ORDER BY field)
        INTO v_columns, v_updates
      FROM jsonb_object_keys(v_row) AS keys(field);
      IF v_columns IS NULL THEN
        RAISE EXCEPTION 'IMPORT_EMPTY_ROW:%', v_table USING ERRCODE='22023';
      END IF;
      EXECUTE format(
        'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT (%s) DO UPDATE SET %s',
        v_table, v_columns, v_columns, v_table, v_pkeys, v_updates
      ) USING v_row;
      v_count := v_count + 1;
    END LOOP;
    v_counts := jsonb_set(v_counts, ARRAY[v_table], to_jsonb(v_count), true);
  END LOOP;

  IF nullif(btrim(p_display_name), '') IS NOT NULL THEN
    UPDATE public.teachers SET display_name = btrim(p_display_name)
    WHERE id = v_teacher AND nullif(btrim(display_name), '') IS NULL;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 1 THEN
      v_counts := jsonb_set(v_counts, '{teacher_profile}', '1'::jsonb, true);
    END IF;
  END IF;
  v_result := jsonb_build_object('counts', v_counts);
  UPDATE public.teacher_backup_import_receipts SET result = v_result
  WHERE teacher_id = v_teacher AND digest = p_digest;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_teacher_backup_restore(jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_backup_restore(jsonb, text, text) TO authenticated;
