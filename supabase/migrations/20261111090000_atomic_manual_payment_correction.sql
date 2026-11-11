-- Correcting an accidental cash payment must atomically reopen a previously
-- settled invoice, with the same owner checks and Stripe refund protection
-- regardless of whether the call came from website or delegated MCP.
-- The existing AFTER DELETE payment trigger recalculates invoice status.
CREATE OR REPLACE FUNCTION public.ccp_manual_payment_remove(
  p_invoice_id uuid,p_payment_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_invoice public.invoices%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_status text;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_invoice FROM public.invoices
    WHERE id=p_invoice_id AND teacher_id=v_teacher FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF v_invoice.status='void' THEN
    RAISE EXCEPTION 'INVOICE_VOID' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_payment FROM public.payments
    WHERE id=p_payment_id AND invoice_id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='42501';
  END IF;
  IF v_payment.method<>'manual' THEN
    RAISE EXCEPTION 'STRIPE_REFUND_REQUIRED' USING ERRCODE='23514';
  END IF;
  DELETE FROM public.payments
    WHERE id=p_payment_id AND invoice_id=p_invoice_id;
  SELECT status INTO v_status FROM public.invoices
    WHERE id=p_invoice_id AND teacher_id=v_teacher;
  RETURN jsonb_build_object('ok',true,'status',v_status);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_manual_payment_remove(uuid,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_manual_payment_remove(uuid,uuid)
 TO authenticated;
