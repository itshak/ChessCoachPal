-- MCP and website use one revision-checked, idempotent session editor.
-- A teacher may update title, time/duration, shared note and completed/cancelled
-- status. Frozen lesson participants are deliberately immutable here.
CREATE OR REPLACE FUNCTION public.ccp_teacher_session_patch(
  p_session_id uuid,
  p_changes jsonb,
  p_expected_updated_at timestamptz,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_hash text;
  v_saved public.agent_tool_receipts%ROWTYPE;
  v_session public.teaching_sessions%ROWTYPE;
  v_receipt jsonb;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_session_id IS NULL OR p_idempotency_key IS NULL OR
    p_expected_updated_at IS NULL OR p_changes IS NULL OR
    jsonb_typeof(p_changes)<>'object' OR p_changes='{}'::jsonb OR
    (p_changes - ARRAY['title','startsAt','durationMinutes','lessonNote','status'])<>'{}'::jsonb THEN
    RAISE EXCEPTION 'INVALID_SESSION_PATCH' USING ERRCODE='22023';
  END IF;
  IF (p_changes ? 'title' AND (
      jsonb_typeof(p_changes->'title')<>'string' OR
      char_length(btrim(p_changes->>'title')) NOT BETWEEN 1 AND 160))
    OR (p_changes ? 'lessonNote' AND (
      jsonb_typeof(p_changes->'lessonNote')<>'string' OR
      char_length(p_changes->>'lessonNote')>10000))
    OR (p_changes ? 'durationMinutes' AND (
      jsonb_typeof(p_changes->'durationMinutes')<>'number' OR
      (p_changes->>'durationMinutes') !~ '^[0-9]+$' OR
      (p_changes->>'durationMinutes')::integer NOT BETWEEN 15 AND 480))
    OR (p_changes ? 'status' AND (
      jsonb_typeof(p_changes->'status')<>'string' OR
      p_changes->>'status' NOT IN ('scheduled','completed','cancelled')))
    OR (p_changes ? 'startsAt' AND
      jsonb_typeof(p_changes->'startsAt')<>'string')
  THEN
    RAISE EXCEPTION 'INVALID_SESSION_PATCH' USING ERRCODE='22023';
  END IF;
  v_hash:=md5(jsonb_build_array('sessions.patch',p_session_id,p_changes,p_expected_updated_at)::text);
  INSERT INTO public.agent_tool_receipts(
    teacher_id,idempotency_key,operation,request_hash,receipt
  ) VALUES(v_teacher,p_idempotency_key,'sessions.patch',v_hash,'{}'::jsonb)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_saved FROM public.agent_tool_receipts
      WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
    IF NOT FOUND OR v_saved.operation<>'sessions.patch' OR v_saved.request_hash<>v_hash THEN
      RAISE EXCEPTION 'SESSION_REPLAY_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN v_saved.receipt;
  END IF;
  UPDATE public.teaching_sessions SET
    title=CASE WHEN p_changes ? 'title' THEN btrim(p_changes->>'title') ELSE title END,
    starts_at=CASE WHEN p_changes ? 'startsAt' THEN
      (p_changes->>'startsAt')::timestamptz ELSE starts_at END,
    duration_minutes=CASE WHEN p_changes ? 'durationMinutes' THEN
      (p_changes->>'durationMinutes')::integer ELSE duration_minutes END,
    lesson_note=CASE WHEN p_changes ? 'lessonNote' THEN
      p_changes->>'lessonNote' ELSE lesson_note END,
    status=CASE WHEN p_changes ? 'status' THEN
      p_changes->>'status' ELSE status END,
    updated_at=clock_timestamp()
  WHERE id=p_session_id AND teacher_id=v_teacher
    AND updated_at=p_expected_updated_at
  RETURNING * INTO v_session;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_REVISION_CONFLICT' USING ERRCODE='23505';
  END IF;
  v_receipt:=jsonb_build_object('sessionId',v_session.id,
    'revision',v_session.updated_at,'operation','sessions.patch',
    'idempotencyKey',p_idempotency_key);
  UPDATE public.agent_tool_receipts SET receipt=v_receipt
    WHERE teacher_id=v_teacher AND idempotency_key=p_idempotency_key;
  RETURN v_receipt;
END;
$$;

REVOKE ALL ON FUNCTION public.ccp_teacher_session_patch(
  uuid,jsonb,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_session_patch(
  uuid,jsonb,timestamptz,uuid) TO authenticated;
