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
-- Model a historical hourly term succeeded by fixed monthly compensation
-- without manufacturing concurrent active workplace-wide contracts.
UPDATE public.compensation_agreements SET status='archived',revision=2
 WHERE id='ea000000-0000-4000-8000-000000000002';
-- Additional independent category at the exact leap-month edge.
INSERT INTO public.compensation_agreements(
 id,teacher_id,workplace_id,billing_account_id,agreement_role,model,rate_cents,currency,effective_from
) SELECT 'ea000000-0000-4000-8000-000000000003',teacher_id,venue,
 'ea000000-0000-4000-8000-000000000001','coach_earning','fixed_period',60000,'ILS','2048-02-01'
 FROM earnings_fixture;
INSERT INTO public.financial_obligations(
 teacher_id,workplace_id,billing_account_id,agreement_id,agreement_revision,agreement_snapshot,
 period_start,period_end,kind,amount_cents,currency,source_key,source_hash,approval_request_id
) SELECT f.teacher_id,f.venue,'ea000000-0000-4000-8000-000000000001',
 'ea000000-0000-4000-8000-000000000003',1,'{}','2048-02-01','2048-02-29',
 'period_compensation',60000,'ILS','synthetic-settlement-fixed',repeat('a',64),gen_random_uuid()
 FROM earnings_fixture f;
GRANT SELECT ON earnings_fixture TO authenticated;
DO $acl$
DECLARE sig text:='public.ccp_finance_period_end_actuals(uuid,date,text,uuid)';
BEGIN
 IF has_function_privilege('anon',sig,'EXECUTE')
   OR has_function_privilege('service_role',sig,'EXECUTE')
   OR NOT has_function_privilege('authenticated',sig,'EXECUTE')
   OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=sig::regprocedure AND NOT prosecdef AND provolatile='s')
 THEN RAISE EXCEPTION 'PERIOD_END_ACTUALS_EFFECTIVE_ACL_MISMATCH'; END IF;
END;
$acl$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $settlement$
DECLARE
 v_venue uuid:=(SELECT venue FROM earnings_fixture);
 v_payer uuid:='ea000000-0000-4000-8000-000000000001';
 v_obligation uuid:=md5('summary-obligation:32')::uuid;
 v_cash uuid;
 v_allocation uuid;
 v_result jsonb;
 v_old jsonb;
BEGIN
 v_cash:=(public.ccp_finance_record_payment(v_payer,'ILS',90000,now(),'bank_transfer',
   'synthetic confirmed receipt, not collected by app',gen_random_uuid())->'payment'->>'id')::uuid;
 v_allocation:=(public.ccp_finance_allocate_payment(v_cash,v_obligation,8000,gen_random_uuid())
   ->'allocation'->>'id')::uuid;
 PERFORM public.ccp_finance_reverse('allocation_reversal',v_allocation,2000,'Synthetic reversal',gen_random_uuid());
 PERFORM public.ccp_finance_reverse('obligation_correction',v_obligation,1000,'Synthetic correction',gen_random_uuid());
 v_result:=public.ccp_finance_period_end_actuals(v_venue,'2048-02-01','ILS',v_payer);
 IF NOT(v_result @> '{"monthStart":"2048-02-01","monthEnd":"2048-02-29","settlementBasis":"current"}')
   OR jsonb_array_length(v_result->'categories')<>3
   OR NOT(v_result->'categories'->0 @> '{"kind":"coach_earning","obligationCount":29,"grossPostedCents":522000,"correctionCents":1000,"netAppliedCents":6000,"outstandingCents":515000}')
   OR NOT(v_result->'categories'->1 @> '{"kind":"period_compensation","obligationCount":1,"grossPostedCents":60000,"netAppliedCents":0,"outstandingCents":60000}')
   OR NOT(v_result->'categories'->2 @> '{"kind":"participant_charge","obligationCount":0,"outstandingCents":0}')
 THEN RAISE EXCEPTION 'PERIOD_END_ACTUALS_INVALID %',v_result; END IF;
 v_old:=public.ccp_finance_earning_summary(v_venue,'2048-02-01','2048-02-29','ILS',v_payer);
 IF (v_old->'outstandingCents') IS DISTINCT FROM (v_result->'categories'->0->'outstandingCents')
 THEN RAISE EXCEPTION 'PERIOD_END_ACTUALS_EXISTING_EARNINGS_DIVERGED'; END IF;
 BEGIN
   PERFORM public.ccp_finance_period_end_actuals(v_venue,'2048-02-29','ILS');
   RAISE EXCEPTION 'PERIOD_END_ACCEPTED_PARTIAL_MONTH';
 EXCEPTION WHEN invalid_parameter_value THEN
   IF SQLERRM<>'INVALID_PERIOD_END_ACTUALS_SCOPE' THEN RAISE; END IF;
 END;
 BEGIN
   PERFORM public.ccp_finance_period_end_actuals(v_venue,'2048-02-01','ILS',gen_random_uuid());
   RAISE EXCEPTION 'PERIOD_END_ACCEPTED_UNKNOWN_PAYER';
 EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM<>'PERIOD_END_ACTUALS_SCOPE_NOT_OWNED' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
 BEGIN
   PERFORM public.ccp_finance_period_end_actuals(v_venue,'2048-02-01','ILS');
   RAISE EXCEPTION 'PERIOD_END_ACCEPTED_OTHER_TEACHER';
 EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM<>'PERIOD_END_ACTUALS_SCOPE_NOT_OWNED' THEN RAISE; END IF;
 END;
END;
$settlement$;
\if :{?persist_finance_fixture}
COMMIT;
\else
ROLLBACK;
\endif
SELECT 'Disposable monthly settlement category, tenant, balance and ACL proof passed.';
