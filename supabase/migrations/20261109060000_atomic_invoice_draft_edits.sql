-- Replace invoice draft notes and line items atomically in one owner-scoped
-- transaction. Never delete existing invoice items before all inputs are
-- validated, and rollback the entire write when any FK or trigger rejects.
ALTER TABLE public.invoices ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS ccp_invoice_revision ON public.invoices;
CREATE TRIGGER ccp_invoice_revision BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.ccp_touch_revision();

CREATE OR REPLACE FUNCTION public.ccp_invoice_draft_update(
 p_invoice_id uuid, p_notes text, p_items jsonb,
 p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_teacher uuid:=auth.uid();
 v_invoice public.invoices%ROWTYPE;
 v_count integer;v_line jsonb;v_prepared jsonb:='[]'::jsonb;
 v_kind text;v_lesson uuid;v_subtotal bigint:=0;v_number integer:=0;
 v_description text;v_quantity integer;v_unit integer;v_amount integer;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';END IF;
 IF p_notes IS NULL AND p_items IS NULL THEN
   RAISE EXCEPTION 'EMPTY_INVOICE_PATCH' USING ERRCODE='22023';
 END IF;
 IF p_notes IS NOT NULL AND length(p_notes)>2000 THEN
   RAISE EXCEPTION 'INVALID_INVOICE_NOTES' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_invoice FROM public.invoices
 WHERE id=p_invoice_id AND teacher_id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';END IF;
 IF v_invoice.status<>'draft' THEN
   RAISE EXCEPTION 'INVOICE_NOT_DRAFT' USING ERRCODE='23514';
 END IF;
 IF p_expected_updated_at IS NOT NULL AND
    v_invoice.updated_at<>p_expected_updated_at THEN
   RAISE EXCEPTION 'STALE_INVOICE_REVISION' USING ERRCODE='23505';
 END IF;
 IF p_items IS NOT NULL THEN
   IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)>100 THEN
     RAISE EXCEPTION 'INVALID_INVOICE_ITEMS' USING ERRCODE='22023';
   END IF;
   IF EXISTS(SELECT 1 FROM public.credit_packages
      WHERE teacher_id=v_teacher AND invoice_id=p_invoice_id) THEN
     RAISE EXCEPTION 'PREPAID_INVOICE_IMMUTABLE' USING ERRCODE='23514';
   END IF;
   FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
     v_description:=nullif(btrim(v_line->>'description'),'');
     IF jsonb_typeof(v_line)<>'object' OR v_description IS NULL
        OR length(v_description)>500 OR
        NOT (v_line ? 'quantity' AND v_line ? 'unitCents' AND v_line ? 'amountCents')
        OR coalesce(v_line->>'quantity','') !~ '^[0-9]+$'
        OR coalesce(v_line->>'unitCents','') !~ '^[0-9]+$'
        OR coalesce(v_line->>'amountCents','') !~ '^[0-9]+$' THEN
       RAISE EXCEPTION 'INVALID_INVOICE_LINE' USING ERRCODE='22023';
     END IF;
     v_quantity:=(v_line->>'quantity')::integer;
     v_unit:=(v_line->>'unitCents')::integer;
     v_amount:=(v_line->>'amountCents')::integer;
     IF v_quantity NOT BETWEEN 1 AND 10000
        OR v_unit NOT BETWEEN 0 AND 100000000
        OR v_amount NOT BETWEEN 0 AND 100000000 THEN
       RAISE EXCEPTION 'INVALID_INVOICE_LINE' USING ERRCODE='22023';
     END IF;
     v_lesson:=nullif(v_line->>'lessonId','')::uuid;
     IF v_lesson IS NOT NULL THEN
       PERFORM 1 FROM public.lessons WHERE id=v_lesson AND teacher_id=v_teacher;
       IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';END IF;
     END IF;
     v_kind:='lesson';
     IF nullif(v_line->>'id','') IS NOT NULL THEN
       SELECT kind INTO v_kind FROM public.invoice_items
       WHERE id=(v_line->>'id')::uuid AND invoice_id=p_invoice_id;
       v_kind:=coalesce(v_kind,'lesson');
     END IF;
     v_prepared:=v_prepared||jsonb_build_array(jsonb_build_object(
       'kind',v_kind,'lessonId',v_lesson,'description',v_description,
       'quantity',v_quantity,'unitCents',v_unit,'amountCents',v_amount,
       'sortOrder',v_number
     ));
     v_subtotal:=v_subtotal+v_amount;
     v_number:=v_number+1;
   END LOOP;
   IF v_subtotal>2147483647 THEN
     RAISE EXCEPTION 'INVOICE_SUBTOTAL_OVERFLOW' USING ERRCODE='22003';
   END IF;
   -- Once validation succeeds, all writes below run in this transaction.
   DELETE FROM public.invoice_items WHERE invoice_id=p_invoice_id;
   FOR v_line IN SELECT value FROM jsonb_array_elements(v_prepared) LOOP
     INSERT INTO public.invoice_items(
       invoice_id,lesson_id,kind,description,quantity,unit_cents,amount_cents,sort_order
     ) VALUES(
       p_invoice_id,(v_line->>'lessonId')::uuid,v_line->>'kind',v_line->>'description',
       (v_line->>'quantity')::integer,(v_line->>'unitCents')::integer,
       (v_line->>'amountCents')::integer,(v_line->>'sortOrder')::integer
     );
   END LOOP;
 END IF;
 UPDATE public.invoices
 SET subtotal_cents=CASE WHEN p_items IS NULL THEN subtotal_cents ELSE v_subtotal::integer END,
     notes=coalesce(p_notes,notes)
 WHERE id=p_invoice_id AND teacher_id=v_teacher AND status='draft'
 RETURNING * INTO v_invoice;
 RETURN jsonb_build_object('ok',true);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_invoice_draft_update(
 uuid,text,jsonb,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_invoice_draft_update(
 uuid,text,jsonb,timestamptz) TO authenticated;
