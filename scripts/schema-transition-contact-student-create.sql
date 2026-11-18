-- Synthetic-only verified contact-first student creation, never a real migration.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $contact_student$
DECLARE
 v_before_contacts bigint;
 v_student_id uuid;
 v_contact_id uuid;
 v_created jsonb;
 v_replay jsonb;
BEGIN
 SELECT count(*) INTO v_before_contacts FROM public.contacts;
 -- Archived synthetic fixture is not counted against hosted active capacity.
 v_created:=public.ccp_student_create_full(
   'Synthetic independent student',NULL,NULL,NULL,
   NULL,NULL,'Coach liaison',false,true,
   'd1000000-0000-0000-0000-000000000001'::uuid);
 v_student_id:=(v_created->'student'->>'id')::uuid;
 v_contact_id:=(v_created->>'createdContactId')::uuid;
 IF v_created ? 'createdFamily' OR v_contact_id IS NULL THEN
   RAISE EXCEPTION 'Created old family or lost contact receipt';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.students WHERE id=v_student_id
   AND teacher_id=auth.uid() AND archived_at IS NOT NULL)
   OR NOT EXISTS(SELECT 1 FROM public.contacts WHERE id=v_contact_id
   AND teacher_id=auth.uid() AND display_name='Coach liaison')
   OR NOT EXISTS(SELECT 1 FROM public.student_contacts
   WHERE teacher_id=auth.uid() AND student_id=v_student_id AND contact_id=v_contact_id
     AND NOT is_legal_guardian AND NOT may_receive_messages)
   OR EXISTS(SELECT 1 FROM public.portal_access_grants
   WHERE teacher_id=auth.uid() AND student_id=v_student_id) THEN
   RAISE EXCEPTION 'Contact-first write implied an unauthorized grant or lost identity';
 END IF;
 v_replay:=public.ccp_student_create_full(
   'Synthetic independent student',NULL,NULL,NULL,
   NULL,NULL,'Coach liaison',false,true,
   'd1000000-0000-0000-0000-000000000001'::uuid);
 IF v_replay->>'createdContactId' IS DISTINCT FROM v_created->>'createdContactId'
    OR v_replay->'student'->>'id' IS DISTINCT FROM v_student_id::text
    OR v_replay->>'replayed' IS DISTINCT FROM 'true'
    OR (SELECT count(*) FROM public.contacts)<>v_before_contacts+1 THEN
   RAISE EXCEPTION 'Contact-first replay was not idempotent';
 END IF;
 BEGIN
   PERFORM public.ccp_student_create_full(
     'Changed student name',NULL,NULL,NULL,
     NULL,NULL,'Coach liaison',false,true,
     'd1000000-0000-0000-0000-000000000001'::uuid);
   RAISE EXCEPTION 'Conflicting request ID was accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
END
$contact_student$;
ROLLBACK;
