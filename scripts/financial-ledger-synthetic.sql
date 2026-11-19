-- This fixture runs *only* on a local disposable Supabase clean baseline.
-- Draft financial tables expose no authenticated write API. The synthetic
-- superuser exercises underlying invariant triggers, then rolls EVERYTHING
-- back, ensuring no receipt, invoice or paid status is fabricated.
BEGIN;
DO $fixture$
DECLARE
  t uuid:='00000000-0000-0000-0000-000000000001';
  school uuid;
  payer uuid:='fa000000-0000-4000-8000-000000000011';
  foreign_payer uuid:='fa000000-0000-4000-8000-000000000012';
  agreement uuid:='fa000000-0000-4000-8000-000000000013';
  earned uuid:='fa000000-0000-4000-8000-000000000014';
  earned_2 uuid:='fa000000-0000-4000-8000-000000000015';
  received uuid:='fa000000-0000-4000-8000-000000000016';
  bigger_received uuid:='fa000000-0000-4000-8000-000000000017';
  other_received uuid:='fa000000-0000-4000-8000-000000000018';
  allocations_count integer;
BEGIN
  SELECT id INTO school FROM public.workplaces WHERE teacher_id=t ORDER BY id LIMIT 1;
  IF school IS NULL THEN RAISE EXCEPTION 'Synthetic coach has no workplace'; END IF;
  INSERT INTO public.billing_accounts(id,teacher_id,display_name,account_kind)
  VALUES(payer,t,'Synthetic school payer','organization'),
    (foreign_payer,t,'Synthetic unrelated payer','organization');
  INSERT INTO public.compensation_agreements(id,teacher_id,workplace_id,
    billing_account_id,agreement_role,model,rate_cents,currency,effective_from)
  VALUES(agreement,t,school,payer,'coach_earning','hourly',12000,'USD','2026-01-01');
  INSERT INTO public.teaching_sessions(id,teacher_id,workplace_id,
    student_id,title,starts_at,duration_minutes,status)
  VALUES('fa000000-0000-4000-8000-000000000031',t,school,
   '10000000-0000-0000-0000-000000000001',
   'Synthetic second coaching occurrence','2026-11-02T10:00:00Z',90,'completed');
  INSERT INTO public.session_attendance(teacher_id,session_id,student_id,
    status,marked_at,updated_at)
  VALUES(t,'fa000000-0000-4000-8000-000000000031',
    '10000000-0000-0000-0000-000000000001','present',now(),now());
  INSERT INTO public.financial_obligations(id,teacher_id,workplace_id,
    billing_account_id,agreement_id,agreement_revision,agreement_snapshot,
    session_id,period_start,period_end,kind,amount_cents,currency,source_key,
    source_hash,approval_request_id)
  VALUES(earned,t,school,payer,agreement,1,
    '{"model":"hourly","rateCents":12000}'::jsonb,
    '70000000-0000-0000-0000-000000000001',
    '2026-11-01','2026-11-01','coach_earning',18000,'USD',
    'synthetic-session-earning-one',repeat('a',64),
    'fa000000-0000-4000-8000-000000000021'),
  (earned_2,t,school,payer,agreement,1,
    '{"model":"hourly","rateCents":12000}'::jsonb,
    'fa000000-0000-4000-8000-000000000031',
    '2026-11-02','2026-11-02','coach_earning',12000,'USD',
    'synthetic-session-earning-two',repeat('b',64),
    'fa000000-0000-4000-8000-000000000022');
  BEGIN
    UPDATE public.compensation_agreements SET rate_cents=12500
      WHERE id=agreement;
    RAISE EXCEPTION 'RETROACTIVE_RATE_UPDATE_NOT_ENFORCED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%POSTED_COMPENSATION_HISTORY_IMMUTABLE%'
      THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.compensation_agreements SET effective_to='2026-10-31'
      WHERE id=agreement;
    RAISE EXCEPTION 'POSTED_PERIOD_TRUNCATION_NOT_ENFORCED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%POSTED_COMPENSATION_HISTORY_IMMUTABLE%'
      THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.financial_obligations(id,teacher_id,workplace_id,
      billing_account_id,agreement_id,agreement_revision,agreement_snapshot,
      session_id,period_start,period_end,kind,amount_cents,currency,
      source_key,source_hash,approval_request_id)
    VALUES('fa000000-0000-4000-8000-000000000034',t,school,
      payer,agreement,1,'{}'::jsonb,
      '70000000-0000-0000-0000-000000000001',
      '2026-11-01','2026-11-01','coach_earning',18000,'USD',
      'different-key-same-session',repeat('f',64),
      'fa000000-0000-4000-8000-000000000035');
    RAISE EXCEPTION 'ONE_COACH_EARNING_PER_SESSION_NOT_ENFORCED';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE '%financial_obligations_one_coach_occurrence%'
      THEN RAISE; END IF;
  END;
  INSERT INTO public.received_payments(id,teacher_id,billing_account_id,
    currency,amount_cents,received_at,method,provenance,request_id,request_hash)
  VALUES(received,t,payer,'USD',6000,'2026-11-19T10:00:00Z',
    'bank_transfer','teacher_confirmed',
    'fa000000-0000-4000-8000-000000000023',repeat('c',64)),
   (bigger_received,t,payer,'USD',20000,'2026-11-19T11:00:00Z',
    'bank_transfer','teacher_confirmed',
    'fa000000-0000-4000-8000-000000000024',repeat('d',64)),
   (other_received,t,foreign_payer,'USD',10000,'2026-11-19T12:00:00Z',
    'bank_transfer','teacher_confirmed',
    'fa000000-0000-4000-8000-000000000025',repeat('e',64));
  -- Partial payment is not a full settlement: one 18k earning, 6k paid,
  -- 12k still open, despite a completed calendar occurrence.
  INSERT INTO public.payment_allocations(teacher_id,received_payment_id,
    obligation_id,amount_cents,request_id)
  VALUES(t,received,earned,6000,'fa000000-0000-4000-8000-000000000026');
  IF (SELECT amount_cents-coalesce((SELECT sum(p.amount_cents)
    FROM public.payment_allocations p WHERE p.obligation_id=earned),0)
    FROM public.financial_obligations WHERE id=earned)<>12000 THEN
    RAISE EXCEPTION 'Partial settlement inaccurately marked received';
  END IF;
  BEGIN
    INSERT INTO public.payment_allocations(teacher_id,received_payment_id,
      obligation_id,amount_cents,request_id)
    VALUES(t,received,earned_2,1,'fa000000-0000-4000-8000-000000000027');
    RAISE EXCEPTION 'SOURCE_PAYMENT_LIMIT_NOT_ENFORCED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%PAYMENT_OVERALLOCATION%'
      THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.payment_allocations(teacher_id,received_payment_id,
      obligation_id,amount_cents,request_id)
    VALUES(t,bigger_received,earned,12001,'fa000000-0000-4000-8000-000000000028');
    RAISE EXCEPTION 'OBLIGATION_LIMIT_NOT_ENFORCED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%PAYMENT_OVERALLOCATION%'
      THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.payment_allocations(teacher_id,received_payment_id,
      obligation_id,amount_cents,request_id)
    VALUES(t,other_received,earned,1000,'fa000000-0000-4000-8000-000000000029');
    RAISE EXCEPTION 'CROSS_PAYER_ALLOCATION_NOT_ENFORCED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%PAYMENT_COUNTERPARTY_OR_CURRENCY_MISMATCH%'
      THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.financial_obligations SET amount_cents=1 WHERE id=earned;
    RAISE EXCEPTION 'APPEND_ONLY_OBLIGATION_BYPASSED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%IMMUTABLE_FINANCIAL_LEDGER%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.received_payments WHERE id=received;
    RAISE EXCEPTION 'APPEND_ONLY_RECEIPT_BYPASSED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%IMMUTABLE_FINANCIAL_LEDGER%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.payment_allocations SET amount_cents=1
      WHERE received_payment_id=received;
    RAISE EXCEPTION 'APPEND_ONLY_ALLOCATION_BYPASSED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%IMMUTABLE_FINANCIAL_LEDGER%' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO allocations_count FROM public.payment_allocations
  WHERE teacher_id=t;
  IF allocations_count<>1 THEN RAISE EXCEPTION 'Rejected allocations leaked rows';END IF;
END
$fixture$;
ROLLBACK;
DO $empty$
BEGIN
 IF EXISTS(SELECT 1 FROM public.received_payments) OR
    EXISTS(SELECT 1 FROM public.financial_obligations) OR
    EXISTS(SELECT 1 FROM public.payment_allocations) THEN
  RAISE EXCEPTION 'Synthetic financial fixture escaped its rollback';
 END IF;
END
$empty$;
