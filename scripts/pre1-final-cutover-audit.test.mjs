import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {finalCutoverIssues} from "./pre1-final-cutover-audit.mjs";
const baseline=`CREATE TABLE public.contacts (id uuid);\nCREATE TABLE public.student_contacts (id uuid);\nCREATE TABLE public.billing_accounts (id uuid);\nCREATE TABLE public.portal_access_grants (id uuid);`;
const valid={baseline,migrationFiles:["20261107000000_chesscoachpal_baseline.sql"],
  paths:["app/(teacher)/contacts"],runtimeSources:{"app/api/contacts/route.ts":"from(\"contacts\")"},
  catalog:'{"tool":"ccp_contacts_create"}'};
describe("ADR-0017 single final-cutover source gate",()=>{
 it("accepts one new baseline and current scoped contacts/portal model",()=>{
   assert.deepEqual(finalCutoverIssues(valid),[]);
 });
 it("rejects live intermediate migration chain and legacy physical tables",()=>{
   const issues=finalCutoverIssues({...valid,
     baseline:baseline+'\nCREATE TABLE IF NOT EXISTS "public"."guardians" (id uuid, guardian_id uuid);\nCREATE TABLE public.studio_policies (id uuid);',
     migrationFiles:[...valid.migrationFiles,"20261118180000_contacts_identity_foundation.sql"]});
   assert.match(issues.join("\n"),/only final canonical baseline/);
   assert.match(issues.join("\n"),/inherited guardian\/studio tables/);
   assert.match(issues.join("\n"),/old guardian_id\/studio_policies names/);
 });
 it("rejects old SQL guardian routines and unscoped household portal tokens",()=>{
   const issues=finalCutoverIssues({...valid,
     baseline:baseline+'\nCREATE OR REPLACE FUNCTION public.ccp_guardian_save() RETURNS void AS $ BEGIN END $ LANGUAGE plpgsql;\nALTER TABLE public.students ADD COLUMN portal_token text;'});
   assert.match(issues.join("\n"),/obsolete guardian\/Family\/Studio SQL routines/);
   assert.match(issues.join("\n"),/legacy household portal_token/);
 });
 it("rejects direct calls to obsolete guardian RPCs without table references",()=>{
   const issues=finalCutoverIssues({...valid,
     runtimeSources:{"lib/server/transitional.ts":'db.rpc("ccp_guardian_save_replay", {});'}});
   assert.match(issues.join("\n"),/legacy guardian_id\/studio_policies\/guardians storage/);
 });
 it("rejects old family routes, guardian database readers and MCP contracts",()=>{
   const issues=finalCutoverIssues({...valid,
     paths:["app/(teacher)/families","app/api/guardians/route.ts"],
     runtimeSources:{"lib/server/old.ts":'db.from("guardians"); x.guardian_id; studio_policies'},
     catalog:'{"name":"ccp_guardians_list"}'});
   assert.match(issues.join("\n"),/Obsolete Family\/Studio\/guardian route/);
   assert.match(issues.join("\n"),/legacy guardian_id/);
   assert.match(issues.join("\n"),/obsolete Family\/Studio\/guardian MCP/);
 });
});
