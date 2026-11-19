-- Local disposable Supabase only, always ROLLBACK. Exercise real authenticated
-- teacher SQL RPCs; never run against a live customer's data.
BEGIN;
INSERT INTO public.billing_accounts(
 id,teacher_id,display_name,account_kind
) VALUES (
 'fb000000-0000-4000-8000-000000000001',
 '00000000-0000-0000-0000-000000000001',
 'Synthetic native RPC payer','organization'
);
INSERT INTO public.compensation_agreements(
 id,teacher_id,workplace_id,billing_account_id,agreement_role,model,
 rate_cents,currency,effective_from
) SELECT 'fb000000-0000-4000-8000-000000000002',
 '00000000-0000-0000-0000-000000000001',id,
 'fb000000-0000-4000-8000-000000000001',
 'coach_earning','fixed_period',12000,'USD','2026-01-01'
 FROM public.workplaces WHERE teacher_id='00000000-0000-0000-0000-000000000001'
 ORDER BY id LIMIT 1;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000001',true);
DO $test$
DECLARE
 v_response jsonb;
 v_replayed jsonb;
 v_obligation uuid;
 v_payment uuid;
 v_allocation uuid;
 v_revision bigint;
BEGIN
 SELECT public.ccp_finance_post_obligation(
  'fb000000-0000-4000-8000-000000000002',1,12000,NULL,NULL,
  '2026-10-01','2026-10-31',
  'fb000000-0000-4000-8000-000000000003',true) INTO v_response;
 IF (v_response->>'replayed')::boolean OR
   (v_response->'obligation'->>'amount_cents')::bigint<>12000 OR
   v_response->'obligation'->>'kind'<>'period_compensation' THEN
   RAISE EXCEPTION 'NATIVE_OBLIGATION_POSTING_FAILED: %',v_response;
 END IF;
 v_obligation:=(v_response->'obligation'->>'id')::uuid;
 SELECT public.ccp_finance_post_obligation(
  'fb000000-0000-4000-8000-000000000002',1,12000,NULL,NULL,
  '2026-10-01','2026-10-31',
  'fb000000-0000-4000-8000-000000000003',true) INTO v_replayed;
 IF (v_replayed->>'replayed')::boolean IS DISTINCT FROM true OR
   v_replayed->'obligation'->>'id'<>v_obligation::text THEN
   RAISE EXCEPTION 'OBLIGATION_REPLAY_NOT_IDEMPOTENT';
 END IF;
 BEGIN
  PERFORM public.ccp_finance_post_obligation(
   'fb000000-0000-4000-8000-000000000002',1,14000,NULL,NULL,
   '2026-10-01','2026-10-31',
   'fb000000-0000-4000-8000-000000000003',true);
  RAISE EXCEPTION 'CONFLICTED_APPROVAL_REPLAY_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM NOT LIKE '%OBLIGATION_REQUEST_CONFLICT%' THEN RAISE; END IF;
 END;
 SELECT public.ccp_finance_record_payment(
  'fb000000-0000-4000-8000-000000000001','USD',6000,now(),
  'bank_transfer','synthetic-rpc-confirmed',
  'fb000000-0000-4000-8000-000000000004') INTO v_response;
 IF v_response->'payment'->>'provenance'<>'teacher_confirmed' THEN
   RAISE EXCEPTION 'MANUAL_RECEIPT_PROVENANCE_MISSING';
 END IF;
 v_payment:=(v_response->'payment'->>'id')::uuid;
 SELECT public.ccp_finance_record_payment(
  'fb000000-0000-4000-8000-000000000001','USD',6000,
  (v_response->'payment'->>'received_at')::timestamptz,
  'bank_transfer','synthetic-rpc-confirmed',
  'fb000000-0000-4000-8000-000000000004') INTO v_replayed;
 IF (v_replayed->>'replayed')::boolean IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'PAYMENT_REPLAY_NOT_IDEMPOTENT';
 END IF;
 SELECT public.ccp_finance_allocate_payment(v_payment,v_obligation,2500,
  'fb000000-0000-4000-8000-000000000005') INTO v_response;
 v_allocation:=(v_response->'allocation'->>'id')::uuid;
 SELECT public.ccp_finance_reverse('allocation_reversal',v_allocation,500,
  'Correct manual allocation','fb000000-0000-4000-8000-000000000006')
 INTO v_response;
 IF v_response->'reversal'->>'kind'<>'allocation_reversal' THEN
  RAISE EXCEPTION 'ALLOCATION_REVERSAL_FAILED';
 END IF;
 SELECT public.ccp_finance_reverse('payment_refund',v_payment,1000,
  'Confirmed offline refund','fb000000-0000-4000-8000-000000000007')
 INTO v_response;
 SELECT public.ccp_finance_reverse('obligation_correction',v_obligation,1000,
  'Correct approved amount','fb000000-0000-4000-8000-000000000008')
 INTO v_response;
 BEGIN
  PERFORM public.ccp_finance_reverse('payment_refund',v_payment,4000,
   'Must reject exceeding remaining free cash',
   'fb000000-0000-4000-8000-000000000009');
  RAISE EXCEPTION 'EXCESS_REFUND_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM NOT LIKE '%PAYMENT_REFUND_EXCEEDS_UNALLOCATED_BALANCE%' THEN
   RAISE; END IF;
 END;
 BEGIN
  INSERT INTO public.received_payments(teacher_id,billing_account_id,
   currency,amount_cents,received_at,method,provenance,request_id,request_hash)
  VALUES('00000000-0000-0000-0000-000000000001',
   'fb000000-0000-4000-8000-000000000001','USD',1000,now(),
   'cash','teacher_confirmed',gen_random_uuid(),repeat('a',64));
  RAISE EXCEPTION 'UNPRIVILEGED_DIRECT_INSERT_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 -- A different (nonexistent) teacher cannot import a receipt for this payer.
 PERFORM set_config('request.jwt.claim.sub',
   '00000000-0000-0000-0000-000000000099',true);
 BEGIN
  PERFORM public.ccp_finance_record_payment(
   'fb000000-0000-4000-8000-000000000001','USD',1000,now(),
   'cash','bad-tenant',
   'fb000000-0000-4000-8000-000000000010');
  RAISE EXCEPTION 'CROSS_TENANT_PAYMENT_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM NOT LIKE '%BILLING_ACCOUNT_NOT_ACTIVE_OR_OWNED%' THEN
    RAISE;END IF;
 END;
END
$test$;
RESET ROLE;
ROLLBACK;
DO $assert_empty$
BEGIN
 IF EXISTS(SELECT 1 FROM public.financial_reversals
  WHERE request_id='fb000000-0000-4000-8000-000000000008') THEN
   RAISE EXCEPTION 'RPC_FIXTURE_FAILED_TO_ROLL_BACK';
 END IF;
END
$assert_empty$;
