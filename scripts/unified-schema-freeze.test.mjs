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


test("unified canonical owner isolation and typed finance schema stays synchronized", () => {
  // This static check is complementary to authenticated tenant A/B and SQL
  // privilege tests; it does not certify enforcement or a populated DB cutover.
  const tenantTables = [
    "workplace_enrollments", "contacts", "student_contacts",
    "billing_accounts", "portal_access_grants",
    "student_federation_memberships", "student_rating_snapshots",
    "student_rating_sync_consents", "student_rating_refresh_jobs",
    "student_rating_refresh_receipts", "compensation_agreements",
    "financial_obligations", "received_payments", "payment_allocations",
    "financial_reversals", "credit_adjustment_events",
  ];
  for (const name of tenantTables) {
    const table = new RegExp(
      'CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:"?public"?\\.)?"?' +
      name + '"?\\s*\\(', "i",
    ).exec(sql);
    ok(table, "Missing canonical table " + name);
    ok(manifest.baselineRequiredObjects.includes(name),
      "Required-object manifest omits " + name);
    ok(types.includes("      " + name + ": {"),
      "TypeScript Database contract omits " + name);
    const declaration = sql.slice(table.index, table.index + 800);
    ok(/"?teacher_id"?\s+"?uuid"?\s+NOT\s+NULL/i.test(declaration),
      "Missing nonnullable tenant UUID on " + name);
    ok(new RegExp(
      'ALTER\\s+TABLE\\s+(?:"?public"?\\.)?"?' + name +
      '"?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY', "i",
    ).test(sql), "RLS not enabled for " + name);
    ok(new RegExp(
      'CREATE\\s+POLICY\\s+(?:"[^"]+"|\\w+)\\s+ON\\s+(?:"?public"?\\.)?"?' +
      name + '"?\\b', "i",
    ).test(sql), "No RLS policy for " + name);
  }
});

test("payer assignment SQL and TypeScript contracts reject unproven enrollment dates",()=>{
 const fn=sql.split("CREATE OR REPLACE FUNCTION public.ccp_billing_assignment_one_payer()")[1]
  ?.split("$ccp_billing_assignment_one_payer$;")[0];
 ok(fn,"Missing canonical payer assignment guard");
 for(const marker of [
  "public.ccp_finance_enrollment_period_lock",
  "STUDENT_PAYER_OUTSIDE_ENROLLMENT",
  "PAYER_ASSIGNMENT_IDENTITY_IMMUTABLE",
  "PAYER_ASSIGNMENT_CANNOT_EXTEND_HISTORY"
 ])ok(fn.includes(marker),"Payer guard missing "+marker);
 ok(types.includes("      student_billing_assignments: {"));
 ok(manifest.baselineRequiredObjects.includes("student_billing_assignments"));
 const service=read("lib/server/student-billing-assignments-service.ts");
 for(const marker of [
  'type Row=Omit<Database["public"]["Tables"]["student_billing_assignments"]["Row"],"teacher_id">',
  'PAYER_ENROLLMENT_RANGE_REQUIRED', '.eq("start_date_unknown",false)',
  '.is("cancelled_at",null)', '.lte("starts_on",x.effectiveFrom)'
 ])ok(service.includes(marker),"Payer service missing "+marker);
});

test("current students use the owned workplace day and exclude future, ended, cancelled and archived entries",()=>{
 const source=read("lib/server/workplace-student-scope.ts");
 for(const marker of [
  'db.from("workplaces").select("timezone")',
  '.eq("teacher_id",teacherId).eq("id",workplaceId).maybeSingle()',
  'toLocalDateString(new Date(),data.timezone)',
  'const today=await workplaceRosterDate(db,teacherId,workplaceId)',
  'if(!today)throw new Error("WORKPLACE_STUDENT_SCOPE_UNAVAILABLE")',
  '.is("cancelled_at",null)',
  'starts_on.is.null,starts_on.lte.',
  'ends_on.is.null,ends_on.gte.',
  '.is("archived_at",null)',
 ])ok(source.includes(marker),"Current workplace view missing "+marker);
});

