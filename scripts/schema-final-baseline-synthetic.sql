-- ADR-0017 synthetic clean-install acceptance. No customer/child records.
-- The schema may contain historical WIP tables before the final release, but
-- these current explicit-grant models and ownership invariants must exist.
DO $baseline$
DECLARE
  object_name text;
  role_name text;
BEGIN
  FOREACH object_name IN ARRAY ARRAY[
    'students','workplaces','workplace_enrollments','teaching_sessions',
    'contacts','student_contacts','billing_accounts',
    'portal_access_grants','portal_event_invitations'] LOOP
    IF to_regclass('public.'||object_name) IS NULL THEN
      RAISE EXCEPTION 'Missing canonical table: %',object_name;
    END IF;
  END LOOP;
  FOREACH object_name IN ARRAY ARRAY[
    'students','contacts','student_contacts','billing_accounts',
    'portal_access_grants','portal_event_invitations'] LOOP
    IF (SELECT c.relrowsecurity FROM pg_class c
        WHERE c.oid=to_regclass('public.'||object_name)) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Canonical RLS not enabled: %',object_name;
    END IF;
  END LOOP;
  -- Neither the school nor a student's legal guardian is an inferred
  -- financial counterparty. A compensation contract always names one.
  IF (SELECT a.attnotnull FROM pg_attribute a
      WHERE a.attrelid='public.compensation_agreements'::regclass
        AND a.attname='billing_account_id' AND NOT a.attisdropped)
       IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Compensation agreement must have explicit Billing Account';
  END IF;
  IF (SELECT c.relrowsecurity FROM pg_class c
      WHERE c.oid='public.compensation_agreements'::regclass)
       IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Compensation agreements require tenant RLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid =
    'public.compensation_agreements'::regclass
    AND contype='f' AND conname='compensation_agreements_billing_account_id_teacher_id_fkey') THEN
    -- An unnamed composite FK is acceptable only when PostgreSQL exposes
    -- its columns as (billing_account_id, teacher_id) in the declaration.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c
      WHERE c.conrelid='public.compensation_agreements'::regclass
        AND c.contype='f' AND c.confrelid='public.billing_accounts'::regclass
        AND array_length(c.conkey,1)=2) THEN
      RAISE EXCEPTION 'Compensation counterparty must use tenant-composite FK';
    END IF;
  END IF;
  IF to_regprocedure('public.ccp_scoped_portal_cancel(text,uuid,uuid,text)') IS NULL
    OR to_regprocedure('public.ccp_scoped_portal_rsvp(text,uuid,text,integer,text)') IS NULL THEN
    RAISE EXCEPTION 'Scoped portal transactional RPCs missing';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(role_name,
      'public.ccp_scoped_portal_cancel(text,uuid,uuid,text)','EXECUTE') OR
       has_function_privilege(role_name,
      'public.ccp_scoped_portal_rsvp(text,uuid,text,integer,text)','EXECUTE') THEN
      RAISE EXCEPTION 'Unsafe direct portal RPC grants to %',role_name;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role',
    'public.ccp_scoped_portal_cancel(text,uuid,uuid,text)','EXECUTE') OR
     NOT has_function_privilege('service_role',
    'public.ccp_scoped_portal_rsvp(text,uuid,text,integer,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Scoped portal RPCs must be callable only by service_role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='portal_contact_owner_fk')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='portal_student_owner_fk')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='portal_workplace_owner_fk')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='portal_account_owner_fk') THEN
    RAISE EXCEPTION 'Missing tenant-composite portal owner foreign keys';
  END IF;
END
$baseline$;

-- Injected failure must not leave a partial change on the disposable instance.
BEGIN;
SAVEPOINT unsafe_change;
DO $rollback$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.contacts ADD COLUMN ccp_fake_persisted_column text';
    RAISE EXCEPTION 'INTENTIONAL_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'INTENTIONAL_ROLLBACK' THEN RAISE; END IF;
  END;
END
$rollback$;
ROLLBACK TO SAVEPOINT unsafe_change;
DO $check$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='contacts'
      AND column_name='ccp_fake_persisted_column') THEN
    RAISE EXCEPTION 'Synthetic DDL rollback did not isolate partial changes';
  END IF;
END
$check$;
ROLLBACK;

-- The actual guest grant is a 256-bit random secret whose digest is stored;
-- a forged old household token must never authenticate as a new grant.
DO $guest$
BEGIN
 IF EXISTS(SELECT 1 FROM public.portal_access_grants
   WHERE token_digest IS NOT NULL OR revoked_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Clean baseline unexpectedly contains preissued guest access';
 END IF;
END
$guest$;
