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
    'portal_access_grants','portal_event_invitations',
    'compensation_agreements','financial_obligations','received_payments',
    'payment_allocations'] LOOP
    IF to_regclass('public.'||object_name) IS NULL THEN
      RAISE EXCEPTION 'Missing canonical table: %',object_name;
    END IF;
  END LOOP;
  FOREACH object_name IN ARRAY ARRAY[
    'students','contacts','student_contacts','billing_accounts',
    'portal_access_grants','portal_event_invitations',
    'compensation_agreements','financial_obligations','received_payments',
    'payment_allocations'] LOOP
    IF (SELECT c.relrowsecurity FROM pg_class c
        WHERE c.oid=to_regclass('public.'||object_name)) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Canonical RLS not enabled: %',object_name;
    END IF;
  END LOOP;
  -- The global workplace filter is the ONLY new writable teacher column;
  -- full teacher records and hosted caps must remain inaccessible.
  IF NOT has_column_privilege('authenticated','public.teachers','selected_workplace_id','UPDATE')
    OR has_table_privilege('authenticated','public.teacher_entitlement_state','UPDATE')
    OR has_table_privilege('authenticated','public.teacher_entitlement_grants','INSERT')
    OR has_table_privilege('authenticated','public.teachers','UPDATE') THEN
    RAISE EXCEPTION 'Unsafe/absent teacher workplace filter column grant';
  END IF;
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
  -- Future financial tables are readable to their own teacher only; all
  -- mutations remain service-only until audited explicit approval/posting.
  FOREACH object_name IN ARRAY ARRAY[
    'financial_obligations','received_payments','payment_allocations'] LOOP
    IF NOT has_table_privilege('authenticated','public.'||object_name,'SELECT') OR
       has_table_privilege('authenticated','public.'||object_name,'INSERT') OR
       has_table_privilege('authenticated','public.'||object_name,'UPDATE') OR
       has_table_privilege('authenticated','public.'||object_name,'DELETE') OR
       has_table_privilege('anon','public.'||object_name,'SELECT') THEN
      RAISE EXCEPTION 'Unsafe public/teacher write permissions for future financial ledger: %',object_name;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=
      to_regclass('public.'||object_name) AND NOT t.tgisinternal
      AND t.tgname=CASE object_name
        WHEN 'financial_obligations' THEN 'financial_obligation_immutable'
        WHEN 'received_payments' THEN 'received_payment_immutable'
        ELSE 'payment_allocation_immutable' END) THEN
      RAISE EXCEPTION 'Ledger table lacks immutable-history trigger: %',object_name;
    END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=
    'public.payment_allocations'::regclass AND t.tgname='payment_allocation_guard') THEN
    RAISE EXCEPTION 'Payment allocation must reject cross-account and over-limit transfers';
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

-- Prove actual auth-role behavior, not only pg_acl metadata. All changes are
-- rolled back; no synthetic teacher preference or entitlement capacity persists.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',true);
DO $workplace_filter_authority$
DECLARE v_workplace uuid;
BEGIN
 SELECT id INTO v_workplace FROM public.workplaces
  WHERE teacher_id=auth.uid() ORDER BY id LIMIT 1;
 IF v_workplace IS NULL THEN
   RAISE EXCEPTION 'Seed teacher has no workplace for scope test';
 END IF;
 UPDATE public.teachers SET selected_workplace_id=v_workplace
   WHERE id=auth.uid();
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Authenticated teacher cannot update selected workplace';
 END IF;
 BEGIN
   UPDATE public.teacher_entitlement_state SET active_student_count=99999
     WHERE teacher_id=auth.uid();
   RAISE EXCEPTION 'Authenticated user changed canonical subscription capacity';
 EXCEPTION WHEN insufficient_privilege THEN
   NULL; -- safe: hosted billing administration remains server-only
 END;
END;
$workplace_filter_authority$;
ROLLBACK;

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

