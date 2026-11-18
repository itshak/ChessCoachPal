import {test} from "node:test";
import {deepStrictEqual,ok} from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {calculateTransitionChecksum,transitionContractErrors} from "./schema-transition-contract.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const manifest=JSON.parse(readFileSync(join(root,"scripts/schema-transition-manifest.json"),"utf8"));
const sql=readFileSync(join(root,"supabase/migrations",manifest.baseline),"utf8");
const sqlFiles=readdirSync(join(root,"supabase/migrations")).filter(file=>file.endsWith(".sql")).sort();
const transitionSources=Object.fromEntries(manifest.transitions.map(item=>
  [item.file,readFileSync(join(root,"supabase/migrations",item.file),"utf8")]));
const input={sqlFiles,sql,manifest,transitionSources};
test("ADR-0015 exact checked-in baseline and four ordered transitions are approved",()=>{
  deepStrictEqual(transitionContractErrors(input),[]);
  ok(manifest.transitions.every(item=>item.requiresVerifiedRestore));
  deepStrictEqual(manifest.transitions.map(x=>x.file),sqlFiles.slice(1));
});
test("ADR-0015 must review baseline edits, not just new migrations",()=>{
  const errors=transitionContractErrors({...input,sql:sql+"\n-- changed without review"});
  ok(errors.some(x=>x.includes("baseline SQL changed")));
});
test("ADR-0015 rejects unreviewed transition edits even when name is unchanged",()=>{
  const mutated={...transitionSources,[manifest.transitions[0].file]:
    transitionSources[manifest.transitions[0].file]+"\n-- unreviewed edit"};
  ok(transitionContractErrors({...input,transitionSources:mutated})
    .some(x=>x.includes("checksum mismatch")));
});
test("ADR-0015 rejects unlisted files and wrong ordering",()=>{
  for(const files of [
    [...sqlFiles,"20261119000000_unsafe.sql"],
    [sqlFiles[0],sqlFiles[2],sqlFiles[1],...sqlFiles.slice(3)],
    [sqlFiles[0],sqlFiles[1],sqlFiles[4]],
  ]){
    ok(transitionContractErrors({...input,sqlFiles:files})
      .some(x=>x.includes("unsupported migration order")));
  }
});
test("ADR-0015 rejects missing transition-owned objects from a reviewed snapshot",()=>{
  const missing=sql.replace(/CREATE TABLE IF NOT EXISTS public\.student_rating_snapshots[\s\S]*?\);/,
    "CREATE TABLE IF NOT EXISTS public.student_rating_snapshots(id uuid);");
  // Explicit deletion must be rejected even if someone updates the baseline hash.
  const withoutHistorical=sql.replace(/CREATE TABLE public\.ccp_historical_import_stages\s*\(/,
    "CREATE TABLE public.ccp_unreviewed_history_stages(");
  ok(withoutHistorical!==sql);
  const fake={...manifest,baselineSha256:calculateTransitionChecksum(withoutHistorical)};
  ok(transitionContractErrors({...input,sql:withoutHistorical,manifest:fake})
    .some(x=>x.includes("ccp_historical_import_stages")));
  ok(missing!==sql);
});
test("ADR-0015 disallows manifest edits without required safety approvals",()=>{
  const incomplete={...manifest,transitions:manifest.transitions.map((item,i)=>
    i===1?{...item,requiresVerifiedRestore:false}:item)};
  ok(transitionContractErrors({...input,manifest:incomplete})
    .some(x=>x.includes("metadata incomplete")));
});
test("ADR-0015 historic permitted prefixes still exclude out-of-order upgrades",()=>{
  for(const files of manifest.historicalAllowedSequences){
    deepStrictEqual(transitionContractErrors({...input,sqlFiles:[manifest.baseline,...files]}),[]);
  }
});
