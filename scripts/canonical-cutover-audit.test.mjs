import {describe,it} from "node:test";
import {strict as assert} from "node:assert";
import {directOldSourceReferences,physicalLegacyTableDefinitions} from "./canonical-cutover-audit.mjs";
describe("canonical physical-model cutover audit",()=>{
 it("finds inherited physical tables including quoted schema",()=>{
  const sql=["lessons","attendance","lesson_notes"].map(x=>
   'CREATE TABLE IF NOT EXISTS "public"."'+x+'" (id uuid);').join("\n");
  assert.deepEqual(physicalLegacyTableDefinitions(sql),["lessons","attendance","lesson_notes"]);
 });
 it("does not mistake recurring intent for an actual occurrence",()=>{
  assert.deepEqual(physicalLegacyTableDefinitions("CREATE TABLE public.lesson_slots (id uuid);"),[]);
 });
 it("flags old readers, SQL and RPC references",()=>{
  const result=directOldSourceReferences([
   'db.from("lessons").select("*")',
   "db.from('attendance').select('id')",
   "SELECT * FROM public.lesson_notes",
   'db.rpc("ccp_calendar_attendance_commit",{})',
  ].join("\n"));
  for(const x of ["PostgREST lessons","PostgREST attendance","SQL lesson_notes","RPC ccp_calendar_attendance_commit"])
   assert(result.includes(x),x);
 });
 it("allows canonical tables, roster and slot intent",()=>{
  assert.deepEqual(directOldSourceReferences([
   'db.from("teaching_sessions")',
   'db.from("session_attendance")',
   "SELECT * FROM public.session_participants",
   'db.from("lesson_slots")',
  ].join("\n")),[]);
 });
});
