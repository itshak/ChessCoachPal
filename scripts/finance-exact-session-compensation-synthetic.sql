-- Disposable seeded Supabase only. Never run against a real teacher's data.
BEGIN;
CREATE TEMP TABLE compensation_exact_fixture AS
SELECT teacher_id, id AS venue FROM public.workplaces
WHERE teacher_id='00000000-0000-0000-0000-000000000001'
ORDER BY created_at,id LIMIT 1;
INSERT INTO public.billing_accounts(id,teacher_id,display_name,account_kind)
SELECT md5('exact-compensation-payer')::uuid,teacher_id,'Synthetic exact-session payer','organization'
FROM compensation_exact_fixture;
INSERT INTO public.teaching_sessions(
 id,teacher_id,workplace_id,student_id,title,starts_at,duration_minutes,local_timezone,status
) SELECT md5('exact-compensation-session:'||n)::uuid,
 f.teacher_id,f.venue,'10000000-0000-0000-0000-000000000001',
 'Synthetic exact scope '||n,timestamptz '2052-02-10 08:00:00+00'+make_interval(hours=>2*n),
 90,'UTC',CASE WHEN n=4 THEN 'scheduled' ELSE 'completed' END
 FROM compensation_exact_fixture f CROSS JOIN generate_series(1,7) n;
INSERT INTO public.session_attendance(teacher_id,session_id,student_id,status,marked_at)
 SELECT sp.teacher_id,sp.session_id,sp.student_id,'present',now()
 FROM public.session_participants sp JOIN compensation_exact_fixture f ON f.teacher_id=sp.teacher_id
 WHERE sp.session_id IN (SELECT md5('exact-compensation-session:'||n)::uuid
   FROM generate_series(1,7) n WHERE n<>4);
INSERT INTO public.compensation_agreements(
 id,teacher_id,workplace_id,billing_account_id,agreement_role,model,rate_cents,currency,effective_from
) SELECT md5('exact-compensation-broad')::uuid,teacher_id,venue,
 md5('exact-compensation-payer')::uuid,'coach_earning','hourly',12000,
 (SELECT w.currency FROM public.workplaces w WHERE w.id=f.venue),'2052-02-01'
 FROM compensation_exact_fixture f;
GRANT SELECT ON compensation_exact_fixture TO authenticated;
DO $acl$
DECLARE v_fn text:='public.ccp_compensation_exact_session_guard()';
BEGIN
 IF has_function_privilege('anon',v_fn,'EXECUTE') OR
    has_function_privilege('authenticated',v_fn,'EXECUTE') OR
    has_function_privilege('service_role',v_fn,'EXECUTE') THEN
   RAISE EXCEPTION 'EXACT_AGREEMENT_TRIGGER_ACL_MISMATCH';
 END IF;
END;
$acl$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $test$
DECLARE
 v_teacher uuid:=auth.uid();
 v_venue uuid:=(SELECT venue FROM compensation_exact_fixture);
 v_currency text:=(SELECT currency FROM public.workplaces WHERE id=v_venue);
 v_changed_currency text:=CASE WHEN v_currency='ILS' THEN 'USD' ELSE 'ILS' END;
 v_account uuid:=md5('exact-compensation-payer')::uuid;
 v_broad uuid:=md5('exact-compensation-broad')::uuid;
 v_exact uuid:=md5('exact-compensation-override')::uuid;
 v_target uuid:=md5('exact-compensation-session:1')::uuid;
 v_other uuid:=md5('exact-compensation-session:2')::uuid;
 v_plain_request uuid:=gen_random_uuid();
 v_exact_request uuid:=gen_random_uuid();
 v_original jsonb;
 v_post jsonb;
