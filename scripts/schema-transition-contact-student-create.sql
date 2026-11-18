-- Synthetic CI-only acceptance of contact-first student creation.
-- Never execute against a deployed or copied customer database.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $contact_student$
DECLARE
 v_before_guardians bigint;
 v_before_contacts bigint;
 v_student_id uuid;
 v_contact_id uuid;
 v_created jsonb;
 v_replay jsonb;
 v_legacy jsonb;
BEGIN
 SELECT count(*) INTO v_before_guardians FROM public.guardians;
 SELECT count(*) INTO v_before_contacts FROM public.contacts;
 -- Archived synthetic fixture does not consume a hosted active-student slot.
 v_created := public.ccp_student_create_full(
   'Synthetic independent student',NULL,NULL,NULL,NULL,
   NULL,NULL,'Coach liaison',false,true,
   'd1000000-0000-0000-0000-000000000001'::uuid);
 v_student_id:=(v_created->'student'->>'id')::uuid;
 v_contact_id:=(v_created->>'createdContactId')::uuid;
 IF v_created->>'createdFamily' IS DISTINCT FROM 'false'
    OR v_contact_id IS NULL THEN
   RAISE EXCEPTION 'Student created a legacy family or lost contact receipt: %',v_created;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.students WHERE id=v_student_id
   AND teacher_id=auth.uid() AND guardian_id IS NULL AND archived_at IS NOT NULL)
   OR NOT EXISTS(SELECT 1 FROM public.contacts WHERE id=v_contact_id
   AND teacher_id=auth.uid() AND display_name='Coach liaison')
   OR NOT EXISTS(SELECT 1 FROM public.student_contacts
   WHERE teacher_id=auth.uid() AND student_id=v_student_id AND contact_id=v_contact_id
   AND NOT is_legal_guardian AND NOT may_receive_messages
   AND relationship_label='Unverified contact') THEN
   RAISE EXCEPTION 'Student/contact transaction was not saved correctly';
 END IF;
 IF (SELECT count(*) FROM public.guardians)<>v_before_guardians THEN
   RAISE EXCEPTION 'An implicit portal family was created';
 END IF;
 v_replay:=public.ccp_student_create_full(
   'Synthetic independent student',NULL,NULL,NULL,NULL,
   NULL,NULL,'Coach liaison',false,true,
   'd1000000-0000-0000-0000-000000000001'::uuid);
 IF v_replay->>'createdContactId' IS DISTINCT FROM v_created->>'createdContactId'
    OR v_replay->'student'->>'id' IS DISTINCT FROM v_student_id::text
    OR v_replay->>'replayed' IS DISTINCT FROM 'true'
    OR (SELECT count(*) FROM public.contacts)<>v_before_contacts+1 THEN
   RAISE EXCEPTION 'Contact-first replay was not idempotent: %',v_replay;
 END IF;
 BEGIN
   PERFORM public.ccp_student_create_full(
     'Changed student name',NULL,NULL,NULL,NULL,
     NULL,NULL,'Coach liaison',false,true,
     'd1000000-0000-0000-0000-000000000001'::uuid);
   RAISE EXCEPTION 'Conflicting student request was accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 -- Explicit legacy family links may be preserved without issuing new tokens.
 v_legacy:=public.ccp_student_create_full(
   'Explicit legacy family student',NULL,NULL,NULL,
   '50000000-0000-0000-0000-000000000001'::uuid,
   NULL,NULL,NULL,false,true,
   'd1000000-0000-0000-0000-000000000002'::uuid);
 IF v_legacy->'student'->>'guardian_id'
   IS DISTINCT FROM '50000000-0000-0000-0000-000000000001'
    OR v_legacy->>'createdContactId' IS NOT NULL
    OR (SELECT count(*) FROM public.guardians)<>v_before_guardians THEN
   RAISE EXCEPTION 'Legacy explicit link or portal history changed';
 END IF;
 BEGIN
   PERFORM public.ccp_student_create_full(
     'Ambiguous contact',NULL,NULL,NULL,
     '50000000-0000-0000-0000-000000000001'::uuid,
     'new@example.invalid',NULL,'Another contact',false,true,
     'd1000000-0000-0000-0000-000000000003'::uuid);
   RAISE EXCEPTION 'Conflicting legacy + new contact input was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END
$contact_student$;
ROLLBACK;
