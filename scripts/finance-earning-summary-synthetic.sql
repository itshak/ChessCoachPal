-- Disposable fresh or restored synthetic Supabase only. No real finance.
BEGIN;
CREATE TEMP TABLE earnings_fixture AS
SELECT id AS venue,teacher_id FROM public.workplaces
 WHERE teacher_id='00000000-0000-0000-0000-000000000001'
 ORDER BY created_at,id LIMIT 1;
INSERT INTO public.billing_accounts(id,teacher_id,display_name,account_kind)
SELECT 'ea000000-0000-4000-8000-000000000001',teacher_id,'Synthetic school','organization' FROM earnings_fixture;
INSERT INTO public.compensation_agreements(
 id,teacher_id,workplace_id,billing_account_id,agreement_role,model,rate_cents,currency,effective_from
) SELECT 'ea000000-0000-4000-8000-000000000002',teacher_id,venue,
 'ea000000-0000-4000-8000-000000000001','coach_earning','hourly',12000,'ILS','2048-01-01'
 FROM earnings_fixture;
INSERT INTO public.teaching_sessions(
 id,teacher_id,workplace_id,student_id,title,starts_at,duration_minutes,local_timezone,status
) SELECT md5('summary-session:'||n)::uuid,f.teacher_id,f.venue,
 '10000000-0000-0000-0000-000000000001','Summary fixture lesson',
 timestamptz '2048-01-01 10:00+00'+make_interval(days=>n-1),90,'UTC','completed'
 FROM earnings_fixture f CROSS JOIN generate_series(1,106) n;
-- Bulk fixture standings model frozen approved posts without invoking checkout.
INSERT INTO public.financial_obligations(
 id,teacher_id,workplace_id,billing_account_id,agreement_id,agreement_revision,agreement_snapshot,
 session_id,period_start,period_end,kind,amount_cents,currency,source_key,source_hash,approval_request_id
) SELECT md5('summary-obligation:'||n)::uuid,f.teacher_id,f.venue,
 'ea000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000002',1,'{}',
 md5('summary-session:'||n)::uuid,date '2048-01-01'+(n-1),date '2048-01-01'+(n-1),
 'coach_earning',18000,'ILS','synthetic-summary-post:'||n,repeat('a',64),gen_random_uuid()
 FROM earnings_fixture f CROSS JOIN generate_series(1,106) n;
GRANT SELECT ON earnings_fixture TO authenticated;
DO $acl$
DECLARE
 v_signature text:='public.ccp_finance_earning_summary(uuid,date,date,text,uuid)';
BEGIN
 IF has_function_privilege('anon',v_signature,'EXECUTE') OR
    has_function_privilege('service_role',v_signature,'EXECUTE') OR
    NOT has_function_privilege('authenticated',v_signature,'EXECUTE') THEN
   RAISE EXCEPTION 'EARNINGS_SUMMARY_ACL_MISMATCH';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_signature::regprocedure
   AND (prosecdef OR provolatile<>'s')) THEN
   RAISE EXCEPTION 'EARNINGS_SUMMARY_NOT_STABLE_INVOKER';
 END IF;
END;
$acl$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $test$
DECLARE
 v_venue uuid:=(SELECT venue FROM earnings_fixture);
 v_account uuid:='ea000000-0000-4000-8000-000000000001';
 v_obligation uuid:=md5('summary-obligation:1')::uuid;
 v_payment uuid;
 v_allocation uuid;
 v_result jsonb;
 v_before jsonb;
 v_after jsonb;