-- Unified rating worker schema freeze, on disposable Supabase only.
DO $rating_freeze$
DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['student_rating_sync_consents',
 'student_rating_refresh_jobs','student_rating_refresh_receipts'] LOOP
  IF to_regclass('public.'||tbl) IS NULL THEN RAISE EXCEPTION 'Missing %',tbl; END IF;
  IF (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||tbl))
    IS DISTINCT FROM true THEN RAISE EXCEPTION 'RLS missing %',tbl; END IF;
  IF NOT has_table_privilege('authenticated','public.'||tbl,'SELECT') OR
    has_table_privilege('authenticated','public.'||tbl,'INSERT') OR
    has_table_privilege('authenticated','public.'||tbl,'UPDATE') OR
    has_table_privilege('authenticated','public.'||tbl,'DELETE') OR
    has_table_privilege('anon','public.'||tbl,'SELECT') THEN
      RAISE EXCEPTION 'Unsafe rating ACL on %',tbl; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('public.'||tbl) AND contype='f'
    AND confrelid='public.students'::regclass AND array_length(conkey,1)=2) THEN
      RAISE EXCEPTION 'Missing composite student owner FK on %',tbl; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE
   conrelid='public.student_rating_refresh_jobs'::regclass AND contype='f'
   AND confrelid='public.student_rating_sync_consents'::regclass
   AND array_length(conkey,1)=4) THEN
   RAISE EXCEPTION 'Rating job consent FK must pin student, provider and teacher';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE
   conrelid='public.student_rating_refresh_receipts'::regclass AND contype='f'
   AND confrelid='public.student_rating_refresh_jobs'::regclass
   AND array_length(conkey,1)=3) THEN
   RAISE EXCEPTION 'Rating receipt job FK must pin student and teacher';
 END IF;
 IF has_table_privilege('service_role','public.student_rating_refresh_receipts','UPDATE')
 OR has_table_privilege('service_role','public.student_rating_refresh_receipts','DELETE') THEN
   RAISE EXCEPTION 'Rating receipts must be append-only';
 END IF;
END;
$rating_freeze$;


-- ADR-0019: normalized entitlement and cross-domain schema proof.
DO $final_schema$
DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY[
  'capability_definitions','plan_versions','plan_capabilities',
  'teacher_entitlement_state','teacher_entitlement_grants',
  'entitlement_audit_events','account_usage_periods','account_usage_events',
  'platform_billing_customers','platform_subscription_offers',
  'platform_subscriptions','platform_billing_events',
  'rating_providers','rating_categories','slot_occurrence_exceptions',
  'report_publications','report_publication_audiences','session_amendment_events'
 ] LOOP
  IF to_regclass('public.'||tbl) IS NULL THEN
   RAISE EXCEPTION 'ADR-0019 missing canonical relation: %',tbl;
  END IF;
  IF (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||tbl))
    IS DISTINCT FROM true THEN RAISE EXCEPTION 'ADR-0019 missing RLS: %',tbl;END IF;
  IF has_table_privilege('authenticated','public.'||tbl,'INSERT') OR
    has_table_privilege('authenticated','public.'||tbl,'UPDATE') OR
    has_table_privilege('authenticated','public.'||tbl,'DELETE') OR
    has_table_privilege('anon','public.'||tbl,'SELECT') THEN
    RAISE EXCEPTION 'ADR-0019 unsafe public mutation on %',tbl;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint c
   WHERE c.conrelid='public.student_rating_snapshots'::regclass
    AND c.conname='ccp_rating_snapshot_registered_category') THEN
  RAISE EXCEPTION 'Rating snapshots must reference extensible categories';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint c
   WHERE c.conrelid='public.report_publication_audiences'::regclass
     AND c.contype='f' AND c.confrelid='public.portal_access_grants'::regclass) THEN
  RAISE EXCEPTION 'Published report audience must be explicitly portal scoped';
 END IF;
 IF to_regprocedure('public.ccp_effective_capability(uuid,text,timestamptz)') IS NULL OR
    to_regprocedure('public.ccp_entitlement_summary()') IS NULL THEN
   RAISE EXCEPTION 'Missing single SQL entitlement evaluator';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgrelid='public.students'::regclass
     AND tgname='ccp_student_capacity_guard' AND NOT tgisinternal) OR
    NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgrelid='public.workplaces'::regclass
     AND tgname='ccp_professional_workplace_capacity_guard' AND NOT tgisinternal) THEN
  RAISE EXCEPTION 'Missing transactional capacity triggers';
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='teachers'
     AND column_name IN ('hosted_plan','hosted_enforced',
       'hosted_max_active_students','stripe_subscription_id','founding_number')) THEN
  RAISE EXCEPTION 'Inherited SaaS plan authority must be absent';
 END IF;
