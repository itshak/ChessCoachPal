-- Per-teacher durable family + student-roster request receipts.
-- Prevents duplicate children/families when the teacher's browser and agent
-- retry the same confirmed mutation after a timeout. Sensitive portal links
-- are never copied into receipt rows; they remain on the guardian record.
CREATE TABLE IF NOT EXISTS public.ccp_guardian_request_receipts(
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  mutation_hash text NOT NULL,
  guardian_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(teacher_id,request_id)
);
ALTER TABLE public.ccp_guardian_request_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ccp_guardian_receipts_owner ON public.ccp_guardian_request_receipts;
CREATE POLICY ccp_guardian_receipts_owner ON public.ccp_guardian_request_receipts
  FOR ALL TO authenticated
  USING (teacher_id=auth.uid()) WITH CHECK(teacher_id=auth.uid());
REVOKE ALL ON public.ccp_guardian_request_receipts FROM PUBLIC,anon;
GRANT SELECT,INSERT ON public.ccp_guardian_request_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_guardian_save_replay(
  p_guardian_id uuid,p_fields jsonb,p_student_ids uuid[],
  p_replace_members boolean,p_new_students jsonb,p_request_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_hash text;
  v_previous public.ccp_guardian_request_receipts%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL THEN
    RETURN public.ccp_guardian_save(
      p_guardian_id,p_fields,p_student_ids,p_replace_members,p_new_students);
  END IF;
  v_hash:=md5(jsonb_build_object(
    'guardianId',p_guardian_id,'fields',p_fields,
    'studentIds',p_student_ids,'replaceMembers',p_replace_members,
    'newStudents',p_new_students)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_teacher::text||':guardian:'||p_request_id::text,0));
  SELECT * INTO v_previous FROM public.ccp_guardian_request_receipts
    WHERE teacher_id=v_teacher AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.mutation_hash<>v_hash THEN
      RAISE EXCEPTION 'GUARDIAN_REQUEST_CONFLICT' USING ERRCODE='23505';
    END IF;
    SELECT to_jsonb(g) INTO v_result FROM public.guardians g
      WHERE g.teacher_id=v_teacher AND g.id=v_previous.guardian_id;
    IF v_result IS NULL THEN
      RAISE EXCEPTION 'GUARDIAN_ALREADY_DELETED' USING ERRCODE='23514';
    END IF;
    RETURN v_result||jsonb_build_object('replayed',true);
  END IF;
  v_result:=public.ccp_guardian_save(
    p_guardian_id,p_fields,p_student_ids,p_replace_members,p_new_students);
  INSERT INTO public.ccp_guardian_request_receipts(
    teacher_id,request_id,mutation_hash,guardian_id
  ) VALUES(v_teacher,p_request_id,v_hash,(v_result->>'id')::uuid);
  RETURN v_result||jsonb_build_object('replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_guardian_save_replay(
 uuid,jsonb,uuid[],boolean,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_guardian_save_replay(
 uuid,jsonb,uuid[],boolean,jsonb,uuid) TO authenticated;
