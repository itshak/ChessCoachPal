import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("supabase/migrations/20261107000000_chesscoachpal_baseline.sql");
const types=read("lib/supabase/types.ts");
const manifest=JSON.parse(read("scripts/schema-transition-manifest.json"));
const tables=["capability_definitions","plan_versions","plan_capabilities","teacher_entitlement_state","teacher_entitlement_grants","entitlement_audit_events","account_usage_periods","account_usage_events","platform_billing_customers","platform_subscription_offers","platform_subscriptions","platform_billing_events"];

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
