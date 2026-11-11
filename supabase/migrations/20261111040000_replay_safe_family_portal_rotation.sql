-- Shared website/MCP family portal rotation with a durable replay key.
-- A delayed network retry must not rotate the already-new link a second time.
-- The secret stays browser-only; MCP adapters discard portal_token.
ALTER TABLE public.guardians
 ADD COLUMN IF NOT EXISTS portal_rotation_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS ccp_guardians_owner_portal_rotation_request
 ON public.guardians(teacher_id,portal_rotation_request_id)
 WHERE portal_rotation_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ccp_guardian_rotate_portal_token(
  p_guardian_id uuid, p_request_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_guardian public.guardians%ROWTYPE;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_guardian FROM public.guardians
   WHERE id=p_guardian_id AND teacher_id=v_teacher FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NOT NULL
     AND v_guardian.portal_rotation_request_id=p_request_id THEN
    RETURN jsonb_build_object('id',v_guardian.id,
     'portal_token',v_guardian.portal_token,'replayed',true);
  END IF;
  IF p_request_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.guardians
     WHERE teacher_id=v_teacher AND portal_rotation_request_id=p_request_id
       AND id<>p_guardian_id
  ) THEN
    RAISE EXCEPTION 'PORTAL_ROTATION_REQUEST_CONFLICT' USING ERRCODE='23505';
  END IF;
  UPDATE public.guardians SET
    portal_token=encode(extensions.gen_random_bytes(24),'hex'),
    portal_rotation_request_id=p_request_id
    WHERE id=p_guardian_id AND teacher_id=v_teacher
    RETURNING * INTO v_guardian;
  RETURN jsonb_build_object('id',v_guardian.id,
    'portal_token',v_guardian.portal_token,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_guardian_rotate_portal_token(uuid,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_guardian_rotate_portal_token(uuid,uuid)
 TO authenticated;