BEGIN
 v_original:=public.ccp_finance_post_obligation(v_broad,1,18000,v_other,NULL,
  '2052-02-10','2052-02-10',v_plain_request,true);
 IF v_original->'obligation'->'agreement_snapshot' ? 'scope' THEN
   RAISE EXCEPTION 'LEGACY_SNAPSHOT_SHAPE_CHANGED';
 END IF;
 INSERT INTO public.compensation_agreements(
  id,teacher_id,workplace_id,exact_session_id,billing_account_id,agreement_role,model,
  rate_cents,currency,effective_from,effective_to
 ) VALUES (v_exact,v_teacher,v_venue,v_target,v_account,'coach_earning','hourly',
  14000,v_currency,'2052-02-10','2052-02-10');
 BEGIN
   INSERT INTO public.compensation_agreements(
    teacher_id,workplace_id,exact_session_id,billing_account_id,agreement_role,model,
    rate_cents,currency,effective_from,effective_to
   ) VALUES (v_teacher,v_venue,md5('exact-compensation-session:3')::uuid,v_account,
    'coach_earning','hourly',14000,v_changed_currency,'2052-02-10','2052-02-10');
   RAISE EXCEPTION 'WRONG_CREATION_CURRENCY_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_AGREEMENT_SCOPE_UNAVAILABLE' THEN RAISE; END IF;
 END;
 BEGIN
   INSERT INTO public.compensation_agreements(
    teacher_id,workplace_id,exact_session_id,billing_account_id,agreement_role,model,
    rate_cents,currency,effective_from,effective_to
   ) VALUES (v_teacher,v_venue,v_target,v_account,'coach_earning','hourly',
    15000,v_currency,'2052-02-10','2052-02-10');
   RAISE EXCEPTION 'DUPLICATE_ACTIVE_EXACT_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
   UPDATE public.compensation_agreements SET exact_session_id=NULL WHERE id=v_exact;
   RAISE EXCEPTION 'EXACT_SCOPE_DETACH_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_AGREEMENT_SCOPE_IMMUTABLE' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE public.compensation_agreements SET exact_session_id=v_target WHERE id=v_broad;
   RAISE EXCEPTION 'LEGACY_SCOPE_REASSIGNMENT_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_AGREEMENT_SCOPE_IMMUTABLE' THEN RAISE; END IF;
 END;
 BEGIN
   INSERT INTO public.compensation_agreements(
    teacher_id,workplace_id,exact_session_id,billing_account_id,agreement_role,model,
    rate_cents,currency,effective_from,effective_to
   ) VALUES (v_teacher,v_venue,md5('exact-compensation-session:4')::uuid,v_account,
    'coach_earning','hourly',14000,v_currency,'2052-02-10','2052-02-10');
   RAISE EXCEPTION 'SCHEDULED_EXACT_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM<>'EXACT_AGREEMENT_SCOPE_UNAVAILABLE' THEN RAISE; END IF;
 END;
 BEGIN
   INSERT INTO public.compensation_agreements(
    teacher_id,workplace_id,exact_session_id,billing_account_id,agreement_role,model,
    rate_cents,currency,effective_from,effective_to
   ) VALUES (v_teacher,v_venue,v_other,v_account,'coach_earning','hourly',
    14000,v_currency,'2052-02-10','2052-02-10');
   RAISE EXCEPTION 'EXACT_OVERRIDES_EXISTING_POST';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_AGREEMENT_ALREADY_POSTED' THEN RAISE; END IF;
 END;
 BEGIN
   PERFORM public.ccp_finance_post_obligation(v_broad,1,18000,v_target,NULL,
    '2052-02-10','2052-02-10',gen_random_uuid(),true);
   RAISE EXCEPTION 'BROAD_BYPASSED_EXACT';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_AGREEMENT_REVIEW_REQUIRED' THEN RAISE; END IF;
 END;
 BEGIN
   PERFORM public.ccp_finance_post_obligation(v_exact,1,21000,v_other,NULL,
    '2052-02-10','2052-02-10',gen_random_uuid(),true);
   RAISE EXCEPTION 'EXACT_ACCEPTED_WRONG_SESSION';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_AGREEMENT_SESSION_MISMATCH' THEN RAISE; END IF;
 END;
 -- The venue's new default is irrelevant to a rate-only revision of an
 -- existing exact agreement: its accepted currency stays pinned.
 UPDATE public.workplaces SET currency=v_changed_currency WHERE id=v_venue AND teacher_id=v_teacher;
 BEGIN
   UPDATE public.compensation_agreements SET currency=v_changed_currency,revision=2 WHERE id=v_exact;
   RAISE EXCEPTION 'EXACT_CURRENCY_REWRITE_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'EXACT_AGREEMENT_SCOPE_IMMUTABLE' THEN RAISE; END IF;
 END;
 UPDATE public.compensation_agreements SET rate_cents=15000,revision=2 WHERE id=v_exact;
 BEGIN
   PERFORM public.ccp_finance_post_obligation(v_exact,1,21000,v_target,NULL,
    '2052-02-10','2052-02-10',gen_random_uuid(),true);
   RAISE EXCEPTION 'EXACT_STALE_REVISION_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'STALE_AGREEMENT_REVISION' THEN RAISE; END IF;
 END;
 v_post:=public.ccp_finance_post_obligation(v_exact,2,22500,v_target,NULL,
  '2052-02-10','2052-02-10',v_exact_request,true);
 IF NOT (v_post @> jsonb_build_object('replayed',false,'obligation',
  jsonb_build_object('amount_cents',22500,'currency',v_currency,'agreement_snapshot',
   jsonb_build_object('scope','exact_session','exactSessionId',v_target,'revision',2)))) THEN
   RAISE EXCEPTION 'EXACT_SNAPSHOT_MISMATCH %',v_post;
 END IF;
 UPDATE public.compensation_agreements SET status='archived',revision=3 WHERE id=v_exact;
 IF public.ccp_finance_post_obligation(v_exact,2,22500,v_target,NULL,
  '2052-02-10','2052-02-10',v_exact_request,true) IS DISTINCT FROM
  v_post||'{"replayed":true}'::jsonb THEN
   RAISE EXCEPTION 'EXACT_REPLAY_CHANGED_AFTER_ARCHIVE';
 END IF;
 IF public.ccp_finance_post_obligation(v_broad,1,18000,v_other,NULL,
  '2052-02-10','2052-02-10',v_plain_request,true) IS DISTINCT FROM
  v_original||'{"replayed":true}'::jsonb THEN
   RAISE EXCEPTION 'LEGACY_REPLAY_CHANGED';
 END IF;
 IF (SELECT count(*) FROM public.financial_obligations WHERE teacher_id=v_teacher
  AND session_id IN(v_target,v_other))<>2 OR
  EXISTS(SELECT 1 FROM public.received_payments WHERE billing_account_id=v_account) THEN
   RAISE EXCEPTION 'EXACT_CHANGED_OTHER_FINANCE';
 END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
 BEGIN
   INSERT INTO public.compensation_agreements(
    teacher_id,workplace_id,exact_session_id,billing_account_id,agreement_role,model,
    rate_cents,currency,effective_from,effective_to
   ) VALUES (v_teacher,v_venue,md5('exact-compensation-session:3')::uuid,v_account,
    'coach_earning','hourly',14000,v_currency,'2052-02-10','2052-02-10');
   RAISE EXCEPTION 'FOREIGN_EXACT_INSERT_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 UPDATE public.compensation_agreements SET rate_cents=99999,revision=4 WHERE id=v_exact;
 IF FOUND THEN RAISE EXCEPTION 'FOREIGN_EXACT_UPDATE_ACCEPTED'; END IF;
END;
$test$;
ROLLBACK;
