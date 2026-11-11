-- Durable per-teacher event request receipts for browser ↔ delegated MCP replay.
-- The existing ccp_teacher_event_save transaction owns event/roster/RSVP;
-- this wrapper locks one request key BEFORE calling it and records its
-- result in the SAME PostgreSQL transaction. No external email is sent.
CREATE TABLE IF NOT EXISTS public.ccp_event_request_receipts(
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  mutation_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id,request_id)
);
ALTER TABLE public.ccp_event_request_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ccp_event_receipts_owner ON public.ccp_event_request_receipts;
CREATE POLICY ccp_event_receipts_owner ON public.ccp_event_request_receipts
  FOR ALL TO authenticated
  USING(teacher_id=auth.uid()) WITH CHECK(teacher_id=auth.uid());
REVOKE ALL ON public.ccp_event_request_receipts FROM PUBLIC,anon;
GRANT SELECT,INSERT ON public.ccp_event_request_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_teacher_event_save_replay(
  p_event_id uuid,p_fields jsonb,p_student_ids uuid[],
  p_repertoire jsonb,p_request_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_hash text;
  v_previous public.ccp_event_request_receipts%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL THEN
    RETURN public.ccp_teacher_event_save(
      p_event_id,p_fields,p_student_ids,p_repertoire);
  END IF;
  -- jsonb has canonical key ordering. Include all editable inputs and the
  -- target event ID so a key cannot be silently reused for another mutation.
  v_hash:=md5(jsonb_build_object(
    'eventId',p_event_id,'fields',p_fields,'studentIds',p_student_ids,
    'repertoire',p_repertoire)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_teacher::text||':event:'||p_request_id::text,0));
  SELECT * INTO v_previous FROM public.ccp_event_request_receipts
   WHERE teacher_id=v_teacher AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.mutation_hash<>v_hash THEN
      RAISE EXCEPTION 'EVENT_REQUEST_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN v_previous.response||jsonb_build_object('replayed',true);
  END IF;
  v_result:=public.ccp_teacher_event_save(
    p_event_id,p_fields,p_student_ids,p_repertoire);
  INSERT INTO public.ccp_event_request_receipts(
    teacher_id,request_id,mutation_hash,response
  ) VALUES(v_teacher,p_request_id,v_hash,v_result);
  RETURN v_result||jsonb_build_object('replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_teacher_event_save_replay(
 uuid,jsonb,uuid[],jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_event_save_replay(
 uuid,jsonb,uuid[],jsonb,uuid) TO authenticated;
