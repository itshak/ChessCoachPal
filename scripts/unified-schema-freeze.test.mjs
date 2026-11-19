import { test } from "node:test";
import { deepStrictEqual, ok } from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read=(file)=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
const sql=read("supabase/migrations/20261107000000_chesscoachpal_baseline.sql");
const manifest=JSON.parse(read("scripts/schema-transition-manifest.json"));
const types=read("lib/supabase/types.ts");
const tables=["student_rating_sync_consents","student_rating_refresh_jobs",
 "student_rating_refresh_receipts"];

test("unified rating schema is in the one checked baseline and typed contract",()=>{
 deepStrictEqual(createHash("sha256").update(sql).digest("hex"),manifest.baselineSha256);
 for(const name of tables){
   ok(sql.includes("CREATE TABLE public."+name+" ("),"Missing table "+name);
   ok(manifest.baselineRequiredObjects.includes(name),"Missing manifest "+name);
   ok(types.includes("      "+name+": {"),"Missing types "+name);
   ok(sql.includes("ALTER TABLE public."+name+" ENABLE ROW LEVEL SECURITY"));
   ok(sql.includes("GRANT SELECT ON TABLE public."+name+" TO authenticated"));
 }
});
test("worker rights, provenance and dedupe are explicit; no client can write",()=>{
 for(const marker of [
 "rating_sync_explicit_consent","UNIQUE(teacher_id,idempotency_key)",
 "UNIQUE(teacher_id,consent_id,handle_revision,input_digest,trigger_kind)",
 "FOREIGN KEY(consent_id,teacher_id,student_id,provider)",
 "FOREIGN KEY(job_id,teacher_id,student_id)",
 "rating_job_running_lease","rating_job_terminal_time",
 "rating_receipt_success_evidence",
 "GRANT SELECT,INSERT ON TABLE public.student_rating_refresh_receipts TO service_role"
 ]) ok(sql.includes(marker),"Missing invariant "+marker);
 for(const name of tables){
   ok(!sql.includes("GRANT INSERT ON TABLE public."+name+" TO authenticated"));
   ok(!sql.includes("GRANT UPDATE ON TABLE public."+name+" TO authenticated"));
 }
});

test("canonical temporal enrollments support ordered historical periods and guarded source provenance",()=>{
 for(const marker of [
  "DROP CONSTRAINT workplace_enrollments_teacher_id_workplace_id_student_id_key",
  "ADD COLUMN starts_on date","ADD COLUMN ends_on date",
  "ADD COLUMN start_date_unknown boolean NOT NULL DEFAULT false",
  "ADD COLUMN cancelled_at timestamptz",
  "workplace_enrollment_no_overlap","EXCLUDE USING gist",
  "daterange(starts_on,CASE WHEN ends_on IS NULL THEN NULL ELSE ends_on+1 END,'[)')",
  "workplace_enrollment_legacy_unknown",
  "LEGACY_ENROLLMENT_OPERATOR_ONLY",
  "ENROLLMENT_IDENTITY_OR_START_IMMUTABLE",
  "ccp_group_enrollment_period_guard",
  "ccp_direct_session_enrollment_guard",
  "ALTER TABLE public.teaching_sessions",
  "ADD CONSTRAINT ccp_session_student_owner_fk"
 ]) ok(sql.includes(marker),"Missing temporal invariant: "+marker);
 ok(types.includes("      workplace_enrollments: {"),"Temporal types missing");
});
test("credit entitlement adjustment history is append-only, tenant-owned and not another cash ledger",()=>{
 const name="credit_adjustment_events";
 ok(sql.includes("CREATE TABLE public."+name+" ("),"Missing event ledger");
 ok(manifest.baselineRequiredObjects.includes(name),"Missing event ledger manifest");
 ok(types.includes("      "+name+": {"),"Missing event ledger types");
 for(const marker of [
  "UNIQUE(teacher_id,approved_request_id)",
  "FOREIGN KEY(package_id,teacher_id,student_id)",
  "FOREIGN KEY(source_payment_id,teacher_id)",
  "credit_adjustment_kind_shape",
  "credit_adjustment_events_owner_read",
  "ALTER TABLE public.credit_adjustment_events ENABLE ROW LEVEL SECURITY",
  "GRANT SELECT,INSERT ON TABLE public.credit_adjustment_events TO service_role"
 ]) ok(sql.includes(marker),"Missing credit invariant: "+marker);
 ok(!sql.includes("GRANT INSERT ON TABLE public.credit_adjustment_events TO authenticated"));
 ok(!sql.includes("GRANT UPDATE ON TABLE public.credit_adjustment_events TO authenticated"));
});
