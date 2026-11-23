-- All rows are synthetic. Run only on a seeded disposable database.
BEGIN;
CREATE TEMP TABLE sponsor_fixture AS SELECT
 '00000000-0000-0000-0000-000000000001'::uuid AS teacher,
 md5('sponsor-fixture-venue')::uuid AS venue,
 '10000000-0000-0000-0000-000000000001'::uuid AS one,
 '10000000-0000-0000-0000-000000000002'::uuid AS two,
 md5('sponsor-default-payer')::uuid AS family,
 md5('sponsor-explicit-payer')::uuid AS sponsor;
INSERT INTO public.workplaces(id,teacher_id,name,timezone,currency)
 SELECT venue,teacher,'Synthetic exact participant workplace','UTC','USD' FROM sponsor_fixture;
INSERT INTO public.workplace_enrollments(teacher_id,student_id,workplace_id,starts_on,source)
 SELECT f.teacher,student,f.venue,'2049-01-01','manual' FROM sponsor_fixture f
 CROSS JOIN LATERAL unnest(ARRAY[f.one,f.two]) student;
INSERT INTO public.billing_accounts(id,teacher_id,display_name,account_kind)
 SELECT account,f.teacher,'Synthetic exact participant payer '||account::text,'organization'
 FROM sponsor_fixture f CROSS JOIN LATERAL unnest(ARRAY[f.family,f.sponsor]) account;
INSERT INTO public.student_billing_assignments(teacher_id,student_id,workplace_id,billing_account_id,effective_from)
 SELECT f.teacher,student,f.venue,f.family,'2050-02-01' FROM sponsor_fixture f
 CROSS JOIN LATERAL unnest(ARRAY[f.one,f.two]) student;
INSERT INTO public.compensation_agreements(
 id,teacher_id,workplace_id,billing_account_id,agreement_role,model,rate_cents,currency,effective_from
) SELECT md5('sponsor-broad-default')::uuid,teacher,venue,family,
 'participant_charge','per_session',6000,'USD','2050-02-01' FROM sponsor_fixture;
INSERT INTO public.teaching_sessions(id,teacher_id,workplace_id,title,starts_at,duration_minutes,local_timezone,status,roster_mode)
 SELECT md5('sponsor-session:'||n)::uuid,f.teacher,f.venue,'Synthetic sponsorship '||n,
   timestamptz '2050-02-10 00:30+00'+make_interval(mins=>90*n),90,'UTC','completed','ad_hoc'
 FROM sponsor_fixture f CROSS JOIN generate_series(1,13) n;
INSERT INTO public.session_participants(session_id,teacher_id,student_id)
 SELECT md5('sponsor-session:'||n)::uuid,f.teacher,f.one FROM sponsor_fixture f
 CROSS JOIN generate_series(1,13) n
 UNION ALL SELECT md5('sponsor-session:1')::uuid,f.teacher,f.two FROM sponsor_fixture f;
INSERT INTO public.session_attendance(teacher_id,session_id,student_id,status,marked_at)
 SELECT sp.teacher_id,sp.session_id,sp.student_id,'present',now()
 FROM public.session_participants sp JOIN sponsor_fixture f ON f.teacher=sp.teacher_id
 WHERE sp.session_id IN (SELECT md5('sponsor-session:'||n)::uuid FROM generate_series(1,13) n);
