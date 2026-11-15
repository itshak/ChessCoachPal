import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {unsafeMigrationPushes} from "./supabase-push-target-guard.mjs";

describe("migration target guard",()=>{
 it("refuses implicit db push defaults",()=>{
   assert.equal(unsafeMigrationPushes("supabase db push").length,1);
   assert.equal(unsafeMigrationPushes("npx supabase db push").length,1);
 });
 it("accepts explicit local and verified remote targets",()=>{
   assert.deepEqual(unsafeMigrationPushes("supabase db push --local"),[]);
   assert.deepEqual(unsafeMigrationPushes(
     'test -n "$SUPABASE_PROJECT_REF" && supabase db push --remote'),[]);
 });
 it("rejects remote push without selected project reference",()=>{
   assert.equal(unsafeMigrationPushes("supabase db push --remote").length,1);
 });
 it("ignores shell and JavaScript comments",()=>{
   assert.deepEqual(unsafeMigrationPushes("# supabase db push\n// supabase db push"),[]);
 });
});
