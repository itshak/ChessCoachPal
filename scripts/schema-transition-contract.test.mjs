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
const input={sqlFiles,sql,manifest};
test("ADR-0017 one exact current baseline is required for a clean install",()=>{
  deepStrictEqual(transitionContractErrors(input),[]);
  deepStrictEqual(sqlFiles,[manifest.baseline]);
  ok(manifest.operatorCutoverRequired);
});
test("ADR-0017 changed baseline requires explicit reviewed digest",()=>{
  ok(transitionContractErrors({...input,sql:sql+'\n-- changed without review'})
    .some(x=>x.includes("checksum update")));
});
test("ADR-0017 staged migration files are forbidden, even in historic order",()=>{
  for(const files of [
    [...sqlFiles,"20261117000000_live_historical_lifecycle_extension.sql"],
    [...sqlFiles,"20261118180000_contacts_identity_foundation.sql"],
    ["20261118180000_contacts_identity_foundation.sql",...sqlFiles],
  ])ok(transitionContractErrors({...input,sqlFiles:files})
    .some(x=>x.includes("ONLY the canonical baseline")));
});
test("ADR-0017 no per-feature upgrade metadata or missing operator gate allowed",()=>{
  for(const changed of [
    {...manifest,transitions:[]},
    {...manifest,historicalAllowedSequences:[[]]},
    {...manifest,operatorCutoverRequired:false},
    {...manifest,mode:"staged-upgrade"},
  ])ok(transitionContractErrors({...input,manifest:changed})
    .some(x=>x.includes("one-baseline manifest")));
});
test("ADR-0017 missing required final schema object fails even with matching checksum",()=>{
  const deleted=sql.replace(/CREATE TABLE public\.portal_event_invitations\s*\(/,
    'CREATE TABLE public.unreviewed_other_invitations (');
  ok(deleted!==sql);
  const fake={...manifest,baselineSha256:calculateTransitionChecksum(deleted)};
  ok(transitionContractErrors({...input,sql:deleted,manifest:fake})
    .some(x=>x.includes("portal_event_invitations")));
});