GRANT SELECT ON sponsor_fixture TO authenticated;
DO $acl$
DECLARE sig text:='public.ccp_compensation_exact_sponsor_commit(uuid,uuid,uuid,uuid,text,bigint,text,date,uuid,bigint,uuid,boolean)';
BEGIN
 IF NOT has_function_privilege('authenticated',sig,'EXECUTE')
   OR has_function_privilege('anon',sig,'EXECUTE')
   OR has_function_privilege('service_role',sig,'EXECUTE')
   OR has_function_privilege('authenticated','public.ccp_exact_sponsor_write_boundary()','EXECUTE')
   OR has_function_privilege('authenticated','public.ccp_assert_no_automatic_sponsor_source(uuid,uuid,uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'SPONSOR_ACL_MISMATCH';
 END IF;
END;
$acl$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $test$
DECLARE
 f record;
 a uuid:=md5('sponsor-session:1')::uuid;
 b uuid:=md5('sponsor-session:2')::uuid;
 c uuid:=md5('sponsor-session:3')::uuid;
 d uuid:=md5('sponsor-session:4')::uuid;
 e uuid:=md5('sponsor-session:5')::uuid;
 broad uuid:=md5('sponsor-broad-default')::uuid;
 request_id uuid:=gen_random_uuid();
 archive_id uuid:=gen_random_uuid();
 post_id uuid:=gen_random_uuid();
 draft_id uuid:=gen_random_uuid();
 old_invoice_id uuid:=gen_random_uuid();
 old_credit_invoice uuid:=gen_random_uuid();
 credit_package_id uuid:=gen_random_uuid();
 invoice_revision timestamptz;
 selected jsonb;
 posted jsonb;
 archived jsonb;
 invoice_line jsonb;
 unrelated_line jsonb;
BEGIN
 SELECT * INTO f FROM sponsor_fixture;
 BEGIN
   INSERT INTO public.compensation_agreements(teacher_id,workplace_id,exact_session_id,student_id,
     billing_account_id,agreement_role,model,rate_cents,currency,effective_from,effective_to)
   VALUES(f.teacher,f.venue,a,f.one,f.sponsor,'participant_charge','per_session',9000,'USD','2050-02-10','2050-02-10');
   RAISE EXCEPTION 'RAW_SPONSOR_WRITE_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM<>'EXACT_SPONSOR_CONFIRMED_RPC_REQUIRED' THEN RAISE;END IF;
 END;
 selected:=public.ccp_compensation_exact_sponsor_commit(f.venue,a,f.one,f.sponsor,
  'per_session',9000,'USD','2050-02-10',NULL,NULL,request_id,true);
 IF NOT (selected @> jsonb_build_object('agreementId',request_id,'status','active','replayed',false)) THEN
   RAISE EXCEPTION 'SPONSOR_CREATE_RECEIPT_MISMATCH';
 END IF;
 BEGIN
   UPDATE public.compensation_agreements SET status='archived',revision=2 WHERE id=request_id;
   RAISE EXCEPTION 'RAW_SPONSOR_UPDATE_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM<>'EXACT_SPONSOR_CONFIRMED_RPC_REQUIRED' THEN RAISE;END IF;
 END;
 BEGIN
   PERFORM public.ccp_compensation_exact_sponsor_commit(f.venue,b,f.one,f.sponsor,
    'per_session',9000,'USD','2050-02-10',NULL,NULL,request_id,true);
   RAISE EXCEPTION 'SPONSOR_DIFFERENT_REQUEST_REPLAYED';
 EXCEPTION WHEN unique_violation THEN
   IF SQLERRM<>'EXACT_SPONSOR_REQUEST_CONFLICT' THEN RAISE;END IF;
 END;
 BEGIN
   PERFORM public.ccp_finance_post_obligation(broad,1,6000,a,f.one,
    '2050-02-10','2050-02-10',gen_random_uuid(),true);
   RAISE EXCEPTION 'DATED_DEFAULT_BYPASSED_ACTIVE_SPONSOR';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_SPONSOR_REVIEW_REQUIRED' THEN RAISE;END IF;
 END;
 BEGIN
   PERFORM public.ccp_finance_post_obligation(request_id,1,9000,b,f.one,
    '2050-02-10','2050-02-10',gen_random_uuid(),true);
   RAISE EXCEPTION 'SPONSOR_REROUTED_OTHER_SESSION';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_AGREEMENT_SESSION_MISMATCH' THEN RAISE;END IF;
 END;
 INSERT INTO public.invoices(id,teacher_id,billing_account_id,period_start,period_end,status,subtotal_cents,currency)
 SELECT x,f.teacher,f.family,'2050-02-10','2050-02-10','draft',0,'USD'
 FROM unnest(ARRAY[draft_id,old_invoice_id,old_credit_invoice]) x;
 SELECT updated_at INTO invoice_revision FROM public.invoices WHERE id=draft_id;
 UPDATE public.invoices SET status='sent' WHERE id=old_credit_invoice;
 INSERT INTO public.credit_packages(id,teacher_id,student_id,invoice_id,workplace_id,
   credits,duration_minutes,price_cents,starts_on)
 VALUES(credit_package_id,f.teacher,f.one,old_credit_invoice,f.venue,10,90,60000,'2050-02-01');
 BEGIN
  INSERT INTO public.credit_redemptions(teacher_id,session_id,student_id,package_id)
   VALUES(f.teacher,a,f.one,credit_package_id);
  RAISE EXCEPTION 'SPONSORED_OCCURRENCE_AUTOMATIC_CREDIT_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'EXACT_SPONSOR_REVIEW_REQUIRED' THEN RAISE; END IF;
 END;
 INSERT INTO public.credit_redemptions(teacher_id,session_id,student_id,package_id)
  VALUES(f.teacher,d,f.one,credit_package_id);
 BEGIN
  PERFORM public.ccp_compensation_exact_sponsor_commit(f.venue,d,f.one,f.sponsor,
   'per_session',9000,'USD','2050-02-10',NULL,NULL,gen_random_uuid(),true);
  RAISE EXCEPTION 'RETAINED_PREPAID_SPEND_REROUTED';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'EXACT_SPONSOR_RETAINED_BILLING_SOURCE' THEN RAISE; END IF;
 END;

 invoice_line:=jsonb_build_object('sessionId',a,'studentId',f.one,'kind','lesson',
  'description','Synthetic class','quantity',1,'unitCents',6000,'amountCents',6000);
 unrelated_line:=invoice_line||jsonb_build_object('sessionId',b);
 BEGIN
   INSERT INTO public.invoice_items(invoice_id,session_id,student_id,kind,description,quantity,unit_cents,amount_cents,sort_order)
    VALUES(draft_id,a,f.one,'lesson','Synthetic exact source',1,6000,6000,0);
   RAISE EXCEPTION 'RAW_INVOICE_WITH_SPONSOR_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_SPONSOR_REVIEW_REQUIRED' THEN RAISE;END IF;
 END;
 BEGIN
   PERFORM public.ccp_canonical_invoice_generation_commit('2050-02-10','2050-02-10',
     jsonb_build_array(jsonb_build_object('billingAccountId',f.family,
       'items',jsonb_build_array(unrelated_line,invoice_line))),'[]',gen_random_uuid());
   RAISE EXCEPTION 'MIXED_BATCH_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_SPONSOR_REVIEW_REQUIRED' THEN RAISE;END IF;
 END;
 BEGIN
   PERFORM public.ccp_canonical_invoice_regenerate_atomic(draft_id,jsonb_build_array(invoice_line),'[]',
    invoice_revision,gen_random_uuid());
   RAISE EXCEPTION 'REGEN_SPONSOR_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_SPONSOR_REVIEW_REQUIRED' THEN RAISE;END IF;
 END;
 BEGIN
   PERFORM public.ccp_invoice_draft_update(draft_id,NULL,jsonb_build_array(invoice_line-'kind'),
    invoice_revision,gen_random_uuid());
   RAISE EXCEPTION 'MANUAL_SPONSOR_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_SPONSOR_REVIEW_REQUIRED' THEN RAISE;END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.invoice_items WHERE session_id=b) OR
  (SELECT updated_at FROM public.invoices WHERE id=draft_id) IS DISTINCT FROM invoice_revision THEN
   RAISE EXCEPTION 'SPONSOR_INVOICE_FAILURE_NOT_ATOMIC';
 END IF;
 INSERT INTO public.invoice_items(invoice_id,session_id,student_id,kind,description,quantity,unit_cents,amount_cents,sort_order)
  VALUES(old_invoice_id,c,f.one,'lesson','Retained source invoice',1,6000,6000,0);
 BEGIN
   PERFORM public.ccp_compensation_exact_sponsor_commit(f.venue,c,f.one,f.sponsor,
     'per_session',9000,'USD','2050-02-10',NULL,NULL,gen_random_uuid(),true);
   RAISE EXCEPTION 'RETAINED_INVOICE_REROUTED';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_SPONSOR_RETAINED_BILLING_SOURCE' THEN RAISE;END IF;
 END;
 PERFORM public.ccp_finance_post_obligation(broad,1,6000,b,f.one,
   '2050-02-10','2050-02-10',gen_random_uuid(),true);
 PERFORM public.ccp_finance_post_obligation(broad,1,6000,a,f.two,
   '2050-02-10','2050-02-10',gen_random_uuid(),true);
 BEGIN
   PERFORM public.ccp_compensation_exact_sponsor_commit(f.venue,b,f.one,f.sponsor,
     'per_session',9000,'USD','2050-02-10',NULL,NULL,gen_random_uuid(),true);
   RAISE EXCEPTION 'RETAINED_NATIVE_DEBT_REROUTED';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_AGREEMENT_ALREADY_POSTED' THEN RAISE;END IF;
 END;
 posted:=public.ccp_finance_post_obligation(request_id,1,9000,a,f.one,
  '2050-02-10','2050-02-10',post_id,true);
 IF NOT (posted->'obligation' @> jsonb_build_object('billing_account_id',f.sponsor,
   'student_id',f.one,'amount_cents',9000,'agreement_snapshot',
   jsonb_build_object('scope','exact_participant_sponsor','exactSessionId',a,'exactStudentId',f.one))) THEN
   RAISE EXCEPTION 'POSTED_SPONSOR_SNAPSHOT_MISMATCH';
 END IF;
 archived:=public.ccp_compensation_exact_sponsor_commit(NULL,NULL,NULL,NULL,
   NULL,NULL,NULL,NULL,request_id,1,archive_id,true);
 IF NOT (archived @> '{"status":"archived","revision":2}') OR
    public.ccp_compensation_exact_sponsor_commit(f.venue,a,f.one,f.sponsor,
      'per_session',9000,'USD','2050-02-10',NULL,NULL,request_id,true) IS DISTINCT FROM selected||'{"replayed":true}'::jsonb OR
    public.ccp_finance_post_obligation(request_id,1,9000,a,f.one,
      '2050-02-10','2050-02-10',post_id,true) IS DISTINCT FROM posted||'{"replayed":true}'::jsonb THEN
   RAISE EXCEPTION 'SPONSOR_ARCHIVE_OR_REPLAY_CHANGED';
 END IF;
 BEGIN
   INSERT INTO public.invoice_items(invoice_id,session_id,student_id,kind,description,quantity,unit_cents,amount_cents,sort_order)
    VALUES(draft_id,a,f.one,'lesson','Would duplicate archived source',1,6000,6000,0);
   RAISE EXCEPTION 'ARCHIVED_SPONSOR_FELL_BACK_TO_INVOICE';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_SPONSOR_REVIEW_REQUIRED' THEN RAISE;END IF;
 END;
 selected:=public.ccp_compensation_exact_sponsor_commit(f.venue,e,f.one,f.sponsor,
  'per_session',9000,'USD','2050-02-10',NULL,NULL,gen_random_uuid(),true);
 PERFORM public.ccp_compensation_exact_sponsor_commit(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
  (selected->>'agreementId')::uuid,1,gen_random_uuid(),true);
 -- A deliberately reviewed fresh native default may proceed after unposted
 -- archival. The already reviewed legacy invoice source stays quarantined.
 PERFORM public.ccp_finance_post_obligation(broad,1,6000,e,f.one,
  '2050-02-10','2050-02-10',gen_random_uuid(),true);
 BEGIN
  INSERT INTO public.invoice_items(invoice_id,session_id,student_id,kind,description,quantity,unit_cents,amount_cents,sort_order)
   VALUES(draft_id,e,f.one,'lesson','Unposted archive would fall back',1,6000,6000,0);
  RAISE EXCEPTION 'UNPOSTED_ARCHIVE_CLEARED_QUARANTINE';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'EXACT_SPONSOR_REVIEW_REQUIRED' THEN RAISE; END IF;
 END;
 IF NOT EXISTS(SELECT 1 FROM public.session_participants WHERE session_id=a AND student_id=f.one
   AND sponsor_billing_review_required)
   OR EXISTS(SELECT 1 FROM public.session_participants WHERE (session_id=a AND student_id=f.two
      OR session_id=b) AND sponsor_billing_review_required) THEN
   RAISE EXCEPTION 'REVIEW_WITNESS_WRONG_SCOPE';
 END IF;
 BEGIN
   PERFORM public.ccp_teacher_backup_restore(jsonb_build_object('session_participants',
    jsonb_build_array(jsonb_build_object('teacher_id',f.teacher,'session_id',a,'student_id',f.one,
     'sponsor_billing_review_required',true))),NULL,repeat('a',64));
   RAISE EXCEPTION 'PORTABLE_RESTORE_MINTED_SPONSOR_WITNESS';
 EXCEPTION WHEN invalid_parameter_value THEN
   IF SQLERRM NOT LIKE 'EXACT_SPONSOR_OPERATOR_RESTORE_REQUIRED:%' THEN RAISE;END IF;
 END;
 IF (SELECT count(*) FROM public.financial_obligations WHERE session_id IN (a,b))<>3
   OR EXISTS(SELECT 1 FROM public.received_payments WHERE billing_account_id IN(f.family,f.sponsor)) THEN
   RAISE EXCEPTION 'SPONSOR_CHANGED_OTHER_DB_STATE';
 END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
 BEGIN
   PERFORM public.ccp_compensation_exact_sponsor_commit(f.venue,d,f.one,f.sponsor,
     'per_session',9000,'USD','2050-02-10',NULL,NULL,gen_random_uuid(),true);
   RAISE EXCEPTION 'FOREIGN_SPONSOR_APPROVED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$test$;
ROLLBACK;