BEGIN
 v_result:=public.ccp_finance_earning_summary(v_venue,'2048-01-01','2048-01-04','ILS',v_account);
 IF NOT (v_result @> '{"obligationCount":4,"grossPostedCents":72000,"correctionCents":0,"correctedPostedCents":72000,"netAllocatedReceivedCents":0,"outstandingCents":72000}') THEN
   RAISE EXCEPTION 'EARNINGS_SUMMARY_INITIAL_MISMATCH %',v_result;
 END IF;
 v_result:=public.ccp_finance_earning_summary(v_venue,'2048-01-01','2048-04-15','ILS');
 IF NOT (v_result @> '{"obligationCount":106,"grossPostedCents":1908000}') THEN
   RAISE EXCEPTION 'EARNINGS_SUMMARY_TRUNCATED_POSTS %',v_result;
 END IF;
 v_result:=public.ccp_finance_earning_summary(v_venue,'2048-01-01','2048-01-04','USD');
 IF NOT (v_result @> '{"obligationCount":0,"outstandingCents":0}') THEN
   RAISE EXCEPTION 'EARNINGS_SUMMARY_CURRENCY_MISMATCH %',v_result;
 END IF;
 v_result:=public.ccp_finance_record_payment(v_account,'ILS',72000,now(),
   'bank_transfer','synthetic preconfirmed receipt',gen_random_uuid());
 v_payment:=(v_result->'payment'->>'id')::uuid;
 v_result:=public.ccp_finance_earning_summary(v_venue,'2048-01-01','2048-01-04','ILS',v_account);
 IF NOT (v_result @> '{"netAllocatedReceivedCents":0,"outstandingCents":72000}') THEN
   RAISE EXCEPTION 'EARNINGS_SUMMARY_COUNTED_UNALLOCATED_PAYMENT %',v_result;
 END IF;
 -- More than 100 allocations and reversals on the same obligation exercises
 -- fanout, and tests independent correction and reversal aggregation.
 FOR n IN 1..106 LOOP
   v_result:=public.ccp_finance_allocate_payment(v_payment,v_obligation,100,gen_random_uuid());
   v_allocation:=(v_result->'allocation'->>'id')::uuid;
   PERFORM public.ccp_finance_reverse('allocation_reversal',v_allocation,10,
      'Synthetic partial reversal',gen_random_uuid());
   PERFORM public.ccp_finance_reverse('obligation_correction',v_obligation,5,
      'Synthetic unpaid correction',gen_random_uuid());
 END LOOP;
 PERFORM public.ccp_finance_reverse('payment_refund',v_payment,5000,
   'Synthetic refund of unallocated balance',gen_random_uuid());
 SELECT jsonb_build_array(
   (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.financial_obligations o),
   (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.received_payments p),
   (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.payment_allocations a),
   (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.financial_reversals r)
 ) INTO v_before;
 v_result:=public.ccp_finance_earning_summary(v_venue,'2048-01-01','2048-01-04','ILS',v_account);
 IF NOT (v_result @> '{"obligationCount":4,"grossPostedCents":72000,"correctionCents":530,"correctedPostedCents":71470,"netAllocatedReceivedCents":9540,"outstandingCents":61930}') THEN
   RAISE EXCEPTION 'EARNINGS_SUMMARY_PARTIAL_MISMATCH %',v_result;
 END IF;
 SELECT jsonb_build_array(
   (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.financial_obligations o),
   (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.received_payments p),
   (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.payment_allocations a),
   (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.financial_reversals r)
 ) INTO v_after;
 IF v_before IS DISTINCT FROM v_after THEN RAISE EXCEPTION 'EARNINGS_SUMMARY_MUTATED_LEDGER'; END IF;
 BEGIN
   PERFORM public.ccp_finance_earning_summary(v_venue,'2048-01-01','2049-01-02','ILS');
   RAISE EXCEPTION 'EARNINGS_SUMMARY_ACCEPTED_EXCESSIVE_PERIOD';
 EXCEPTION WHEN invalid_parameter_value THEN
   IF SQLERRM<>'INVALID_EARNINGS_SUMMARY_SCOPE' THEN RAISE; END IF;
 END;
 BEGIN
   PERFORM public.ccp_finance_earning_summary(v_venue,'2048-01-01','2048-01-04','ILS',gen_random_uuid());
   RAISE EXCEPTION 'EARNINGS_SUMMARY_ACCEPTED_UNKNOWN_PAYER';
 EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM<>'EARNINGS_SUMMARY_SCOPE_NOT_OWNED' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
 BEGIN
   PERFORM public.ccp_finance_earning_summary(v_venue,'2048-01-01','2048-01-04','ILS');
   RAISE EXCEPTION 'EARNINGS_SUMMARY_ACCEPTED_OTHER_OWNER';
 EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM<>'EARNINGS_SUMMARY_SCOPE_NOT_OWNED' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN
   PERFORM public.ccp_finance_earning_summary(v_venue,'2048-01-01','2048-01-04','ILS');
   RAISE EXCEPTION 'EARNINGS_SUMMARY_ACCEPTED_HEADLESS';
 EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM<>'UNAUTHORIZED' THEN RAISE; END IF;
 END;
END;
$test$;
ROLLBACK;
