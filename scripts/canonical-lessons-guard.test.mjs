import {describe,it} from "node:test";
import {strict as assert} from "node:assert";
import {competingLessonModels,canonicalOccurrenceSchemaErrors,hasLessonTable} from "./canonical-lessons-guard.mjs";
const table=(name,mode="quoted")=>mode==="quoted"
 ? 'CREATE TABLE IF NOT EXISTS "public"."'+name+'" (id uuid);'
 : "CREATE TABLE public."+name+" (id uuid);";
const required=["teaching_sessions","session_participants","session_attendance"];
describe("one actual-lesson source of truth",()=>{
 it("blocks simultaneous legacy and canonical physical models",()=>{
  assert.equal(competingLessonModels(["lessons","attendance",...required].map(table).join("\n")),true);
 });
 it("blocks even a partial old-table cutover",()=>{
  for(const old of ["lessons","attendance","lesson_notes"])
   assert.equal(competingLessonModels([...required,old].map(table).join("\n")),true);
 });
 it("accepts only the complete canonical trio and recurring intent",()=>{
  const sql=[...required,"lesson_slots"].map(table).join("\n");
  assert.equal(competingLessonModels(sql),false);
  assert.deepEqual(canonicalOccurrenceSchemaErrors(sql),[]);
 });
 it("detects unquoted public table declarations without false positives",()=>{
  assert.equal(hasLessonTable(table("lessons","unquoted"),"lessons"),true);
  assert.equal(hasLessonTable(table("lesson_slots","unquoted"),"lessons"),false);
  assert.equal(competingLessonModels(["lessons",...required].map(x=>table(x,"unquoted")).join("\n")),true);
 });
 it("fails closed if s¶»§q«^