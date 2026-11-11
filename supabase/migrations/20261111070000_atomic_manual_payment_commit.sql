-- Browser and MCP manual-payment writes must never leave payment rows
-- without their paid invoice status, or overpay after a concurrent retry.
-- External Stripe links are retired in the service first; SQL verifies their
-- exact expected ID and clears it in the same financial transaction.
CREATE OR REPLACE FUNCTION public.ccp_manual_payment_commit(
  p_invoice_id uuid,p_amount_cents integer,p_note text,
  p_request_id uuid,p_expected_checkout_session text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_invoice public.invoices%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_payment_id uuid;
  v_paid bigint;
  v_balance bigint;
  v_amount integer;
  v_settled boolean;
  v_external text;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_note IS NULL OR length(p_note)>500 OR
    (p_amount_cents IS NOT NULL AND p_amount_cents<=0) OR
    (p_expected_checkout_session IS NOT NULL
       AND length(p_expected_checkout_session)>512) THEN
    RAISE EXCEPTION 'INVALID_MANUAL_PAYMENT' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_invoice FROM public.invoices
    WHERE id=p_invoice_id AND teacher_id=v_teacher FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
  v_external:=CASE WHEN p_request_id IS NOT NULL
    THEN 'mcp:'||p_request_id::text ELSE NULL END;
  IF v_external IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.payments
      WHERE invoice_id=p_invoice_id AND external_id=v_external;
    IF FOUND THEN
      IF v_existing.method<>'manual' OR v_existing.note<>p_note OR
        (p_amount_cents IS NOT NULL
         AND v_existing.amount_cents<>p_amount_cents) THEN
        RAISE EXCEPTION 'MANUAL_PAYMENT_REQUEST_CONFLICT' USING ERRCODE='23505';
      END IF;
      RETURN jsonb_build_object('ok',true,'replayed',true,
        'paymentId',v_existing.id,'amountCents',v_existing.amount_cents);
    END IF;
  END IF;
  IF v_invoice.status='void' THEN
    RAISE EXCEPTION 'INVOICE_VOID' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(SUM(amount_cents),0) INTO v_paid
    FROM public.payments WHERE invoice_id=p_invoice_id;
  v_balance:=v_invoice.subtotal_cents-v_paid;
  IF v_invoice.status='paid' AND v_balance<=0 THEN
    RETURN jsonb_build_object('ok',true,'alreadyPaid',true);
  END IF;
  IF v_balance<=0 THEN
    RAISE EXCEPTION 'INVOICE_NOTHING_OWED' USING ERRCODE='22023';
  END IF;
  IF v_invoice.status='draft' AND p_amount_cents IS NOT NULL THEN
    RAISE EXCEPTION 'PARTIAL_DRAFT_PAYMENT' USING ERRCODE='23514';
  END IF;
  IF v_invoice.stripe_payment_intent_id IS NOT NULL THEN
    RAISE EXCEPTION 'STRIPE_PAYMENT_RECONCILIATION_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF v_invoice.stripe_checkout_session_id IS NOT NULL
      OR v_invoice.stripe_checkout_url IS NOT NULL THEN
    IF v_invoice.stripe_checkout_session_id IS NULL OR
      p_expected_checkout_session IS DISTINCT FROM
      v_invoice.stripe_checkout_session_id THEN
      RAISE EXCEPTION 'CHECKOUT_RECONCILIATION_REQUIRED' USING ERRCODE='23514';
    END IF;
  ELSIF p_expected_checkout_session IS NOT NULL THEN
    RAISE EXCEPTION 'CHECKOUT_RECONCILIATION_REQUIRED' USING ERRCODE='23514';
  END IF;
  v_amount:=coalesce(p_amount_cents,v_balance::integer);
  IF v_amount>v_balance OR v_amount<=0 THEN
    RAISE EXCEPTION 'INVALID_MANUAL_PAYMENT_AMOUNT' USING ERRCODE='22023';
  END IF;
  IF p_expected_checkout_session IS NOT NULL THEN
    UPDATE public.invoices
      SET stripe_checkout_session_id=NULL,stripe_checkout_url=NULL
      WHERE id=p_invoice_id AND teacher_id=v_teacher;
  END IF;
  INSERT INTO public.payments(invoice_id,amount_cents,method,note,external_id)
    VALUES(p_invoice_id,v_amount,'manual',p_note,v_external)
    RETURNING id INTO v_payment_id;
  v_balance:=v_balance-v_amount;
  v_settled:=v_balance<=0;
  IF v_settled THEN
    UPDATE public.invoices SET status='paid',paid_at=now(),
       payment_method='manual'
      WHERE id=p_invoice_id AND teacher_id=v_teacher;
  END IF;
  RETURN jsonb_build_object('ok',true,'paid',v_settled,
    'balanceCents',v_balance,'paymentId',v_payment_id,
    'amountCents',v_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_manual_payment_commit(
 uuid,integer,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_manual_payment_commit(
 uuid,integer,text,uuid,text) TO authenticated;
