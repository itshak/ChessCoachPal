-- Disposable signed business-rule proof. No production records or payments.
BEGIN;
CREATE TEMP TABLE group_scope_fixture AS SELECT
 '00000000-0000-0000-0000-000000000001'::uuid teacher,
 '10000000-0000-0000-0000-000000000001'::uuid student,
 md5('gf-site')::uuid site,md5('gf-other-site')::uuid other_site,
 md5('gf-payer')::uuid payer,md5('gf-group')::uuid grp,md5('gf-peer')::uuid peer,
 md5('gf-other-group')::uuid other_grp,md5('gf-workplace')::uuid broad,
 md5('gf-other-workplace')::uuid other_broad,md5('gf-scope')::uuid group_terms,
 date '2059-12-01' AS anchor_day;
INSERT INTO public.workplaces(id,teacher_id,name,timezone,currency)
 SELECT site,teacher,'Synthetic group precedence','Asia/Jerusalem','USD' FROM group_scope_fixture
 UNION ALL SELECT other_site,teacher,'Other synthetic venue','Asia/Jerusalem','USD' FROM group_scope_fixture;
INSERT INTO public.workplace_enrollments(teacher_id,student_id,workplace_id,starts_on,source)
 SELECT teacher,student,site,date '2020-01-01','manual' FROM group_scope_fixture
 UNION ALL SELECT teacher,student,other_site,date '2020-01-01','manual' FROM group_scope_fixture;
INSERT INTO public.class_groups(id,teacher_id,workplace_id,name)
 SELECT grp,teacher,site,'Matching group' FROM group_scope_fixture
 UNION ALL SELECT peer,teacher,site,'Different group' FROM group_scope_fixture
 UNION ALL SELECT other_grp,teacher,other_site,'Different venue group' FROM group_scope_fixture;
INSERT INTO public.group_enrollments(teacher_id,workplace_id,group_id,student_id)
 SELECT teacher,site,grp,student FROM group_scope_fixture
 UNION ALL SELECT teacher,site,peer,student FROM group_scope_fixture
 UNION ALL SELECT teacher,other_site,other_grp,student FROM group_scope_fixture;
INSERT INTO public.billing_accounts(id,teacher_id,display_name,account_kind)
 SELECT payer,teacher,'Synthetic payer','organization' FROM group_scope_fixture;
INSERT INTO public.compensation_agreements(id,teacher_id,workplace_id,group_id,billing_account_id,agreement_role,
 model,rate_cents,currency,effective_from,effective_to)
 SELECT broad,teacher,site,NULL::uuid,payer,'coach_earning','per_session',10000,'USD',anchor_day-30,NULL::date FROM group_scope_fixture
 UNION ALL SELECT other_broad,teacher,other_site,NULL::uuid,payer,'coach_earning','per_session',10000,'USD',anchor_day-30,NULL::date FROM group_scope_fixture
 UNION ALL SELECT group_terms,teacher,site,grp,payer,'coach_earning','per_session',20000,'USD',anchor_day,anchor_day+1 FROM group_scope_fixture;

CREATE TEMP TABLE group_scope_lessons AS
 SELECT q.id, q.group_id,q.workplace_id,q.taught_on,q.lesson_time,q.marked FROM group_scope_fixture f
 CROSS JOIN LATERAL (VALUES
 ('opening',f.grp,f.site,f.anchor_day,time '00:15',true),
 ('inclusive-end',f.grp,f.site,f.anchor_day+1,time '10:00',true),
 ('day-before',f.grp,f.site,f.anchor_day-1,time '10:00',true),
 ('day-after',f.grp,f.site,f.anchor_day+2,time '10:00',true),
 ('other-group',f.peer,f.site,f.anchor_day,time '13:00',true),
 ('other-venue',f.other_grp,f.other_site,f.anchor_day,time '15:00',true),
 ('private',NULL::uuid,f.site,f.anchor_day,time '17:00',true),
 ('no-marks',f.grp,f.site,f.anchor_day,time '20:00',false)
 ) q(id,group_id,workplace_id,taught_on,lesson_time,marked);
INSERT INTO public.teaching_sessions(id,teacher_id,student_id,group_id,workplace_id,title,
 starts_at,duration_minutes,status,local_timezone)
 SELECT md5('gf-lesson-'||q.id)::uuid,f.teacher,CASE WHEN q.group_id IS NULL THEN f.student END,
  q.group_id,q.workplace_id,q.id,(q.taught_on+q.lesson_time) AT TIME ZONE 'Asia/Jerusalem',60,
  'completed','Asia/Jerusalem' FROM group_scope_fixture f CROSS JOIN group_scope_lessons q;
INSERT INTO public.session_attendance(teacher_id,session_id,student_id,status,marked_at)
 SELECT f.teacher,p.session_id,p.student_id,'present',clock_timestamp()
 FROM group_scope_fixture f CROSS JOIN group_scope_lessons q JOIN public.session_participants p
 ON p.session_id=md5('gf-lesson-'||q.id)::uuid WHERE q.marked;