END
$final_schema$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000001',true);
DO $entitlement_denials$
DECLARE v_invalid boolean:=false;
BEGIN
 BEGIN
  PERFORM public.ccp_effective_capability(
    '00000000-0000-0000-0000-000000000002'::uuid,
    'students.active');
 EXCEPTION WHEN insufficient_privilege THEN
   v_invalid:=true;
 END;
 IF NOT v_invalid THEN RAISE EXCEPTION 'Cross-teacher capability read succeeded';END IF;
 BEGIN
  INSERT INTO public.platform_billing_events(provider,merchant_scope,
   external_event_id,event_type,payload_sha256,signature_verified_at)
  VALUES('synthetic','synthetic','forged','subscription.active',repeat('a',64),now());
  RAISE EXCEPTION 'Authenticated user forged a provider billing event';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END
$entitlement_denials$;
ROLLBACK;

-- RAT-01: real registered provider kinds select the appropriate provenance
-- mode. Synthetic rows are rolled back; nothing is fetched from providers.
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.rating_providers(code,provider_kind,display_name)
 VALUES ('synthetic_federation','federation','Synthetic Federation');
INSERT INTO public.rating_categories(provider_code,code,display_name)
 VALUES ('synthetic_federation','standard','Standard');

DO $rating_provider_provenance$
DECLARE
 base jsonb:=jsonb_build_object(
  'teacher_id','00000000-0000-0000-0000-000000000001',
  'student_id','10000000-0000-0000-0000-000000000001',
  'source','provider_api','rating',1825,
  'observed_at','2026-11-01T00:00:00Z','fetched_at','2026-11-02T00:00:00Z');
 online jsonb;
 official jsonb;
 reissued jsonb;
 original_row jsonb;
 revised_row jsonb;
 candidate jsonb;
 field text;
 failed text;
