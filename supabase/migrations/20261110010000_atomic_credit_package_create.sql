-- A prepaid lesson package is one financial transaction: its invoice,
-- invoice line and package must either ALL exist or NONE exist. Serialized
-- request IDs prevent a retry from silently selling the same package twice.
-- Every caller (website and delegated MCP) uses the same owner-scoped RPC.
ALTER TABLE public.credit_packages ADD COLUMN IF NOT EXISTS request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS ccp_credit_packages_teacher_request
  ON public.credit_packages(teacher_id,request_id)
  WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ccp_credit_package_create(
  p_student_id uuid,
  p_credits integer,
  p_duration_minutes integer,
  p_price_cents integer,
  p_starts_on date,
  p_expires_on date DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_student public.students%ROWTYPE;
  v_policy public.studio_policies%ROWTYPE;
  v_existing public.credit_packages%ROWTYPE;
  v_invoice_id uuid;
  v_package_id uuid;
  v_today date;
  v_description text;
BEGIN
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;

  IF p_credits IS NULL OR p_credits NOT BETWEEN 1 AND 200 OR
     p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 5 AND 480 OR
     p_price_cents IS NULL OR p_price_cents < 0 OR
     p_starts_on IS NULL OR
     (p_expires_on IS NOT NULL AND p_expires_on < p_starts_on) THEN
    RAISE EXCEPTION 'INVALID_CREDIT_PACKAGE' USING ERRCODE='22023';
  END IF;

  -- With a request ID, concurrent retries serialize before inspecting the
  -- receipt, so a timeout/retry cannot create a second invoice.
  IF p_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      v_teacher::text || ':credit-package:' || p_request_id::text,0));
    SELECT * INTO v_existing FROM public.credit_packages
      WHERE teacher_id=v_teacher AND request_id=p_request_id;
    IF FOUND THEN
      IF v_existing.student_id IS DISTINCT FROM p_student_id OR
         v_existing.credits IS DISTINCT FROM p_credits OR
         v_existing.duration_minutes IS DISTINCT FROM p_duration_minutes OR
         v_existing.price_cents IS DISTINCT FROM p_price_cents OR
         v_existing.starts_on IS DISTINCT FROM p_starts_on OR
         v_existing.expires_on IS DISTINCT FROM p_expires_on THEN
        RAISE EXCEPTION 'CREDIT_REQUEST_CONFLICT' USING ERRCODE='23505';
      END IF;
      RETURN jsonb_build_object('packageId',v_existing.id,
        'invoiceId',v_existing.invoice_id,'replayed',true);
    END IF;
  END IF;

  SELECT * INTO v_student FROM public.students
    WHERE id=p_student_id AND teacher_id=v_teacher FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
  END IF;
  IF v_student.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'ARCHIVED_STUDENT' USING ERRCODE='23514';
  END IF;
  IF v_student.guardian_id IS NULL THEN
    RAISE EXCEPTION 'FAMILY_REQUIRED' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.guardians
    WHERE id=v_student.guardian_id AND teacher_id=v_teacher FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_policy FROM public.studio_policies
    WHERE teacher_id=v_teacher;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POLICY_NOT_FOUND' USING ERRCODE='42501';
  END IF;
  v_today := (now() AT TIME ZONE v_policy.timezone)::date;
  v_description := 'Prepaid ' || p_credits::text || ' × ' ||
    p_duration_minutes::text || '-min lesson' ||
    CASE WHEN p_credits=1 THEN '' ELSE 's' END || ' - ' || v_student.name;

  INSERT INTO public.invoices (
    teacher_id,guardian_id,period_start,period_end,status,
    subtotal_cents,currency
  ) VALUES (
    v_teacher,v_student.guardian_id,v_today,v_today,'draft',
    p_price_cents,v_policy.currency
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_items (
    invoice_id,lesson_id,kind,description,quantity,
    unit_cents,amount_cents,sort_order
  ) VALUES (
    v_invoice_id,NULL,'credit_package',v_description,1,
    p_price_cents,p_price_cents,0
  );

  INSERT INTO public.credit_packages (
    teacher_id,student_id,invoice_id,credits,duration_minutes,
    price_cents,starts_on,expires_on,request_id
  ) VALUES (
    v_teacher,p_student_id,v_invoice_id,p_credits,p_duration_minutes,
    p_price_cents,p_starts_on,p_expires_on,p_request_id
  ) RETURNING id INTO v_package_id;

  RETURN jsonb_build_object('packageId',v_package_id,
    'invoiceId',v_invoice_id,'replayed',false);
END;
$$;

REVOKE ALL ON FUNCTION public.ccp_credit_package_create(
  uuid,integer,integer,integer,date,date,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ccp_credit_package_create(
  uuid,integer,integer,integer,date,date,uuid) TO authenticated;
