-- Synthetic CI-only transactional verification. Never apply to deployed data.
-- This deliberately runs in an uncommitted transaction.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
DO $backup$
DECLARE
  v_input jsonb;
  v_first jsonb;
  v_second jsonb;
  v_rejected boolean := false;
BEGIN
  v_input := jsonb_build_object(
    'contacts',jsonb_build_array(jsonb_build_object(
      'id','a1000000-0000-0000-0000-000000000001',
      'teacher_id','00000000-0000-0000-0000-000000000002',
      'display_name','Imported synthetic contact','kind','organization',
      'email','synthetic@example.invalid','status','active')),
    'student_contacts',jsonb_build_array(jsonb_build_object(
      'id','a2000000-0000-0000-0000-000000000001',
      'teacher_id','00000000-0000-0000-0000-000000000002',
      'student_id','10000000-0000-0000-0000-000000000001',
      'contact_id','a1000000-0000-0000-0000-000000000001',
      'relationship_label','School liaison','is_legal_guardian',false,
      'may_receive_messages',false)),
    'billing_accounts',jsonb_build_array(jsonb_build_object(
      'id','a3000000-0000-0000-0000-000000000001',
      'teacher_id','00000000-0000-0000-0000-000000000002',
      'display_name','Synthetic school payer','account_kind','organization',
      'contact_id','a1000000-0000-0000-0000-000000000001')));
  v_first:=public.ccp_teacher_backup_restore(v_input,NULL,repeat('b',64));
  IF (v_first->'counts'->>'contacts')::integer<>1 OR
     (v_first->'counts'->>'student_contacts')::integer<>1 OR
     (v_first->'counts'->>'billing_accounts')::integer<>1 THEN
    RAISE EXCEPTION 'Restored contact-table receipt incomplete: %',v_first;
  END IF;
  IF (SELECT count(*) FROM public.contacts WHERE teacher_id=auth.uid() AND
      id='a1000000-0000-0000-0000-000000000001')<>1 OR
     (SELECT count(*) FROM public.student_contacts WHERE teacher_id=auth.uid() AND
      id='a2000000-0000-0000-0000-000000000001')<>1 OR
     (SELECT count(*) FROM public.billing_accounts WHERE teacher_id=auth.uid() AND
      id='a3000000-0000-0000-0000-000000000001')<>1 THEN
    RAISE EXCEPTION 'Atomic contact restore did not persist owned records';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contacts
      WHERE id='a1000000-0000-0000-0000-000000000001'
      AND teacher_id<>'00000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Import accepted spoofed tenant ownership';
  END IF;
  v_second:=public.ccp_teacher_backup_restore(v_input,NULL,repeat('b',64));
  IF v_first IS DISTINCT FROM v_second THEN
    RAISE EXCEPTION 'Idempotent contact restore receipt changed on retry';
  END IF;
  -- A foreign learner attached to an otherwise valid newly restored contact
  -- must roll back the entire import and its replay receipt; no partial record.
  BEGIN
    PERFORM public.ccp_teacher_backup_restore(
      jsonb_build_object(
        'contacts',jsonb_build_array(jsonb_build_object(
          'id','a1000000-0000-0000-0000-000000000002',
          'display_name','Must roll back with invalid relationship')),
        'student_contacts',jsonb_build_array(jsonb_build_object(
          'id','a2000000-0000-0000-0000-000000000002',
          'student_id','20000000-0000-0000-0000-000000000999',
          'contact_id','a1000000-0000-0000-0000-000000000002',
          'relationship_label','Forbidden tenant cross-link'))
      ),NULL,repeat('c',64));
  EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'Cross-tenant or invalid imported relationship was accepted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contacts
      WHERE id='a1000000-0000-0000-0000-000000000002') OR
     EXISTS (SELECT 1 FROM public.teacher_backup_import_receipts
      WHERE digest=repeat('c',64) AND teacher_id=auth.uid()) THEN
    RAISE EXCEPTION 'Rejected contact import left partial records or replay receipt';
  END IF;
END
$backup$;
ROLLBACK;