GRANT SELECT ON group_scope_fixture,group_scope_lessons TO authenticated;
SELECT set_config('ccp.group_proof.expect_legacy',:'expect_legacy',true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $probe$
DECLARE f group_scope_fixture%ROWTYPE; key1 uuid:=md5('gf-key1')::uuid;
 at_opening uuid:=md5('gf-lesson-opening')::uuid; outcome jsonb; name text; target_day date;
BEGIN
 SELECT * INTO f FROM group_scope_fixture;
 IF current_setting('ccp.group_proof.expect_legacy')='true' THEN
  outcome:=public.ccp_finance_post_obligation(f.broad,1,10000,at_opening,NULL,f.anchor_day,f.anchor_day,key1,true);
  IF outcome->'obligation'->>'amount_cents'<>'10000' THEN RAISE EXCEPTION 'Unexpected predecessor result'; END IF;
  RAISE NOTICE 'Predecessor allowed a workplace 10000 posting despite active matching 20000 group term';
  RETURN;
 END IF;
 BEGIN
  PERFORM public.ccp_finance_post_obligation(f.broad,1,10000,at_opening,NULL,f.anchor_day,f.anchor_day,key1,true);
  RAISE EXCEPTION 'Workplace term masked active group term';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM<>'GROUP_AGREEMENT_REVIEW_REQUIRED' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.financial_obligations WHERE session_id=at_opening) THEN
  RAISE EXCEPTION 'Rejected write persisted'; END IF;
 outcome:=public.ccp_finance_post_obligation(f.group_terms,1,20000,at_opening,NULL,f.anchor_day,f.anchor_day,key1,true);
 IF outcome->'obligation'->>'amount_cents'<>'20000' THEN RAISE EXCEPTION 'Group amounts changed'; END IF;
 IF public.ccp_finance_post_obligation(f.group_terms,1,20000,at_opening,NULL,f.anchor_day,f.anchor_day,key1,true)
  IS DISTINCT FROM outcome||'{"replayed":true}'::jsonb THEN RAISE EXCEPTION 'Group receipt changed'; END IF;
 BEGIN
  PERFORM public.ccp_finance_post_obligation(f.broad,1,10000,md5('gf-lesson-inclusive-end')::uuid,
    NULL,f.anchor_day+1,f.anchor_day+1,gen_random_uuid(),true);
  RAISE EXCEPTION 'Inclusive end dropped';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'GROUP_AGREEMENT_REVIEW_REQUIRED' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ccp_finance_post_obligation(f.group_terms,1,20000,md5('gf-lesson-no-marks')::uuid,
    NULL,f.anchor_day,f.anchor_day,gen_random_uuid(),true);
  RAISE EXCEPTION 'Unconfirmed attendance posted';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'UNCONFIRMED_OR_NO_SHOW_ATTENDANCE' THEN RAISE; END IF;
 END;
 FOREACH name IN ARRAY ARRAY['day-before','day-after','other-group','other-venue','private'] LOOP
  SELECT taught_on INTO STRICT target_day FROM group_scope_lessons WHERE id=name;
  outcome:=public.ccp_finance_post_obligation(CASE WHEN name='other-venue' THEN f.other_broad ELSE f.broad END,
    1,10000,md5('gf-lesson-'||name)::uuid,NULL,target_day,target_day,gen_random_uuid(),true);
  IF outcome->'obligation'->>'amount_cents'<>'10000' THEN RAISE EXCEPTION 'Fallback changed for %',name; END IF;
 END LOOP;
 INSERT INTO public.compensation_agreements(id,teacher_id,workplace_id,exact_session_id,billing_account_id,
  agreement_role,model,rate_cents,currency,effective_from,effective_to)
 VALUES(md5('gf-exact')::uuid,f.teacher,f.site,md5('gf-lesson-inclusive-end')::uuid,f.payer,
  'coach_earning','per_session',30000,'USD',f.anchor_day+1,f.anchor_day+1);
 BEGIN
  PERFORM public.ccp_finance_post_obligation(f.group_terms,1,20000,md5('gf-lesson-inclusive-end')::uuid,
    NULL,f.anchor_day+1,f.anchor_day+1,gen_random_uuid(),true);
  RAISE EXCEPTION 'Group masked exact lesson terms';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'EXACT_AGREEMENT_REVIEW_REQUIRED' THEN RAISE; END IF;
 END;
 outcome:=public.ccp_finance_post_obligation(md5('gf-exact')::uuid,1,30000,md5('gf-lesson-inclusive-end')::uuid,
  NULL,f.anchor_day+1,f.anchor_day+1,gen_random_uuid(),true);
 IF outcome->'obligation'->>'amount_cents'<>'30000' THEN RAISE EXCEPTION 'Exact amount changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.received_payments WHERE billing_account_id=f.payer) THEN
  RAISE EXCEPTION 'Posting minted a payment'; END IF;
 RAISE NOTICE 'Group precedence positive and negative cases passed';
END;
$probe$;
ROLLBACK;
