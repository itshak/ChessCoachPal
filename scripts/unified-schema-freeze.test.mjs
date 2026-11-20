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
