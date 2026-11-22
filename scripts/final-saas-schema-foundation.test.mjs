import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("supabase/migrations/20261107000000_chesscoachpal_baseline.sql");
const types=read("lib/supabase/types.ts");
const manifest=JSON.parse(read("scripts/schema-transition-manifest.json"));
const tables=["capability_definitions","plan_versions","plan_capabilities","teacher_entitlement_state","teacher_entitlement_grants","entitlement_audit_events","account_usage_periods","account_usage_events","platform_billing_customers","platform_subscription_offers","platform_subscriptions","platform_billing_events","rating_providers","rating_categories",
"slot_occurrence_exceptions","report_publications","report_publication_audiences",
"session_amendment_events"];

test("ADR-0019 P0 foundation has one checked baseline and matching contracts",()=>{
 assert.equal(createHash("sha256").update(sql).digest("hex"),manifest.baselineSha256);
 for(const t of tables){
  assert.ok(sql.includes("CREATE TABLE public."+t+" ("),"missing SQL "+t);
  assert.ok(sql.includes("ALTER TABLE public."+t+" ENABLE ROW LEVEL SECURITY"),"missing RLS "+t);
  assert.ok(manifest.baselineRequiredObjects.includes(t),"missing manifest "+t);
  assert.ok(types.includes("      "+t+": {"),"missing TS row "+t);
 }
});
test("platform authority is not writable through teacher REST or anonymous",()=>{
 for(const t of tables){
  assert.ok(!new RegExp("GRANT\\s+(?:ALL|INSERT|UPDATE|DELETE)\\s+ON\\s+(?:TABLE\\s+)?public\\."+t+"\\s+TO\\s+authenticated","i").test(sql),
   "raw teacher mutation granted for "+t);
 }
 for(const marker of [
  "ccp_plan_capability_typed","ccp_entitlement_grant_shape",
  "UNIQUE(teacher_id,capability_key,request_id)",
  "UNIQUE(provider,merchant_scope,external_subscription_id)",
  "UNIQUE(provider,merchant_scope,external_event_id)",
  "ccp_platform_event_applied",
  "ccp_usage_period_window",
  "signature_verified_at timestamptz NOT NULL",
 ])assert.ok(sql.includes(marker),"missing required invariant "+marker);
});


test("ADR-0019 final cross-domain safety invariants and one SQL authority",()=>{
 for(const marker of [
  "ccp_effective_capability","ccp_entitlement_summary",
  "ccp_student_capacity_guard","ccp_professional_workplace_capacity_guard",
  "ccp_one_personal_workplace","ccp_provision_personal_workplace",
  "ccp_rating_snapshot_registered_category",
  "ccp_rating_evidence_truth","ccp_material_stage_teacher_evidence",
  "ccp_observation_teacher_verified_stage",
  "ccp_current_slot_occurrence_exception","ccp_slot_exception_immutable_guard",
  "ccp_report_audience_scope_guard",
  "ccp_report_publication_immutable_guard","ccp_report_audience_immutable_guard",
  "ccp_session_amendment_capture",
  "ccp_published_plan_guard","ccp_plan_capability_guard",
  "ccp_capability_definition_contract_guard",
  "ccp_grant_immutable_guard","ccp_usage_period_nonoverlap","ccp_apply_account_usage_event",
  "ccp_subscription_order_guard","ccp_entitlement_grant_serialize",
  "ccp_report_not_self_superseded",
 ])assert.ok(sql.includes(marker),"Missing schema contract "+marker);
 assert.match(sql,/ccp_session_amendment_immutable BEFORE UPDATE OR DELETE/);
 assert.match(sql,/g\.issued_at IS NULL[\s\S]*g\.token_digest IS NULL/);
 assert.match(sql,/p\.student_id IS DISTINCT FROM g\.student_id/);
 assert.match(sql,/p\.workplace_id IS DISTINCT FROM g\.workplace_id/);
 for(const obsolete of [
  '"hosted_plan" "text"', 'ADD COLUMN hosted_enforced',
  'ADD COLUMN hosted_max_active_students',
  'ADD COLUMN active_student_count',
  '"stripe_subscription_id" "text"',
  '"stripe_customer_id" "text"',
  'ccp_demote_expired_hosted_plan',
  'ccp_enforce_hosted_teacher_origin',
 ])assert.ok(!sql.includes(obsolete),"Obsolete dual authority "+obsolete);
 for(const pathMarker of [
  "capability_definitions", "rating_categories", "report_publications",
  "session_amendment_events",
 ])assert.ok(types.includes("      "+pathMarker+": {"),"Missing TypeScript "+pathMarker);
});


test("referenced capability contracts and plan publication serialize",()=>{
 assert.match(sql,/SELECT lifecycle INTO v_lifecycle FROM public\.plan_versions\s+WHERE id=v_version FOR UPDATE/);
 assert.match(sql,/CREATE TRIGGER ccp_capability_definition_contract_guard\s+BEFORE UPDATE OR DELETE ON public\.capability_definitions/);
 assert.match(sql,/v_referenced AND[\s\S]*NEW\.active IS DISTINCT FROM OLD\.active/);
});


/** SCH-07: every privileged helper has a fixed execution boundary. */
test("every canonical SECURITY DEFINER has pinned path and public revoke",()=>{
 const re=/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s*\(/gi;
 let inspected=0;
 for(const match of sql.matchAll(re)){
  const header=sql.slice(match.index,match.index+3500)
   .split(/\bAS\s+\$[a-zA-Z0-9_]*\$/i)[0];
  if(!/SECURITY\s+DEFINER/i.test(header))continue;
  inspected++;
  const name=match[1]??match[2];
  assert.match(name,/^[a-z_][a-z0-9_]*$/i);
  assert.match(header,/SET\s+(?:"search_path"|search_path)\s*(?:=|TO)/i,
   name+" must pin search_path");
  const revoked=new RegExp('REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+(?:"?public"?\\.)?"?'+name+'"?\\s*\\(','i');
  assert.match(sql,revoked,name+" must revoke public EXECUTE");
 }
 assert.ok(inspected>=100,"all privileged SQL functions were scanned");
});
