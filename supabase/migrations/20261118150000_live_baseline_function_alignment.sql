-- ADR-0015 explicit one-time baseline convergence repair.
-- Existing live revisions already record earlier migrations, which never rerun.
-- The canonical baseline already contains these two updated function bodies.
-- No tables, records, policies, entitlements or other user data are mutated.
-- Review off-host backup/restore, tenant isolation and operator authorization
-- before applying to an existing deployed beta; this PR does NOT deploy.
BEGIN;

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
     IF EXISTS(SELECT 1 FROM public.workplace_enrollments
               WHERE teacher_id=v_teacher AND student_id=NEW.id)
       OR EXISTS(SELECT 1 FROM public.lesson_slots
               WHERE teacher_id=v_teacher AND student_id=NEW.id AND active)
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

-- Reassert least privilege; CREATE OR REPLACE does not expand client grants.
REVOKE ALL ON FUNCTION public.ccp_student_capacity_guard() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ccp_restore_canonical_chess_rows(p_tables jsonb)
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
   'material_links','material_teaching_evidence','training_assignments','assignment_attempts','assignment_reviews',
   'student_training_plans','student_training_plan_revisions',
   'ccp_historical_attendance_evidence'
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
     -- A stale snapshot cannot erase newer audit revisions or teacher decisions.
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
       -- Historical evidence is immutable source testimony. Portable restores
       -- may replay an identical saved row, never rewrite its provenance,
       -- exact date, count, teacher, student or workplace.
       WHEN v_table='ccp_historical_attendance_evidence'
         THEN ' AND to_jsonb(dst) = to_jsonb(EXCLUDED)'
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
GRANT EXECUTE ON FUNCTION public.ccp_restore_canonical_chess_rows(jsonb) TO authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
