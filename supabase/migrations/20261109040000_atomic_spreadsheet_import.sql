-- One authenticated RPC transaction for spreadsheet onboarding, including
-- family creation, deduplication, quota reservations, and durable replay receipt.
-- A rejected row or hosted-cap conflict rolls back every student/family/receipt.
CREATE TABLE public.teacher_spreadsheet_import_receipts (
 teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
 idempotency_key uuid NOT NULL,
 request_hash text NOT NULL,
 receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(teacher_id,idempotency_key)
);
ALTER TABLE public.teacher_spreadsheet_import_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teacher_spreadsheet_import_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.teacher_spreadsheet_import_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.ccp_teacher_spreadsheet_commit(
 p_rows jsonb, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
 v_teacher uuid:=auth.uid();
 v_row jsonb; v_digest text; v_saved public.teacher_spreadsheet_import_receipts%ROWTYPE;
 v_names jsonb:='{}'::jsonb; v_group_ids jsonb:='{}'::jsonb;
 v_name text; v_key text; v_email text; v_guardian uuid; v_parent text;
 v_created integer:=0; v_skipped integer:=0; v_families integer:=0;
 v_skipped_rows jsonb:='[]'::jsonb; v_result jsonb;
 v_row_number integer;
BEGIN
 IF v_teacher IS NULL THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 IF p_idempotency_key IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN
   RAISE EXCEPTION 'IMPORT_VALIDATION_ERROR' USING ERRCODE='22023';
 END IF;
 -- Lock once for the entire batch. The per-student quota trigger obtains this
 -- same lock and therefore cannot race with another import or a direct create.
 PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 v_digest:=md5(p_rows::text);
 INSERT INTO public.teacher_spreadsheet_import_receipts
    (teacher_id,idempotency_key,request_hash,receipt)
 VALUES(v_teacher,p_idempotency_key,v_digest,'{}'::jsonb)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO v_saved FROM public.teacher_spreadsheet_import_receipts
   WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
   IF NOT FOUND OR v_saved.request_hash<>v_digest THEN
     RAISE EXCEPTION 'IMPORT_REPLAY_CONFLICT' USING ERRCODE='23505';
   END IF;
   RETURN v_saved.receipt;
 END IF;

 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
   v_name:=btrim(v_row->>'studentName');
   v_key:=v_row->>'familyKey';
   v_row_number:=(v_row->>'sourceRow')::integer;
   IF jsonb_typeof(v_row)<>'object' OR v_name IS NULL
      OR length(v_name) NOT BETWEEN 1 AND 200
      OR v_key IS NULL OR length(v_key) NOT BETWEEN 1 AND 320
      OR v_row_number NOT BETWEEN 1 AND 1000000
      OR length(coalesce(v_row->>'teacherNotes',''))>50000
      OR length(coalesce(v_row->>'guardianName',''))>200 THEN
     RAISE EXCEPTION 'IMPORT_VALIDATION_ERROR' USING ERRCODE='22023';
   END IF;
   -- Historical/archived student names are preserved, not recreated.
   -- Holding the teacher lock makes this check consistent with other imports.
   IF EXISTS(SELECT 1 FROM public.students
     WHERE teacher_id=v_teacher AND lower(btrim(name))=lower(v_name)) THEN
     v_skipped:=v_skipped+1;
     IF jsonb_array_length(v_skipped_rows)<50 THEN
       v_skipped_rows:=v_skipped_rows||jsonb_build_array(
         jsonb_build_object('row',v_row_number,'reason','Student already exists'));
     END IF;
     CONTINUE;
   END IF;

   v_guardian:=NULL;
   IF v_group_ids ? v_key THEN
     v_guardian:=(v_group_ids->>v_key)::uuid;
   ELSE
     v_email:=lower(nullif(btrim(v_row->>'email'),''));
     IF v_email IS NOT NULL THEN
       SELECT id INTO v_guardian FROM public.guardians
       WHERE teacher_id=v_teacher AND lower(btrim(email))=v_email
       ORDER BY created_at,id LIMIT 1;
     END IF;
     IF v_guardian IS NULL THEN
       v_parent:=coalesce(nullif(btrim(v_row->>'guardianName'),''),
           nullif(btrim(v_row->>'familyName'),''),
           CASE WHEN v_email IS NOT NULL
              OR nullif(btrim(v_row->>'phone'),'') IS NOT NULL
             THEN 'Parent of '||v_name ELSE v_name END);
       INSERT INTO public.guardians(
         teacher_id,name,family_name,email,phone,
         secondary_name,secondary_email,secondary_phone,portal_token
       ) VALUES(
         v_teacher,v_parent,nullif(btrim(v_row->>'familyName'),''),
         nullif(btrim(v_row->>'email'),''),nullif(btrim(v_row->>'phone'),''),
         nullif(btrim(v_row->>'secondaryName'),''),
         nullif(btrim(v_row->>'secondaryEmail'),''),
         nullif(btrim(v_row->>'secondaryPhone'),''),
         encode(extensions.gen_random_bytes(24),'hex')
       ) RETURNING id INTO v_guardian;
       v_families:=v_families+1;
     END IF;
     v_group_ids:=jsonb_set(v_group_ids,ARRAY[v_key],to_jsonb(v_guardian::text),true);
   END IF;

   INSERT INTO public.students(
     teacher_id,name,guardian_id,birthdate,level,teacher_notes
   ) VALUES (
     v_teacher,v_name,v_guardian,nullif(v_row->>'birthdate','')::date,
     nullif(v_row->>'level',''),coalesce(v_row->>'teacherNotes','')
   );
   v_created:=v_created+1;
 END LOOP;
 v_result:=jsonb_build_object(
   'studentsCreated',v_created,'studentsSkipped',v_skipped,
   'familiesCreated',v_families,'skipped',v_skipped_rows,
   'receiptId',p_idempotency_key
 );
 UPDATE public.teacher_spreadsheet_import_receipts
 SET receipt=v_result WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_teacher_spreadsheet_commit(jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_spreadsheet_commit(jsonb,uuid) TO authenticated;