BEGIN
 online:=base||jsonb_build_object(
  'provider','lichess','time_control','rapid','verification_state','unverified',
  'preview_digest',repeat('a',64),'source_username','synthetic_account');
 official:=base||jsonb_build_object(
  'provider','synthetic_federation','time_control','standard',
  'verification_state','provider_published','effective_at','2026-11-01',
  'provider_list_version','2026-11','source_digest',repeat('b',64),
  'source_url','https://ratings.example.invalid/list/2026-11',
  'external_player_id','12345678');
 FOREACH candidate IN ARRAY ARRAY[online,official] LOOP
  INSERT INTO public.student_rating_snapshots
   SELECT (jsonb_populate_record(NULL::public.student_rating_snapshots,
    candidate||jsonb_build_object('id',gen_random_uuid(),
     'request_id',gen_random_uuid(),'created_at',now()))).*;
 END LOOP;
 FOREACH field IN ARRAY ARRAY[
  'external_player_id','effective_at','provider_list_version','source_digest','source_url'
 ] LOOP
  BEGIN
   INSERT INTO public.student_rating_snapshots
    SELECT (jsonb_populate_record(NULL::public.student_rating_snapshots,
     (official-field)||jsonb_build_object('id',gen_random_uuid(),
      'request_id',gen_random_uuid(),'created_at',now()))).*;
   RAISE EXCEPTION 'Official rating accepted missing evidence field %',field;
  EXCEPTION WHEN check_violation THEN
   GET STACKED DIAGNOSTICS failed=CONSTRAINT_NAME;
   IF failed<>'ccp_rating_evidence_truth' THEN RAISE;END IF;
  END;
 END LOOP;
 FOREACH candidate IN ARRAY ARRAY[
  official||jsonb_build_object('source_username','synthetic_account','preview_digest',repeat('a',64)),
  official||jsonb_build_object('source_handle_revision',1),
  official||jsonb_build_object('provider_list_version',' '),
  official||jsonb_build_object('source_url','http://ratings.example.invalid/list'),
  official||jsonb_build_object('source_url','https://ratings.example.invalid@another.example.invalid/list'),
  online||jsonb_build_object('provider_list_version','online-fake-edition'),
  online||jsonb_build_object('preview_digest',NULL),
  online||jsonb_build_object('source_username',NULL)
 ] LOOP
  BEGIN
   INSERT INTO public.student_rating_snapshots
    SELECT (jsonb_populate_record(NULL::public.student_rating_snapshots,
     candidate||jsonb_build_object('id',gen_random_uuid(),
      'request_id',gen_random_uuid(),'created_at',now()))).*;
   RAISE EXCEPTION 'Invalid or mixed rating evidence was accepted';
  EXCEPTION WHEN check_violation THEN
   GET STACKED DIAGNOSTICS failed=CONSTRAINT_NAME;
   IF failed<>'ccp_rating_evidence_truth' THEN RAISE;END IF;
  END;
 END LOOP;
 FOREACH candidate IN ARRAY ARRAY[
  official||jsonb_build_object('provider','lichess','time_control','rapid'),
  online||jsonb_build_object('provider','synthetic_federation','time_control','standard')
 ] LOOP
  BEGIN
   INSERT INTO public.student_rating_snapshots
    SELECT (jsonb_populate_record(NULL::public.student_rating_snapshots,
     candidate||jsonb_build_object('id',gen_random_uuid(),
      'request_id',gen_random_uuid(),'created_at',now()))).*;
   RAISE EXCEPTION 'Provider accepted another registry kind''s evidence';
  EXCEPTION WHEN check_violation THEN
   GET STACKED DIAGNOSTICS failed=CONSTRAINT_NAME;
   IF failed<>'ccp_rating_provider_evidence_kind' THEN RAISE;END IF;
  END;
 END LOOP;
 -- A source correction can revise an edition without moving its effective
 -- date or changing the confirmed external identity. These revision tokens
 -- are synthetic; the database only enforces row shape and idempotency.
 SELECT to_jsonb(snapshot) INTO STRICT original_row
 FROM public.student_rating_snapshots snapshot
 WHERE provider='synthetic_federation' AND provider_list_version='2026-11';
 reissued:=official||jsonb_build_object(
  'provider_list_version','2026-11-correction-1','source_digest',repeat('c',64),
  'rating',1826,'fetched_at','2026-11-03T00:00:00Z',
  'id',gen_random_uuid(),'request_id',gen_random_uuid(),'created_at',now());
 INSERT INTO public.student_rating_snapshots
  SELECT (jsonb_populate_record(NULL::public.student_rating_snapshots,reissued)).*;
 SELECT to_jsonb(snapshot) INTO STRICT revised_row
 FROM public.student_rating_snapshots snapshot
 WHERE provider='synthetic_federation' AND provider_list_version='2026-11-correction-1';
 -- Replay the identical evidence with fresh local write identifiers. The
 -- edition key, not a reused request ID, is what prevents another row.
 INSERT INTO public.student_rating_snapshots
  SELECT (jsonb_populate_record(NULL::public.student_rating_snapshots,
   reissued||jsonb_build_object('id',gen_random_uuid(),'request_id',gen_random_uuid()))).*
  ON CONFLICT (teacher_id,student_id,provider,time_control,provider_list_version)
    WHERE source='provider_api' AND provider_list_version IS NOT NULL
    DO NOTHING;
 IF FOUND THEN RAISE EXCEPTION 'Exact official edition replay inserted a duplicate'; END IF;
 IF (SELECT count(*) FROM public.student_rating_snapshots
     WHERE provider='synthetic_federation' AND source='provider_api')<>2
 OR revised_row->>'effective_at' IS DISTINCT FROM original_row->>'effective_at'
 OR revised_row->>'external_player_id' IS DISTINCT FROM original_row->>'external_player_id'
 OR revised_row->>'source_digest' IS DISTINCT FROM repeat('c',64)
 OR revised_row->>'rating' IS DISTINCT FROM '1826'
 OR NOT EXISTS(SELECT 1 FROM public.student_rating_snapshots snapshot
   WHERE to_jsonb(snapshot)=original_row)
 OR NOT EXISTS(SELECT 1 FROM public.student_rating_snapshots snapshot
   WHERE to_jsonb(snapshot)=revised_row) THEN
  RAISE EXCEPTION 'Same-period revision did not preserve both immutable evidence rows';
 END IF;
 -- Preserve one observation per student/category/list edition for now,
 -- even when a proposed correction changes the player identifier.
 BEGIN
  INSERT INTO public.student_rating_snapshots
   SELECT (jsonb_populate_record(NULL::public.student_rating_snapshots,
    official||jsonb_build_object('id',gen_random_uuid(),'external_player_id','87654321',
     'request_id',gen_random_uuid(),'created_at',now()))).*;
  RAISE EXCEPTION 'Duplicate edition bypassed the existing idempotency contract';
 EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS failed=CONSTRAINT_NAME;
  IF failed<>'ccp_official_rating_list_once' THEN RAISE;END IF;
 END;
