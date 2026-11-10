-- Invoice-period commits and draft regeneration must not leave orphaned
-- invoice lines, partially consumed lesson credits or half-created families
-- when any write, validation or concurrent request fails. Both the website
-- and delegated MCP call these authenticated, transaction-scoped functions.

CREATE OR REPLACE FUNCTION public.ccp_invoice_generation_commit(
  p_period_start date,p_period_end date,p_drafts jsonb,p_redemptions jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_currency text;
  v_draft jsonb;v_line jsonb;v_credit jsonb;
  v_invoice uuid;v_lesson uuid;v_guardian uuid;v_package uuid;
  v_kind text;v_description text;v_qty integer;v_unit integer;v_amount integer;
  v_subtotal bigint;v_sort integer;
  v_created jsonb:='[]'::jsonb;v_count integer:=0;v_credits integer:=0;
BEGIN
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL
    OR p_period_end<p_period_start OR p_period_end-p_period_start>367
    OR jsonb_typeof(p_drafts)<>'array'
    OR jsonb_typeof(p_redemptions)<>'array'
    OR jsonb_array_length(p_drafts)>200
    OR jsonb_array_length(p_redemptions)>2000
  THEN RAISE EXCEPTION 'INVALID_BILLING_BATCH' USING ERRCODE='22023';END IF;
  -- One teacher-period commit in flight at a time (including independent
  -- browser and AI-agent requests). Lesson and package triggers separately
  -- protect against other concurrent billing/credit operations.
  PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
  SELECT currency INTO v_currency FROM public.studio_policies
    WHERE teacher_id=v_teacher;
  IF v_currency IS NULL THEN
    RAISE EXCEPTION 'STUDIO_POLICY_NOT_FOUND' USING ERRCODE='42501';
  END IF;

  FOR v_credit IN SELECT value FROM jsonb_array_elements(p_redemptions) LOOP
    v_lesson:=(v_credit->>'lessonId')::uuid;
    v_package:=(v_credit->>'packageId')::uuid;
    IF v_lesson IS NULL OR v_package IS NULL THEN
      RAISE EXCEPTION 'INVALID_CREDIT_ALLOCATION' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.credit_redemptions(teacher_id,lesson_id,package_id)
      VALUES(v_teacher,v_lesson,v_package);
    v_credits:=v_credits+1;
  END LOOP;

  FOR v_draft IN SELECT value FROM jsonb_array_elements(p_drafts) LOOP
    v_guardian:=(v_draft->>'guardianId')::uuid;
    IF v_guardian IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.guardians WHERE id=v_guardian AND teacher_id=v_teacher
    ) OR jsonb_typeof(v_draft->'items')<>'array'
      OR jsonb_array_length(v_draft->'items')=0
      OR jsonb_array_length(v_draft->'items')>2000
    THEN RAISE EXCEPTION 'INVALID_BILLING_FAMILY' USING ERRCODE='22023';END IF;
    INSERT INTO public.invoices(teacher_id,guardian_id,period_start,period_end,
      status,subtotal_cents,currency)
      VALUES(v_teacher,v_guardian,p_period_start,p_period_end,'draft',0,v_currency)
      RETURNING id INTO v_invoice;
    v_subtotal:=0;v_sort:=0;
    FOR v_line IN SELECT value FROM jsonb_array_elements(v_draft->'items') LOOP
      v_lesson:=(v_line->>'lessonId')::uuid;
      v_kind:=v_line->>'kind';
      v_description:=nullif(btrim(v_line->>'description'),'');
      v_qty:=(v_line->>'quantity')::integer;
      v_unit:=(v_line->>'unitCents')::integer;
      v_amount:=(v_line->>'amountCents')::integer;
      IF v_lesson IS NULL OR v_kind NOT IN ('lesson','travel') OR
        v_description IS NULL OR length(v_description)>500 OR
        v_qty NOT BETWEEN 1 AND 10000 OR v_unit NOT BETWEEN 0 AND 100000000 OR
        v_amount NOT BETWEEN 0 AND 100000000 OR
        v_qty::bigint*v_unit<>v_amount
      THEN RAISE EXCEPTION 'INVALID_BILLING_LINE' USING ERRCODE='22023';END IF;
      PERFORM 1 FROM public.lessons l JOIN public.students s
        ON s.id=l.student_id AND s.teacher_id=v_teacher
        WHERE l.id=v_lesson AND l.teacher_id=v_teacher
          AND s.guardian_id=v_guardian
          AND l.lesson_date BETWEEN p_period_start AND p_period_end
        FOR NO KEY UPDATE OF l;
      IF NOT FOUND THEN RAISE EXCEPTION 'LESSON_OR_FAMILY_NOT_FOUND'
        USING ERRCODE='42501';END IF;
      IF EXISTS(SELECT 1 FROM public.invoice_items ii
        JOIN public.invoices i ON i.id=ii.invoice_id
        WHERE ii.lesson_id=v_lesson AND ii.kind=v_kind
          AND i.teacher_id=v_teacher AND i.status<>'void') THEN
        RAISE EXCEPTION 'INVOICE_ALREADY_COMMITTED' USING ERRCODE='23505';
      END IF;
      INSERT INTO public.invoice_items(invoice_id,lesson_id,kind,description,
        quantity,unit_cents,amount_cents,sort_order)
        VALUES(v_invoice,v_lesson,v_kind,v_description,v_qty,v_unit,v_amount,v_sort);
      v_subtotal:=v_subtotal+v_amount;
      v_sort:=v_sort+1;
    END LOOP;
    IF v_subtotal>2147483647 THEN
      RAISE EXCEPTION 'INVOICE_SUBTOTAL_OVERFLOW' USING ERRCODE='22003';
    END IF;
    UPDATE public.invoices SET subtotal_cents=v_subtotal::integer WHERE id=v_invoice;
    v_created:=v_created||jsonb_build_array(v_invoice);
    v_count:=v_count+1;
  END LOOP;
  RETURN jsonb_build_object('created',v_created,'count',v_count,'creditsUsed',v_credits);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_invoice_generation_commit(
 date,date,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_invoice_generation_commit(
 date,date,jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_invoice_regenerate_atomic(
 p_invoice_id uuid,p_items jsonb,p_redemptions jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_teacher uuid:=auth.uid();
  v_invoice public.invoices%ROWTYPE;
  v_line jsonb;v_credit jsonb;v_lesson uuid;v_package uuid;
  v_kind text;v_description text;v_qty integer;v_unit integer;v_amount integer;
  v_subtotal bigint:=0;v_sort integer:=0;
BEGIN
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';END IF;
  IF jsonb_typeof(p_items)<>'array' OR jsonb_typeof(p_redemptions)<>'array'
    OR jsonb_array_length(p_items)>2000 OR jsonb_array_length(p_redemptions)>2000
  THEN RAISE EXCEPTION 'INVALID_REGENERATION_INPUT' USING ERRCODE='22023';END IF;
  PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
  SELECT * INTO v_invoice FROM public.invoices
    WHERE id=p_invoice_id AND teacher_id=v_teacher FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';END IF;
  IF v_invoice.status<>'draft' OR EXISTS(
    SELECT 1 FROM public.credit_packages WHERE invoice_id=p_invoice_id
  ) OR EXISTS(SELECT 1 FROM public.payments WHERE invoice_id=p_invoice_id)
  THEN RAISE EXCEPTION 'INVOICE_REGENERATION_BLOCKED' USING ERRCODE='23514';END IF;
  DELETE FROM public.invoice_items WHERE invoice_id=p_invoice_id;
  FOR v_credit IN SELECT value FROM jsonb_array_elements(p_redemptions) LOOP
    v_lesson:=(v_credit->>'lessonId')::uuid;
    v_package:=(v_credit->>'packageId')::uuid;
    IF v_lesson IS NULL OR v_package IS NULL THEN
      RAISE EXCEPTION 'INVALID_CREDIT_ALLOCATION' USING ERRCODE='22023';END IF;
    INSERT INTO public.credit_redemptions(teacher_id,lesson_id,package_id)
      VALUES(v_teacher,v_lesson,v_package);
  END LOOP;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_lesson:=(v_line->>'lessonId')::uuid;
    v_kind:=v_line->>'kind';
    v_description:=nullif(btrim(v_line->>'description'),'');
    v_qty:=(v_line->>'quantity')::integer;
    v_unit:=(v_line->>'unitCents')::integer;
    v_amount:=(v_line->>'amountCents')::integer;
    IF v_lesson IS NULL OR v_kind NOT IN ('lesson','travel') OR
      v_description IS NULL OR length(v_description)>500 OR
      v_qty NOT BETWEEN 1 AND 10000 OR v_unit NOT BETWEEN 0 AND 100000000
      OR v_amount NOT BETWEEN 0 AND 100000000 OR v_qty::bigint*v_unit<>v_amount
    THEN RAISE EXCEPTION 'INVALID_REGENERATION_LINE' USING ERRCODE='22023';END IF;
    PERFORM 1 FROM public.lessons l JOIN public.students s
      ON s.id=l.student_id AND s.teacher_id=v_teacher
      WHERE l.id=v_lesson AND l.teacher_id=v_teacher
        AND s.guardian_id=v_invoice.guardian_id
        AND l.lesson_date BETWEEN v_invoice.period_start AND v_invoice.period_end
      FOR NO KEY UPDATE OF l;
    IF NOT FOUND THEN RAISE EXCEPTION 'LESSON_OR_FAMILY_NOT_FOUND'
      USING ERRCODE='42501';END IF;
    IF EXISTS(SELECT 1 FROM public.invoice_items ii
      JOIN public.invoices i ON i.id=ii.invoice_id
      WHERE ii.lesson_id=v_lesson AND ii.kind=v_kind
        AND i.teacher_id=v_teacher AND i.status<>'void') THEN
      RAISE EXCEPTION 'INVOICE_ALREADY_COMMITTED' USING ERRCODE='23505';
    END IF;
    INSERT INTO public.invoice_items(invoice_id,lesson_id,kind,description,
      quantity,unit_cents,amount_cents,sort_order)
      VALUES(p_invoice_id,v_lesson,v_kind,v_description,v_qty,v_unit,v_amount,v_sort);
    v_subtotal:=v_subtotal+v_amount;v_sort:=v_sort+1;
  END LOOP;
  IF v_subtotal>2147483647 THEN
    RAISE EXCEPTION 'INVOICE_SUBTOTAL_OVERFLOW' USING ERRCODE='22003';END IF;
  UPDATE public.invoices SET subtotal_cents=v_subtotal::integer
    WHERE id=p_invoice_id;
  RETURN jsonb_build_object('ok',true,'itemCount',v_sort,
    'subtotalCents',v_subtotal::integer);
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_invoice_regenerate_atomic(
 uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_invoice_regenerate_atomic(
 uuid,jsonb,jsonb) TO authenticated;