test("student-specific compensation agreements require teacher-owned dated enrollment",()=>{
 const clause=sql.split("CREATE OR REPLACE FUNCTION public.ccp_compensation_agreement_no_overlap()")[1]
  ?.split("$ccp_compensation_agreement_no_overlap$;")[0];
 ok(clause,"Missing compensation guard");
 for(const marker of [
  "STUDENT_COMPENSATION_OUTSIDE_ENROLLMENT",
  "public.ccp_finance_enrollment_period_lock",
 ])ok(clause.includes(marker),"Compensation guard missing "+marker);
 const source=read("lib/server/compensation-agreements-service.ts");
 for(const marker of [
  "COMPENSATION_ENROLLMENT_RANGE_REQUIRED",
  '.is("cancelled_at",null)',
  '.lte("starts_on",value.effectiveFrom)',
  'membership=membership.is("ends_on",null)'
 ])ok(source.includes(marker),"Compensation service missing "+marker);
});

test("portal grants and dated scheduling reject out-of-period membership",()=>{
 for(const fn of ["ccp_scoped_portal_cancel","ccp_scoped_portal_rsvp"]){
  const body=sql.split("CREATE OR REPLACE FUNCTION public."+fn+"(")[1]
   ?.split("$"+fn+"$;")[0];
  ok(body,"Missing guest portal RPC "+fn);
  for(const marker of ["we.cancelled_at IS NULL","we.starts_on IS NULL","we.ends_on IS NULL"])
   ok(body.includes(marker),"Portal missing date-scoped membership "+fn+" "+marker);
 }
 const adhoc=sql.split("CREATE OR REPLACE FUNCTION public.ccp_teacher_ad_hoc_session_create(")[1];
 ok(adhoc?.includes("count(DISTINCT s.id)"));
 ok(adhoc?.includes("p_starts_at AT TIME ZONE"));
 const slots=sql.split("CREATE OR REPLACE FUNCTION public.ccp_canonical_slot_create(")[1];
 ok(slots?.includes("e.starts_on<=p_start_date"));
 ok(slots?.includes("p_end_date IS NULL AND e.ends_on IS NULL"));
 const privateLesson=sql.split("CREATE OR REPLACE FUNCTION public.ccp_canonical_private_session_create(")[1];
 ok(privateLesson?.includes("e.starts_on<=p_date"));
 ok(privateLesson?.includes("e.ends_on>=p_date"));
});

test("finance enrollment lock uses tenant-scoped security definer without granting direct membership edits",()=>{
 const helper=sql.split("CREATE OR REPLACE FUNCTION public.ccp_finance_enrollment_period_lock(")[1]
  ?.split("$ccp_finance_enrollment_period_lock$;")[0];
 ok(helper,"Missing scoped finance enrollment lock helper");
 for(const marker of [
  "SECURITY DEFINER","auth.role()='authenticated'",
  "auth.uid() IS DISTINCT FROM p_teacher_id",
  "e.start_date_unknown=false","e.cancelled_at IS NULL",
  "e.starts_on<=p_effective_from","FOR SHARE OF e",
 ])ok(helper.includes(marker),"Finance scoped lock missing "+marker);
 ok(sql.includes("REVOKE ALL ON FUNCTION public.ccp_finance_enrollment_period_lock("));
 ok(sql.includes("TO authenticated,service_role;"));
 ok(/REVOKE\s+UPDATE\s*,\s*DELETE\s+ON\s+public\.workplace_enrollments\s+FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated\s*;/i.test(sql),
  "Authenticated clients must not update or delete workplace enrollments directly");
});

test("first-class workplace/group/material tables have typed current-schema contracts",()=>{
 for(const name of ["workplaces","class_groups","group_enrollments","learning_materials"]){
  ok(new RegExp('CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:"?public"?\\.)?"?'+name+'"?\\s*\\(','i').test(sql),
   "Missing current physical table "+name);
  ok(types.includes("      "+name+": {"),"Missing typed domain table "+name);
  ok(new RegExp('ALTER\\s+TABLE\\s+(?:"?public"?\\.)?"?'+name+'"?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY','i').test(sql),
   "Missing RLS enablement "+name);
 }
});
