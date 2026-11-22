-- Materialized P0 ACL proof, disposable canonical Supabase only.
-- Expected direct privilege, including PUBLIC and inherited role grants.
-- The browser/API fixture separately tests real signed users and populated rows.
BEGIN READ ONLY;
DO $schema_effective_roles$
DECLARE
 x record;
 fn regprocedure;
 rel regclass;
BEGIN
 FOR x IN
  SELECT * FROM (VALUES
   ('ccp_canonical_slot_cancel_unmaterialized(uuid,date,timestamptz,uuid,text,boolean)',true,false),
   ('ccp_canonical_slot_revoke_unmaterialized_cancellation(uuid,bigint,uuid,boolean)',true,false),
   ('ccp_canonical_terminal_slot_split(uuid,date,uuid,jsonb,date,timestamptz,text,uuid,boolean)',true,false),
   ('ccp_canonical_slot_edit_scoped(uuid,text,date,uuid,jsonb,date,timestamptz,text,uuid,boolean)',true,false),
   ('ccp_canonical_reschedule_unmaterialized_slot(uuid,date,date,time,timestamptz,text,text,uuid,boolean)',true,false),
   ('ccp_rating_refresh_claim(uuid,uuid)',false,true),
   ('ccp_rating_refresh_finalize(uuid,uuid,uuid,integer,text,text,timestamptz,text,jsonb,text)',false,true),
   ('ccp_canonical_slot_real_start(public.lesson_slots,date)',false,false),
   ('ccp_report_publish_entitlement_guard()',false,false),
   ('ccp_rating_consent_binding_epoch()',false,false),
   ('ccp_rating_handle_changed()',false,false)
  ) AS expected(signature,teacher_execute,service_execute)
 LOOP
  fn:=to_regprocedure('public.'||x.signature);
  IF fn IS NULL OR has_function_privilege('anon',fn,'EXECUTE')
   OR has_function_privilege('authenticated',fn,'EXECUTE') IS DISTINCT FROM x.teacher_execute
   OR has_function_privilege('service_role',fn,'EXECUTE') IS DISTINCT FROM x.service_execute
  THEN
   RAISE EXCEPTION 'P0_EFFECTIVE_ROUTINE_ACL_MISMATCH: %', x.signature;
  END IF;
 END LOOP;

 FOR x IN
  SELECT * FROM (VALUES
   ('student_rating_sync_consents',true),
   ('student_rating_refresh_jobs',true),
   ('student_rating_refresh_receipts',false),
   ('slot_occurrence_exceptions',true),
   ('report_publications',true),
   ('report_publication_audiences',true)
  ) AS expected(table_name,service_change)
 LOOP
  rel:=to_regclass('public.'||x.table_name);
  IF rel IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=rel AND relrowsecurity)
   OR has_any_column_privilege('anon',rel,'SELECT,INSERT,UPDATE')
   OR has_table_privilege('anon',rel,'DELETE')
   OR NOT has_table_privilege('authenticated',rel,'SELECT')
   OR has_any_column_privilege('authenticated',rel,'INSERT,UPDATE')
   OR has_table_privilege('authenticated',rel,'DELETE')
   OR NOT has_table_privilege('service_role',rel,'SELECT')
   OR NOT has_table_privilege('service_role',rel,'INSERT')
   OR has_any_column_privilege('service_role',rel,'UPDATE') IS DISTINCT FROM x.service_change
   OR has_table_privilege('service_role',rel,'DELETE') IS DISTINCT FROM x.service_change
  THEN
   RAISE EXCEPTION 'P0_EFFECTIVE_TABLE_ACL_MISMATCH: %', x.table_name;
  END IF;
 END LOOP;
END
$schema_effective_roles$;
ROLLBACK;
