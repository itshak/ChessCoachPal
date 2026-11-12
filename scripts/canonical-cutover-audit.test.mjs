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

// Structural guard for canonical recurrence identity and privately scoped
// notes. Behavioral SQL/E2E evidence is still required before legacy deletion.
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const baseline=readFileSync(fileURLToPath(new URL(
 "../supabase/migrations/20261107000000_chesscoachpal_baseline.sql",import.meta.url
)),"utf8");
describe("canonical occurrence migration schema checkpoints",()=>{
 it("uses one slot/date identity and preserves the origin after moving a session",()=>{
  assert.match(baseline,/"slot_occurrence_date" "date"/);
  assert.match(baseline,/CREATE UNIQUE INDEX "teaching_sessions_slot_occurrence_unique"/);
  assert.match(baseline,/"teaching_sessions_slot_fkey"[\\s\\S]*?FOREIGN KEY \\("slot_id", "teacher_id"\\)[\\s\\S]*?ON DELETE SET NULL \\("slot_id"\\)/);
  assert.match(baseline,/"teaching_sessions_makeup_participant_fkey"[\\s\\S]*?"session_id", "student_id", "teacher_id"/);
 });
 it("scopes shared and teacher-private notes to sessions and frozen participants",()=>{
  assert.match(baseline,/CREATE TABLE IF NOT EXISTS "public"\\."session_notes"/);
  assert.match(baseline,/"private_body" "text" DEFAULT ''::"text" NOT NULL/);
  assert.match(baseline,/"session_notes_participant_fkey"/);
  assert.match(baseline,/"session_notes_teacher" ON "public"\\."session_notes"/);
  assert.match(baseline,/GRANT SELECT ON TABLE "public"\\."session_notes" TO "authenticated"/);
  assert.doesNotMatch(baseline,/GRANT ALL ON TABLE "public"\\."session_notes" TO "authenticated"/);
 });
});
