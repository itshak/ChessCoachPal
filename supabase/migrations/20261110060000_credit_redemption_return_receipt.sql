-- Record an authenticated prepaid-credit return and its replay receipt in the
-- SAME PostgreSQL transaction. Concurrent website/MCP retries must not return
-- an error after the first legitimate delete or accidentally restore/consume
-- a credit again. A different teacher must not discover an ID through receipts.
CREATE TABLE public.ccp_credit_redemption_return_receipts (
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  redemption_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, redemption_id)
);
ALTER TABLE public.ccp_credit_redemption_return_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ccp_credit_redemption_return_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ccp_credit_redemption_return_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.ccp_credit_redemption_return(
  p_redemption_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_deleted uuid;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_redemption_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_REDEMPTION_ID' USING ERRCODE='22023';
  END IF;

  -- All returns for one teacher serialize, including cross-client retries.
  -- If the transaction rolls back, its delete AND receipt roll back together.
  PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
  END IF;

  DELETE FROM public.credit_redemptions
    WHERE id=p_redemption_id AND teacher_id=v_teacher
    RETURNING id INTO v_deleted;
  IF FOUND THEN
    INSERT INTO public.ccp_credit_redemption_return_receipts
      (teacher_id, redemption_id)
    VALUES (v_teacher, v_deleted);
    RETURN jsonb_build_object('ok',true,'replayed',false);
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.ccp_credit_redemption_return_receipts
    WHERE teacher_id=v_teacher AND redemption_id=p_redemption_id
  ) THEN
    RETURN jsonb_build_object('ok',true,'replayed',true);
  END IF;

  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_credit_redemption_return(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_credit_redemption_return(uuid) TO authenticated;
