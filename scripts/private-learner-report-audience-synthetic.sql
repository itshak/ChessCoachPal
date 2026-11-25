-- Disposable extension of private-learner-report-seal-synthetic.sql.
-- The runner inserts this block immediately before that proof's final
-- persist-or-rollback decision, reusing its confirmed private artifact.
GRANT SELECT,INSERT ON seal_fixture TO service_role;
DO $audience$
DECLARE
 t uuid:='00000000-0000-0000-0000-000000000001';
 l uuid:='10000000-0000-0000-0000-000000000001';
 w uuid:=(SELECT (value#>>'{}')::uuid FROM seal_fixture WHERE key='workplace');
 pub uuid:=(SELECT (value->>'publicationId')::uuid FROM seal_fixture WHERE key='receipt');
 expected jsonb:=jsonb_build_object('reports',jsonb_build_array(
   (SELECT value->'candidate' FROM seal_fixture WHERE key='review')),'truncated',false);
 none jsonb:='{"reports":[],"truncated":false}';
 c uuid; shadow_c uuid; g uuid; shadow_g uuid; n uuid; fresh_g uuid; active_g uuid;
 other_l uuid; other_g uuid; i uuid:=gen_random_uuid();
 token text:=repeat('A',43); shadow text:=repeat('B',43); rotated text:=repeat('C',43);
 fresh text:=repeat('D',43); active_secret text:=repeat('E',43); review jsonb; receipt jsonb; withdrawn jsonb; now_at timestamptz:=statement_timestamp()-interval '1 second';
BEGIN
 IF has_function_privilege('anon','public.ccp_portal_sealed_learner_reports(text)','EXECUTE')
  OR has_function_privilege('authenticated','public.ccp_portal_sealed_learner_reports(text)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.ccp_portal_sealed_learner_reports(text)','EXECUTE')
  OR has_function_privilege('service_role','public.ccp_report_audience_approve(uuid,uuid,text,uuid,boolean)','EXECUTE')
  OR has_function_privilege('anon','public.ccp_report_audience_review(uuid,uuid)','EXECUTE')
  OR has_function_privilege('service_role','public.ccp_report_grant_current(public.portal_access_grants,timestamptz)','EXECUTE')
  OR has_table_privilege('service_role','public.report_publication_snapshots','SELECT')
  THEN RAISE EXCEPTION 'UNEXPECTED_REPORT_AUDIENCE_ACL'; END IF;
 INSERT INTO public.contacts(teacher_id,display_name) VALUES(t,'Selected synthetic contact') RETURNING id INTO c;
 INSERT INTO public.contacts(teacher_id,display_name) VALUES(t,'Different synthetic contact') RETURNING id INTO shadow_c;
 INSERT INTO public.student_contacts(teacher_id,student_id,contact_id,relationship_label,is_legal_guardian,may_receive_messages)
 VALUES(t,l,c,'Fixture relation',false,false),(t,l,shadow_c,'Fixture guardian',true,true);
 IF NOT EXISTS(SELECT 1 FROM public.workplace_enrollments e WHERE
     (e.teacher_id,e.student_id,e.workplace_id)=(t,l,w) AND e.cancelled_at IS NULL
     AND (e.starts_on IS NULL OR e.starts_on<=current_date)
     AND (e.ends_on IS NULL OR e.ends_on>=current_date)) THEN
  INSERT INTO public.workplace_enrollments(teacher_id,student_id,workplace_id,starts_on)
  VALUES(t,l,w,current_date-5);
 END IF;
 INSERT INTO public.portal_access_grants(teacher_id,student_id,workplace_id,contact_id,permissions,token_digest,issued_at,expires_at,revision)
 VALUES(t,l,w,c,ARRAY['shared_notes'],encode(sha256(convert_to(token,'UTF8')),'hex'),now_at,now_at+interval '2 days',2)
 RETURNING id INTO g;
 INSERT INTO public.portal_access_grants(teacher_id,student_id,workplace_id,contact_id,permissions,token_digest,issued_at,expires_at,revision)
 VALUES(t,l,w,shadow_c,ARRAY['shared_notes'],encode(sha256(convert_to(shadow,'UTF8')),'hex'),now_at,now_at+interval '2 days',2)
 RETURNING id INTO shadow_g;
 INSERT INTO public.portal_access_grants(teacher_id,student_id,workplace_id,contact_id,permissions,expires_at)
 VALUES(t,l,w,c,ARRAY['shared_notes'],now_at+interval '2 days') RETURNING id INTO n;
 SELECT id INTO STRICT other_l FROM public.students WHERE teacher_id=t AND id<>l ORDER BY id LIMIT 1;
 INSERT INTO public.student_contacts(teacher_id,student_id,contact_id,relationship_label)
 VALUES(t,other_l,c,'Fixture wrong learner');
 INSERT INTO public.portal_access_grants(teacher_id,student_id,workplace_id,contact_id,permissions,token_digest,issued_at,expires_at)
 VALUES(t,other_l,w,c,ARRAY['shared_notes'],encode(sha256(convert_to(repeat('F',43),'UTF8')),'hex'),now_at,now_at+interval '2 days')
 RETURNING id INTO other_g;
 SET LOCAL ROLE service_role;
 IF public.ccp_portal_sealed_learner_reports(token) IS DISTINCT FROM none
  OR public.ccp_portal_sealed_learner_reports('invalid') IS DISTINCT FROM none
  OR public.ccp_portal_sealed_learner_reports(NULL) IS DISTINCT FROM none THEN
  RAISE EXCEPTION 'PRIVATE_REPORT_GUEST_VISIBLE_BEFORE_APPROVAL';
 END IF;
 BEGIN
  INSERT INTO public.report_publication_audiences
   (teacher_id,publication_id,portal_grant_id,approved_by,request_id,approved_grant_binding,approval_review_digest)
  VALUES(t,pub,shadow_g,t,gen_random_uuid(),repeat('2',64),repeat('1',64));
  RAISE EXCEPTION 'DIRECT_SERVICE_REPORT_APPROVAL_BYPASS';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'REPORT_AUDIENCE_REVIEW_REQUIRED' THEN RAISE; END IF;
 END;
 RESET ROLE;
 -- A legacy-format trusted metadata row is not authorization for the shadow.
 INSERT INTO public.report_publication_audiences(teacher_id,publication_id,portal_grant_id,approved_by,request_id)
 VALUES(t,pub,shadow_g,t,gen_random_uuid());
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000088',true);
 BEGIN
  PERFORM public.ccp_report_audience_review(pub,g);
  RAISE EXCEPTION 'FOREIGN_REPORT_AUDIENCE_REVIEW_ACCEPTED';
 EXCEPTION WHEN no_data_found THEN
  IF SQLERRM<>'REPORT_AUDIENCE_NOT_FOUND' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claim.sub',t::text,true);
 BEGIN
  PERFORM public.ccp_report_audience_review(pub,n);
  RAISE EXCEPTION 'UNISSUED_REPORT_GRANT_REVIEW_ACCEPTED';
 EXCEPTION WHEN no_data_found THEN
  IF SQLERRM<>'REPORT_AUDIENCE_NOT_FOUND' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ccp_report_audience_review(pub,other_g);
  RAISE EXCEPTION 'WRONG_LEARNER_REPORT_GRANT_REVIEW_ACCEPTED';
 EXCEPTION WHEN no_data_found THEN
  IF SQLERRM<>'REPORT_AUDIENCE_NOT_FOUND' THEN RAISE; END IF;
 END;
 review:=public.ccp_report_audience_review(pub,g);
 IF (review->>'grantRevision') IS DISTINCT FROM '2' OR review ? 'token' OR review ? 'tokenDigest' OR review ? 'grantBinding'
  OR review->>'recipientName' IS DISTINCT FROM 'Selected synthetic contact' THEN
  RAISE EXCEPTION 'REPORT_AUDIENCE_REVIEW_SHAPE';
 END IF;
 BEGIN
  PERFORM public.ccp_report_audience_approve(pub,g,review->>'reviewDigest',i,false);
  RAISE EXCEPTION 'UNCONFIRMED_REPORT_AUDIENCE_WRITTEN';
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM<>'REPORT_AUDIENCE_APPROVAL_REQUIRED' THEN RAISE; END IF;
 END;
 RESET ROLE;
 UPDATE public.contacts SET display_name='Renamed synthetic contact' WHERE id=c;
 SET LOCAL ROLE authenticated;
 BEGIN
  PERFORM public.ccp_report_audience_approve(pub,g,review->>'reviewDigest',i,true);
  RAISE EXCEPTION 'STALE_REPORT_AUDIENCE_WRITTEN';
 EXCEPTION WHEN serialization_failure THEN
  IF SQLERRM<>'REPORT_AUDIENCE_REVIEW_STALE' THEN RAISE; END IF;
 END;
 review:=public.ccp_report_audience_review(pub,g);
 receipt:=public.ccp_report_audience_approve(pub,g,review->>'reviewDigest',i,true);
 IF public.ccp_report_audience_approve(pub,g,review->>'reviewDigest',i,true) IS DISTINCT FROM receipt THEN
  RAISE EXCEPTION 'EXACT_REPORT_AUDIENCE_REPLAY_CHANGED';
 END IF;
 BEGIN
  PERFORM public.ccp_report_audience_approve(pub,g,repeat('0',64),i,true);
  RAISE EXCEPTION 'CONFLICTING_REPORT_AUDIENCE_REPLAY_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM<>'REPORT_AUDIENCE_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
 END;
 RESET ROLE;
 SET LOCAL ROLE service_role;
 IF public.ccp_portal_sealed_learner_reports(token) IS DISTINCT FROM expected
  OR public.ccp_portal_sealed_learner_reports(shadow) IS DISTINCT FROM none THEN
  RAISE EXCEPTION 'GUEST_REPORT_ALLOWLIST_OR_AUDIENCE_WRONG';
 END IF;
 RESET ROLE;
 -- A real active relationship and teacher-calendar enrollment are independent.
 BEGIN
  UPDATE public.student_contacts SET active_to=current_date WHERE teacher_id=t AND student_id=l AND contact_id=c;
  SET LOCAL ROLE service_role;
  IF public.ccp_portal_sealed_learner_reports(token) IS DISTINCT FROM none THEN
   RAISE EXCEPTION 'ENDED_CONTACT_LINK_CAN_READ_REPORT';
  END IF;
  RAISE SQLSTATE 'P1212' USING MESSAGE='Rollback only the relationship test';
 EXCEPTION WHEN SQLSTATE 'P1212' THEN NULL;
 END;
 BEGIN
  UPDATE public.workplace_enrollments SET ends_on=current_date-2
  WHERE teacher_id=t AND student_id=l AND workplace_id=w AND cancelled_at IS NULL AND (starts_on IS NULL OR starts_on<=current_date-2);
  SET LOCAL ROLE service_role;
  IF public.ccp_portal_sealed_learner_reports(token) IS DISTINCT FROM none THEN
   RAISE EXCEPTION 'ENDED_ENROLLMENT_CAN_READ_REPORT';
  END IF;
  RAISE SQLSTATE 'P1212' USING MESSAGE='Rollback only the enrollment test';
 EXCEPTION WHEN SQLSTATE 'P1212' THEN NULL;
 END;
 BEGIN
  UPDATE public.report_publications SET revoked_at=clock_timestamp() WHERE id=pub;
  SET LOCAL ROLE service_role;
  IF public.ccp_portal_sealed_learner_reports(token) IS DISTINCT FROM none THEN
   RAISE EXCEPTION 'REVOKED_PUBLICATION_VISIBLE';
  END IF;
  RAISE SQLSTATE 'P1212' USING MESSAGE='Rollback only the publication test';
 EXCEPTION WHEN SQLSTATE 'P1212' THEN NULL;
 END;
 UPDATE public.contacts SET status='archived' WHERE id=c;
 SET LOCAL ROLE service_role;
 IF public.ccp_portal_sealed_learner_reports(token) IS DISTINCT FROM none THEN
   RAISE EXCEPTION 'ARCHIVED_CONTACT_CAN_READ_REPORT';
 END IF;
 RESET ROLE;
 UPDATE public.contacts SET status='active' WHERE id=c;
 -- Simulate a grant writer that replaces a bearer without bumping the revision.
 -- Neither that replacement nor a normal subsequent rotation may inherit access.
 BEGIN
  UPDATE public.portal_access_grants SET token_digest=encode(sha256(convert_to(rotated,'UTF8')),'hex') WHERE id=g;
  SET LOCAL ROLE service_role;
  IF public.ccp_portal_sealed_learner_reports(token) IS DISTINCT FROM none
   OR public.ccp_portal_sealed_learner_reports(rotated) IS DISTINCT FROM none THEN
   RAISE EXCEPTION 'UNCHANGED_REVISION_BEARER_REPLACEMENT_INHERITED_APPROVAL';
  END IF;
  RAISE SQLSTATE 'P1212' USING MESSAGE='Rollback only incomplete rotation';
 EXCEPTION WHEN SQLSTATE 'P1212' THEN NULL;
 END;
 UPDATE public.portal_access_grants SET revision=3,token_digest=encode(sha256(convert_to(rotated,'UTF8')),'hex')
 WHERE id=g;
 SET LOCAL ROLE service_role;
 IF public.ccp_portal_sealed_learner_reports(token) IS DISTINCT FROM none
  OR public.ccp_portal_sealed_learner_reports(rotated) IS DISTINCT FROM none THEN
   RAISE EXCEPTION 'REPORT_APPROVAL_SURVIVED_BEARER_ROTATION';
 END IF;
 RESET ROLE;
 INSERT INTO public.portal_access_grants(teacher_id,student_id,workplace_id,contact_id,permissions,token_digest,issued_at,expires_at,revision)
 VALUES(t,l,w,c,ARRAY['shared_notes'],encode(sha256(convert_to(fresh,'UTF8')),'hex'),now_at,now_at+interval '2 days',2)
 RETURNING id INTO fresh_g;
 SET LOCAL ROLE authenticated;
 review:=public.ccp_report_audience_review(pub,fresh_g);
 i:=gen_random_uuid();
 PERFORM public.ccp_report_audience_approve(pub,fresh_g,review->>'reviewDigest',i,true);
 RESET ROLE;
 SET LOCAL ROLE service_role;
 IF public.ccp_portal_sealed_learner_reports(fresh) IS DISTINCT FROM expected THEN
  RAISE EXCEPTION 'NEW_EXPLICIT_GRANT_DID_NOT_RESOLVE_REPORT';
 END IF;
 RESET ROLE;
 INSERT INTO public.portal_access_grants(teacher_id,student_id,workplace_id,contact_id,permissions,token_digest,issued_at,expires_at,revision)
 VALUES(t,l,w,c,ARRAY['shared_notes'],encode(sha256(convert_to(active_secret,'UTF8')),'hex'),now_at,now_at+interval '2 days',2)
 RETURNING id INTO active_g;
 SET LOCAL ROLE authenticated;
 PERFORM public.ccp_report_audience_approve(pub,active_g,
   public.ccp_report_audience_review(pub,active_g)->>'reviewDigest',gen_random_uuid(),true);
 RESET ROLE;
 UPDATE public.teacher_entitlement_grants SET revoked_at=clock_timestamp()
 WHERE teacher_id=t AND capability_key='reports.publish' AND revoked_at IS NULL;
 IF (public.ccp_effective_capability(t,'reports.publish',clock_timestamp())->>'enabled')::boolean IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'DOWNGRADE_FIXTURE_NOT_EFFECTIVE'; END IF;
 SET LOCAL ROLE authenticated;
 withdrawn:=public.ccp_report_audience_withdraw(pub,fresh_g,i,true);
 IF withdrawn->>'revokedAt' IS NULL
   OR public.ccp_report_audience_withdraw(pub,fresh_g,i,true) IS DISTINCT FROM withdrawn
   OR public.ccp_report_audience_approve(pub,fresh_g,review->>'reviewDigest',i,true) IS DISTINCT FROM withdrawn
   OR public.ccp_private_report_snapshot_get(pub)->'candidate' IS DISTINCT FROM expected->'reports'->0 THEN
  RAISE EXCEPTION 'WITHDRAWAL_OR_PRIVATE_READBACK_WRONG';
 END IF;
 RESET ROLE;
 SET LOCAL ROLE service_role;
 IF public.ccp_portal_sealed_learner_reports(fresh) IS DISTINCT FROM none
  OR public.ccp_portal_sealed_learner_reports(active_secret) IS DISTINCT FROM expected THEN
   RAISE EXCEPTION 'WITHDRAWN_AUDIENCE_CAN_READ_REPORT';
 END IF;
 RESET ROLE;
 IF (SELECT count(*) FROM public.report_publication_audiences WHERE publication_id=pub)<>4 THEN
  RAISE EXCEPTION 'REPORT_AUDIENCE_RETRY_OR_SCOPE_SHAPE_WRONG';
 END IF;
END;
$audience$;
SELECT 'Disposable exact report audience, privacy, rotation, binding, replay and withdrawal passed.';
