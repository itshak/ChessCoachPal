-- Extend prelaunch portable teacher backup with all canonical chess
-- materials, teacher assignments, manual source links, and student goals.
-- This does not restore OAuth credentials or receipt tables.
--
-- The helper is SECURITY DEFINER because regular authenticated users have
-- SELECT-only access to the new evidence tables: all ordinary mutations are
-- restricted to owner-derived domain RPCs with revision and approval checks.
-- Restoration is an explicit, audited coach-owned operation using one
-- authenticated backup receipt; the helper enforces teacher ownership and
-- checks each upsert target before allowing a conflict update.
CREATE FUNCTION public.ccp_restore_canonical_chess_rows(p_tables jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path='' AS $restore_chess$
DECLARE
 v_teacher uuid := auth.uid();
 v_table text;
 v_rows jsonb;
 v_row jsonb;
 v_goal jsonb;
 v_goal_key text;
 v_pkeys text;
 v_columns text;
 v_updates text;
 v_count integer;
 v_changed integer;
 v_guard text;
 v_counts jsonb:='{}'::jsonb;
BEGIN
 IF v_teacher IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.teachers WHERE id=v_teacher
 ) THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_tables) <> 'object' OR
    pg_column_size(p_tables)>2097152
 THEN RAISE EXCEPTION 'IMPORT_VALIDATION_ERROR' USING ERRCODE='22023'; END IF;

 -- Safe deterministic FK order: no untyped table names or arbitrary SQL.
 FOREACH v_table IN ARRAY ARRAY[
   'learning_materials','chess_games','chess_puzzles','chess_drills',
   'chess_study_chapters','learning_material_relations',
   'training_assignments','assignment_attempts','assignment_reviews',
   'learning_material_legacy_links',
   'student_training_plans','student_training_plan_revisions'
 ] LOOP
   v_rows := p_tables -> v_table;
   IF v_rows IS NULL THEN CONTINUE; END IF;
   IF jsonb_typeof(v_rows)<>'array' OR jsonb_array_length(v_rows)>20000
   THEN RAISE EXCEPTION 'IMPORT_INVALID_TABLE:%',v_table USING ERRCODE='22023'; END IF;

   SELECT string_agg(format('%I',a.attname),', ' ORDER BY cols.ordinality)
     INTO v_pkeys
   FROM pg_index i
   CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY cols(attnum,ordinality)
   JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=cols.attnum
   WHERE i.indrelid=format('public.%I',v_table)::regclass AND i.indisprimary;
   IF v_pkeys IS NULL THEN RAISE EXCEPTION 'IMPORT_UNSUPPORTED_TABLE:%',v_table; END IF;

   v_count:=0;
   FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
     IF jsonb_typeof(v_row)<>'object'
     THEN RAISE EXCEPTION 'IMPORT_INVALID_ROW:%',v_table USING ERRCODE='22023'; END IF;

     -- The teacher identity is *always* the signed-in person. Copying foreign
     -- IDs to another owner never grants access to the old user's data.
     v_row:=jsonb_set(v_row,'{teacher_id}',to_jsonb(v_teacher::text),true);
     -- Never rewind a live revision counter when an old backup is restored.
     -- Otherwise an earlier snapshot could falsify immutable audit history.
     IF v_table='learning_materials' AND EXISTS(
       SELECT 1 FROM public.learning_materials m
       WHERE m.teacher_id=v_teacher AND m.id=(v_row->>'id')::uuid
         AND m.revision>(v_row->>'revision')::bigint
     ) THEN RAISE EXCEPTION 'IMPORT_STALE_MATERIAL' USING ERRCODE='22023'; END IF;
     IF v_table='student_training_plans' AND EXISTS(
       SELECT 1 FROM public.student_training_plans p
       WHERE p.teacher_id=v_teacher AND p.id=(v_row->>'id')::uuid
         AND p.revision>(v_row->>'revision')::bigint
     ) THEN RAISE EXCEPTION 'IMPORT_STALE_TRAINING_PLAN' USING ERRCODE='22023'; END IF;

     -- Goals are teacher attestations, not machine-inferred scores; importing
     -- a snapshot cannot evade the proof required by normal plan commits.
     IF v_table='student_training_plans' THEN
       IF jsonb_typeof(v_row->'goals')<>'array' OR
          jsonb_array_length(v_row->'goals')>20
       THEN RAISE EXCEPTION 'IMPORT_INVALID_GOALS' USING ERRCODE='22023'; END IF;
       FOR v_goal IN SELECT value FROM jsonb_array_elements(v_row->'goals') LOOP
         IF jsonb_typeof(v_goal)<>'object' OR
            coalesce(v_goal->>'status','') NOT IN
              ('planned','in_progress','achieved','abandoned') OR
            char_length(btrim(coalesce(v_goal->>'title',''))) NOT BETWEEN 1 AND 160 OR
            (v_goal->>'status'='achieved' AND
             char_length(btrim(coalesce(v_goal->>'coachEvidence','')))<10)
         THEN RAISE EXCEPTION 'IMPORT_INVALID_GOAL' USING ERRCODE='22023'; END IF;
         FOR v_goal_key IN SELECT jsonb_object_keys(v_goal) LOOP
           IF v_goal_key NOT IN ('id','title','status','targetDate','coachEvidence')
           THEN RAISE EXCEPTION 'IMPORT_INVALID_GOAL_FIELD' USING ERRCODE='22023'; END IF;
         END LOOP;
       END LOOP;
     END IF;

     -- Plan revision snapshots are immutable teacher attestations. Imports
     -- can replay the same snapshot, never rewrite an existing revision.
     IF v_table='student_training_plan_revisions' AND (
       v_row->>'revision' IS NULL OR
       (v_row->'snapshot'->>'revision') IS DISTINCT FROM (v_row->>'revision')
     ) THEN RAISE EXCEPTION 'IMPORT_INVALID_PLAN_REVISION' USING ERRCODE='22023'; END IF;

     -- Do not restore a historical mapping to an already archived material;
     -- the canonical service also forbids this transition.
     IF v_table='learning_material_legacy_links' AND EXISTS(
       SELECT 1 FROM public.learning_materials m
       WHERE m.teacher_id=v_teacher AND
         m.id=(v_row->>'material_id')::uuid AND m.archived_at IS NOT NULL
     ) THEN RAISE EXCEPTION 'IMPORT_ARCHIVED_MATERIAL_MAPPING' USING ERRCODE='22023'; END IF;

     SELECT string_agg(format('%I',field),', ' ORDER BY field),
            string_agg(format('%I = EXCLUDED.%I',field,field),', ' ORDER BY field)
       INTO v_columns,v_updates
     FROM jsonb_object_keys(v_row) AS keys(field);
     IF v_columns IS NULL
     THEN RAISE EXCEPTION 'IMPORT_EMPTY_ROW:%',v_table USING ERRCODE='22023'; END IF;

     -- A conflict with an ID owned by another tenant updates zero rows and
     -- fails the *entire* restore. All FK relations have teacher-scoped keys.
     v_guard:=CASE
       WHEN v_table='student_training_plan_revisions'
         THEN ' AND dst.snapshot = EXCLUDED.snapshot'
       WHEN v_table IN ('assignment_attempts','assignment_reviews')
         THEN ' AND dst.request_hash = EXCLUDED.request_hash'
       ELSE '' END;
     EXECUTE format(
       'INSERT INTO public.%I AS dst (%s)
          SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1)
          ON CONFLICT (%s) DO UPDATE SET %s WHERE dst.teacher_id = $2 %s',
       v_table,v_columns,v_columns,v_table,v_pkeys,v_updates,v_guard
     ) USING v_row,v_teacher;
     GET DIAGNOSTICS v_changed=ROW_COUNT;
     IF v_changed<>1 THEN
       RAISE EXCEPTION 'IMPORT_FOREIGN_RECORD:%',v_table USING ERRCODE='42501';
     END IF;
     v_count:=v_count+1;
   END LOOP;
   v_counts:=jsonb_set(v_counts,ARRAY[v_table],to_jsonb(v_count),true);
 END LOOP;
 RETURN v_counts;
END;
$restore_chess$;

REVOKE ALL ON FUNCTION public.ccp_restore_canonical_chess_rows(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_restore_canonical_chess_rows(jsonb)
 TO authenticated;

-- Override the prelaunch wrapper without duplicating the old mutation logic.
-- The existing legacy table loop, RLS checks, source ordering and digest
-- receipt stay unchanged, and new tables are committed before that receipt.
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
  -- Include typed chess data in the SAME database transaction and receipt.
  -- If any new table fails, existing schedules/finance/history are rolled back.
  v_counts := v_counts || public.ccp_restore_canonical_chess_rows(p_tables);
  v_result := jsonb_build_object('counts', v_counts);
  UPDATE public.teacher_backup_import_receipts SET result = v_result
  WHERE teacher_id = v_teacher AND digest = p_digest;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_teacher_backup_restore(jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_backup_restore(jsonb, text, text) TO authenticated;

