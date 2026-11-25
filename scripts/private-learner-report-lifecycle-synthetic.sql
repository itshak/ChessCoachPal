-- Disposable extension of the sealed-report and audience fixture. Insert
-- after their assertions and before the seal fixture's final transaction exit.
DO $lifecycle$
DECLARE
 t uuid:='00000000-0000-0000-0000-000000000001';
 l uuid:='10000000-0000-0000-0000-000000000001';
 f uuid:='00000000-0000-0000-0000-000000000088';
 w uuid:=(SELECT (value#>>'{}')::uuid FROM seal_fixture WHERE key='workplace');
 first uuid:=(SELECT (value->>'publicationId')::uuid FROM seal_fixture WHERE key='receipt');
 d date:=current_date-2; k uuid:=gen_random_uuid(); k2 uuid:=gen_random_uuid();
 next_report uuid; third_report uuid; imported uuid; extra_grant uuid; prior_audience uuid;
 first_revision text; review jsonb; initial jsonb; receipt jsonb; revoked jsonb; new_review jsonb;
 guest_token text:=repeat('E',43); none jsonb:='{"reports":[],"truncated":false}'; old jsonb; next_candidate jsonb;
BEGIN
 IF has_function_privilege('anon','public.ccp_private_report_lifecycle_review(uuid,uuid)','EXECUTE')
  OR has_function_privilege('service_role','public.ccp_private_report_lifecycle_commit(uuid,uuid,text,uuid,boolean)','EXECUTE')
  OR has_function_privilege('authenticated','public.ccp_private_report_lifecycle_review_internal(uuid,uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.ccp_private_report_lifecycle_commit(uuid,uuid,text,uuid,boolean)','EXECUTE')
  THEN RAISE EXCEPTION 'UNEXPECTED_REPORT_LIFECYCLE_ACL'; END IF;
 SELECT s.candidate INTO STRICT old FROM public.report_publication_snapshots s WHERE publication_id=first;
 SELECT g.id INTO STRICT prior_audience FROM public.portal_access_grants g
  WHERE token_digest=encode(sha256(convert_to(guest_token,'UTF8')),'hex');
 INSERT INTO public.teacher_entitlement_grants(teacher_id,kind,capability_key,capability_kind,
  boolean_value,reason,request_id)
 VALUES(t,'capability_boost','reports.publish','boolean',true,'Synthetic retained report proof',gen_random_uuid());
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',t::text,true);
 new_review:=public.ccp_private_report_review(l,w,d,d,'en');
 next_report:=(public.ccp_private_report_seal(l,w,d,d,'en',
  new_review->>'reviewDigest',gen_random_uuid(),true)->>'publicationId')::uuid;
 new_review:=public.ccp_private_report_review(l,w,d,d,'ru');
 third_report:=(public.ccp_private_report_seal(l,w,d,d,'ru',
  new_review->>'reviewDigest',gen_random_uuid(),true)->>'publicationId')::uuid;
 next_candidate:=public.ccp_private_report_snapshot_get(next_report)->'candidate';
 RESET ROLE;
 SELECT revision::text INTO first_revision FROM public.report_publications WHERE id=first;
 INSERT INTO public.report_publications(
  teacher_id,student_id,workplace_id,snapshot_digest,snapshot_storage_ref,
  output_locale,approved_by,approved_at,request_id)
 VALUES(t,l,w,repeat('0',64),'legacy:object','en',t,clock_timestamp(),gen_random_uuid())
 RETURNING id INTO imported;

 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claim.sub',f::text,true);
 BEGIN
  PERFORM public.ccp_private_report_lifecycle_review(first,next_report);
  RAISE EXCEPTION 'FOREIGN_REPORT_LIFECYCLE_REVIEW_ACCEPTED';
 EXCEPTION WHEN no_data_found THEN
  IF SQLERRM<>'REPORT_LIFECYCLE_NOT_FOUND' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claim.sub',t::text,true);
 BEGIN
  PERFORM public.ccp_private_report_lifecycle_review(first,first);
  RAISE EXCEPTION 'SELF_REPORT_SUPERSESSION_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'REPORT_REPLACEMENT_NOT_PRIVATE_OR_IN_SCOPE' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ccp_private_report_lifecycle_review(first,imported);
  RAISE EXCEPTION 'LEGACY_REPORT_REPLACEMENT_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'REPORT_REPLACEMENT_NOT_PRIVATE_OR_IN_SCOPE' THEN RAISE; END IF;
 END;
 initial:=public.ccp_private_report_lifecycle_review(first,next_report);
 IF initial->>'action' IS DISTINCT FROM 'supersede'
   OR initial->'original'->'candidate' IS DISTINCT FROM old
   OR initial->'replacement'->'candidate' IS DISTINCT FROM next_candidate
   OR initial::text LIKE '%token_digest%' OR initial::text LIKE '%sessionId%'
   OR (SELECT revision::text FROM public.report_publications WHERE id=first)<>first_revision
 THEN RAISE EXCEPTION 'REPORT_LIFECYCLE_REVIEW_NOT_READ_ONLY_OR_EXACT'; END IF;
 BEGIN
  PERFORM public.ccp_private_report_lifecycle_commit(first,next_report,initial->>'reviewDigest',k,false);
  RAISE EXCEPTION 'UNCONFIRMED_REPORT_LIFECYCLE_ACCEPTED';
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM<>'REPORT_LIFECYCLE_APPROVAL_REQUIRED' THEN RAISE; END IF;
 END;
 RESET ROLE;

 -- A scoped audience approval after the read-only review changes its impact.
 INSERT INTO public.portal_access_grants(
  teacher_id,student_id,workplace_id,contact_id,permissions,token_digest,issued_at,expires_at,revision
 )
 SELECT teacher_id,student_id,workplace_id,contact_id,permissions,
  encode(sha256(convert_to(repeat('J',43),'UTF8')),'hex'),
  statement_timestamp()-interval '1 second',expires_at,2
 FROM public.portal_access_grants WHERE id=prior_audience RETURNING id INTO extra_grant;
 SET LOCAL ROLE authenticated;
 PERFORM public.ccp_report_audience_approve(first,extra_grant,
  public.ccp_report_audience_review(first,extra_grant)->>'reviewDigest',gen_random_uuid(),true);
 BEGIN
  PERFORM public.ccp_private_report_lifecycle_commit(first,next_report,initial->>'reviewDigest',k,true);
  RAISE EXCEPTION 'STALE_AUDIENCE_REVIEW_DID_NOT_BLOCK_REPORT_LIFECYCLE';
 EXCEPTION WHEN serialization_failure THEN
  IF SQLERRM<>'REPORT_LIFECYCLE_STALE' THEN RAISE; END IF;
 END;
 review:=public.ccp_private_report_lifecycle_review(first,next_report);
 IF (review->>'notWithdrawnApprovals')::bigint<>(initial->>'notWithdrawnApprovals')::bigint+1
    OR review->>'reviewDigest'=initial->>'reviewDigest'
 THEN RAISE EXCEPTION 'NEW_APPROVAL_DID_NOT_CHANGE_EXACT_IMPACT'; END IF;
 RESET ROLE;
 UPDATE public.teacher_entitlement_grants SET revoked_at=clock_timestamp()
 WHERE teacher_id=t AND capability_key='reports.publish' AND revoked_at IS NULL;
 IF (public.ccp_effective_capability(t,'reports.publish',clock_timestamp())->>'enabled')::boolean IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'LIFECYCLE_TEST_DOWNGRADE_NOT_EFFECTIVE'; END IF;

 SET LOCAL ROLE service_role;
 IF public.ccp_portal_sealed_learner_reports(guest_token)->'reports' IS DISTINCT FROM jsonb_build_array(old) THEN
  RAISE EXCEPTION 'GUEST_WAS_NOT_PREVIOUSLY_AUTHORIZED';
 END IF;
 RESET ROLE;
 SET LOCAL ROLE authenticated;
 receipt:=public.ccp_private_report_lifecycle_commit(first,next_report,review->>'reviewDigest',k,true);
 IF receipt->>'status' IS DISTINCT FROM 'superseded' OR receipt->>'replacementId' IS DISTINCT FROM next_report::text
   OR (receipt->>'revision')::bigint<>first_revision::bigint+1
   OR public.ccp_private_report_snapshot_get(first)->'candidate' IS DISTINCT FROM old
   OR public.ccp_private_report_snapshot_get(next_report)->>'status' IS DISTINCT FROM 'sealed'
  THEN RAISE EXCEPTION 'SUPERSESSION_REPLACED_HISTORY_OR_RETURNED_WRONG_RECEIPT'; END IF;
 BEGIN
  PERFORM public.ccp_private_report_lifecycle_commit(first,third_report,review->>'reviewDigest',k,true);
  RAISE EXCEPTION 'CONFLICTING_REPORT_LIFECYCLE_REPLAY_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM<>'REPORT_LIFECYCLE_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ccp_private_report_lifecycle_commit(first,next_report,review->>'reviewDigest',gen_random_uuid(),true);
  RAISE EXCEPTION 'TERMINAL_REPORT_MUTATED_AGAIN';
 EXCEPTION WHEN serialization_failure THEN
  IF SQLERRM<>'REPORT_LIFECYCLE_STALE' THEN RAISE; END IF;
 END;
 -- A later action on the replacement does not change the original receipt.
 new_review:=public.ccp_private_report_lifecycle_review(next_report,NULL);
 revoked:=public.ccp_private_report_lifecycle_commit(next_report,NULL,new_review->>'reviewDigest',k2,true);
 IF revoked->>'status' IS DISTINCT FROM 'revoked' OR revoked->>'revokedAt' IS NULL
   OR public.ccp_private_report_lifecycle_commit(next_report,NULL,new_review->>'reviewDigest',k2,true) IS DISTINCT FROM revoked
   OR public.ccp_private_report_lifecycle_commit(first,next_report,review->>'reviewDigest',k,true) IS DISTINCT FROM receipt
   OR public.ccp_private_report_snapshot_get(next_report)->'candidate' IS DISTINCT FROM next_candidate
 THEN RAISE EXCEPTION 'REVOKED_REPORT_HISTORY_OR_EXACT_LIFECYCLE_REPLAY_WRONG'; END IF;
 RESET ROLE;
 SET LOCAL ROLE service_role;
 IF public.ccp_portal_sealed_learner_reports(guest_token) IS DISTINCT FROM none
   OR public.ccp_portal_sealed_learner_reports(repeat('J',43)) IS DISTINCT FROM none
 THEN RAISE EXCEPTION 'OLD_PORTAL_AUDIENCE_INHERITED_OR_SAW_TERMINAL_REPORT'; END IF;
 RESET ROLE;
 IF EXISTS(SELECT 1 FROM public.report_publication_audiences a WHERE a.publication_id IN(next_report,third_report))
   OR (SELECT count(*) FROM public.agent_tool_receipts r WHERE r.teacher_id=t
       AND r.operation='teacher.privateReport.lifecycle.v1')<>2
 THEN RAISE EXCEPTION 'REPORT_LIFECYCLE_SENT_ACCESS_OR_DUPLICATED_RECEIPT'; END IF;
 INSERT INTO seal_fixture VALUES('lifecycle',jsonb_build_object('original',first,
  'replacement',next_report,'independent',third_report,'replacementReceipt',revoked,
  'originalReceipt',receipt,'originalDigest',review->>'reviewDigest','originalRequest',k));
END;
$lifecycle$;
SELECT 'Disposable entire report lifecycle privacy, impact, downgrade and exact replay passed.';