END
$rating_provider_provenance$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000001',true);
DO $rating_owner_provenance$
DECLARE t uuid:='00000000-0000-0000-0000-000000000001';
s uuid:='10000000-0000-0000-0000-000000000001';
BEGIN
 -- This is the present federation manual caller's shape, including the
 -- reviewable reference and application-level request digest.
 INSERT INTO public.student_rating_snapshots(teacher_id,student_id,provider,time_control,
  rating,source,verification_state,observed_at,effective_at,source_url,source_digest,request_id)
 VALUES(t,s,'fide','standard',1700,'teacher_manual','unverified',now(),'2026-11-01',
  'https://ratings.example.invalid/teacher-reference',repeat('d',64),gen_random_uuid());
 IF NOT EXISTS(SELECT 1 FROM public.student_rating_snapshots
   WHERE teacher_id=t AND student_id=s AND provider='synthetic_federation'
   AND verification_state='provider_published' AND source_username IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.student_rating_snapshots
   WHERE teacher_id=t AND student_id=s AND provider='lichess' AND source='provider_api'
   AND source_username='synthetic_account' AND verification_state='unverified') THEN
  RAISE EXCEPTION 'Teacher cannot read own correctly classified provider evidence';
 END IF;
 BEGIN
  INSERT INTO public.student_rating_snapshots(teacher_id,student_id,provider,time_control,
   rating,source,verification_state,observed_at,fetched_at,effective_at,provider_list_version,
   source_url,source_digest,external_player_id,request_id)
  VALUES(t,s,'synthetic_federation','standard',1800,'provider_api','provider_published',now(),now(),
   '2026-11-01','forged-edition','https://ratings.example.invalid/list',
   repeat('e',64),'12345678',gen_random_uuid());
  RAISE EXCEPTION 'Ordinary teacher forged official provider evidence';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END
$rating_owner_provenance$;

SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-0000-0000-000000000002',true);
DO $rating_foreign_provenance$
BEGIN
 IF EXISTS(SELECT 1 FROM public.student_rating_snapshots
   WHERE student_id='10000000-0000-0000-0000-000000000001') THEN
  RAISE EXCEPTION 'Cross-tenant rating evidence leaked';
 END IF;
 IF has_table_privilege('anon','public.student_rating_snapshots','SELECT')
 OR has_table_privilege('anon','public.student_rating_snapshots','INSERT') THEN
  RAISE EXCEPTION 'Anonymous rating evidence access leaked';
 END IF;
END
$rating_foreign_provenance$;
ROLLBACK;
