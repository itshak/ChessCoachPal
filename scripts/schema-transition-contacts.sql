-- Synthetic CI-only identity migration acceptance; this script is never
-- executed against any remotely configured or populated deployed database.
DO $contact_verify$
DECLARE
 v_guardian_count bigint;
 v_primary_count bigint;
 v_secondary_count bigint;
 v_invoice_count bigint;
BEGIN
 SELECT count(*) INTO v_guardian_count FROM public.guardians;
 SELECT count(*) INTO v_primary_count FROM public.guardians g
   JOIN public.contacts c ON c.id=g.id AND c.teacher_id=g.teacher_id
   WHERE c.kind='person' AND c.display_name=btrim(g.name);
 IF v_primary_count<>v_guardian_count THEN
   RAISE EXCEPTION 'contact conversion lost a primary person: %, %',
     v_primary_count,v_guardian_count;
 END IF;
 SELECT count(*) INTO v_secondary_count FROM public.guardians g
   JOIN public.contacts c
     ON c.id=md5('ccp-secondary:'||g.id::text)::uuid
    AND c.teacher_id=g.teacher_id
   WHERE nullif(btrim(g.secondary_name),'') IS NOT NULL
      OR nullif(btrim(g.secondary_email),'') IS NOT NULL
      OR nullif(btrim(g.secondary_phone),'') IS NOT NULL;
 IF v_secondary_count=0 THEN
   RAISE EXCEPTION 'Missing synthetic independent secondary person';
 END IF;
 IF EXISTS (
   SELECT 1 FROM public.students s
   WHERE s.guardian_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.student_contacts sc
      WHERE sc.student_id=s.id AND sc.teacher_id=s.teacher_id
        AND sc.contact_id=s.guardian_id AND sc.active_to IS NULL)
 ) THEN RAISE EXCEPTION 'Student relationship conversion lost an existing link';
 END IF;
 IF EXISTS(SELECT 1 FROM public.student_contacts WHERE is_legal_guardian) THEN
   RAISE EXCEPTION 'Migrated relationship incorrectly assumed legal guardianship';
 END IF;
 IF EXISTS(
   SELECT 1 FROM public.student_contacts sc JOIN public.contacts c ON c.id=sc.contact_id
   WHERE sc.teacher_id<>c.teacher_id
 ) THEN RAISE EXCEPTION 'Cross-tenant student contact found'; END IF;
 SELECT count(*) INTO v_invoice_count FROM public.invoices
   WHERE billing_account_id=guardian_id AND billing_account_id IS NOT NULL;
 IF v_invoice_count<>(SELECT count(*) FROM public.invoices) THEN
   RAISE EXCEPTION 'Invoice payer conversion lost or changed attribution';
 END IF;
 IF EXISTS(
  SELECT 1 FROM public.billing_accounts b
  JOIN public.guardians g ON g.id=b.id
  WHERE b.teacher_id<>g.teacher_id OR b.contact_id<>g.id
 ) THEN RAISE EXCEPTION 'Incorrect mapped payer identity'; END IF;
 IF EXISTS(
   SELECT 1 FROM public.guardians g LEFT JOIN public.contacts c
    ON c.id=g.id WHERE c.id IS NULL OR g.portal_token IS NULL
 ) THEN RAISE EXCEPTION 'Legacy identity or portal credential lost'; END IF;
END
$contact_verify$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
DO $contacts_rls$
BEGIN
 IF (SELECT count(*) FROM public.contacts)>0 OR
    (SELECT count(*) FROM public.student_contacts)>0 OR
    (SELECT count(*) FROM public.billing_accounts)>0 THEN
   RAISE EXCEPTION 'Foreign teacher can read identities, links or payers';
 END IF;
 BEGIN
   INSERT INTO public.contacts(teacher_id,display_name)
   VALUES('00000000-0000-0000-0000-000000000001','Forbidden');
   RAISE EXCEPTION 'Foreign teacher can create under another tenant';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END
$contacts_rls$;
ROLLBACK;
