import {describe,it} from "node:test";
import {strict as assert} from "node:assert";
import {competingLessonModels} from "./canonical-lessons-guard.mjs";
const table=name=>`CREATE TABLE IF NOT EXISTS "public"."${name}" (id uuid);`;
describe("one canonical actual-lesson source of truth",()=>{
 it("blocks simultaneous legacy and coaching session/attendance writers",()=>{
  assert.equal(competingLessonModels([
   "lessons","attendance","teaching_sessions","session_attendance"
  ].map(table).join("\n")),true);
 });
 it("does not allow a partial cutover to leave an old notes or lesson table",()=>{
  for(const old of ["lessons","attendance","lesson_notes"]){
   assert.equal(competingLessonModels([
    "teaching_sessions","session_attendance",old
   ].map(table).join("\n")),true);
  }
 });
 it("accepts a fresh schema with only canonical sessions and roster attendance",()=>{
  assert.equal(competingLessonModels([
   "teaching_sessions","session_attendance","lesson_slots"
  ].map(table).join("\n")),false);
 });
 it("does not confuse recurrence intent with actual lessons",()=>{
  assert.equal(competingLessonModels([
   "lesson_slots","teaching_sessions","session_attendance"
  ].map(table).join("\n")),false);
 });
});
