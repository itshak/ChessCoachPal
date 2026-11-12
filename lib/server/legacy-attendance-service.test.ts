import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {
 calendarAttendanceWrite,calendarAttendanceBulk,calendarLessonNoteWrite,
} from "@/lib/server/legacy-attendance-service";

function fakeAttendanceDb(writes:Record<string,unknown>[]){
 return {
  async rpc(operation:string,args:Record<string,unknown>){
   if(operation!=="ccp_calendar_attendance_commit")
    throw new Error("Unexpected RPC "+operation);
   writes.push(args);
   return {data:{status:args.p_status,replayed:false},error:null};
  },
  from(table:string){
   if(table==="lessons"){
    const q={
     select(_fields:string){return q;},
     eq(_field:string,_value:unknown){return q;},
     maybeSingle:async()=>({data:{
      id:"lesson-one",student_id:"student-one",starts_at:"2099-01-01T10:00:00Z",
     },error:null}),
     in:async(_field:string,ids:string[])=>({data:ids.map(id=>({id})),error:null}),
    };
    return q;
   }
   if(table==="attendance"){
    const q={
     select(_columns:string){return q;},
     eq(_name:string,_value:string){return q;},
     maybeSingle:async()=>({data:null,error:null}),
     upsert(row:Record<string,unknown>){
      writes.push(row);
      return {then(resolve:(r:{error:null})=>unknown){
       return Promise.resolve({error:null}).then(resolve);
      }};
     },
    };
    return q;
   }
   throw new Error("Unexpected database table: "+table);
  },
 } as unknown as SupabaseClient;
}
const noOrigin={origin:""};

describe("legacy calendar external-message consent",()=>{
 it("does not silently notify on single teacher cancellation when flag is omitted",async()=>{
  const writes:Record<string,unknown>[]=[];
  const result=await calendarAttendanceWrite(fakeAttendanceDb(writes),"teacher-one",
   "lesson-one",{status:"teacher_cancel"},noOrigin);
  expect(result.emailed).toBe(false);
  expect(writes).toHaveLength(1);
 });
 it("rejects explicitly requested single cancellation mail before writing with no trusted origin",async()=>{
  const writes:Record<string,unknown>[]=[];
  await expect(calendarAttendanceWrite(fakeAttendanceDb(writes),"teacher-one",
   "lesson-one",{status:"teacher_cancel",notifyFamily:true},noOrigin))
   .rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
  expect(writes).toHaveLength(0);
 });
 it("does not silently notify on bulk cancellation with omitted flag",async()=>{
  const writes:Record<string,unknown>[]=[];
  const result=await calendarAttendanceBulk(fakeAttendanceDb(writes),"teacher-one",
   {ids:["lesson-one","lesson-two"],status:"teacher_cancel"},noOrigin);
  expect(result).toMatchObject({ok:true,succeeded:2,emailed:0,failed:[]});
  expect(writes).toHaveLength(2);
 });
 it("rejects requested bulk notification before writing without a trusted origin",async()=>{
  const writes:Record<string,unknown>[]=[];
  await expect(calendarAttendanceBulk(fakeAttendanceDb(writes),"teacher-one",
   {ids:["lesson-one"],status:"teacher_cancel",notifyFamily:true},noOrigin))
   .rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
  expect(writes).toHaveLength(0);
 });
 it("uses one authenticated SQL writer instead of direct attendance upsert",async()=>{
  const writes:Record<string,unknown>[]=[];
  const result=await calendarAttendanceWrite(fakeAttendanceDb(writes),"teacher-one",
    "lesson-one",{status:"attended",expectedMarkedAt:null,
     idempotencyKey:"00000000-0000-4000-8000-000000000011"},noOrigin);
  expect(result.status).toBe("attended");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
   p_lesson_id:"lesson-one",p_status:"attended",p_expected_marked_at:null,
   p_notify_family:false,p_idempotency_key:"00000000-0000-4000-8000-000000000011",
  });
 });
 it("rejects missing optimistic preconditions and nonreplayable cancellation notice",async()=>{
  const writes:Record<string,unknown>[]=[];
  await expect(calendarAttendanceWrite(fakeAttendanceDb(writes),"teacher-one",
   "lesson-one",{status:"attended",idempotencyKey:"00000000-0000-4000-8000-000000000012"},
   noOrigin)).rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
  await expect(calendarAttendanceWrite(fakeAttendanceDb(writes),"teacher-one",
   "lesson-one",{status:"student_cancel",expectedMarkedAt:null,
    idempotencyKey:"00000000-0000-4000-8000-000000000013",noticeChoice:"now"},
   noOrigin)).rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
  expect(writes).toHaveLength(0);
 });
 it("rejects email side effects unrelated to teacher cancellation",async()=>{
  const writes:Record<string,unknown>[]=[];
  await expect(calendarAttendanceWrite(fakeAttendanceDb(writes),"teacher-one",
   "lesson-one",{status:"attended",notifyFamily:true},{origin:"http://localhost:3000"}))
   .rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
  expect(writes).toHaveLength(0);
 });
 it("derives stable and independent per-lesson receipts for partial bulk retries",async()=>{
  const writes:Record<string,unknown>[]=[];
  const revisions={"lesson-one":null,"lesson-two":null};
  const payload={
   ids:["lesson-one","lesson-two"],status:"no_show" as const,
   idempotencyKey:"00000000-0000-4000-8000-000000000099",
   expectedMarkedAtByLesson:revisions,
  };
  const db=fakeAttendanceDb(writes);
  expect((await calendarAttendanceBulk(db,"teacher-one",payload,noOrigin)).succeeded).toBe(2);
  expect((await calendarAttendanceBulk(db,"teacher-one",payload,noOrigin)).succeeded).toBe(2);
  expect(writes).toHaveLength(4);
  expect(writes[0].p_idempotency_key).toBe(writes[2].p_idempotency_key);
  expect(writes[1].p_idempotency_key).toBe(writes[3].p_idempotency_key);
  expect(writes[0].p_idempotency_key).not.toBe(writes[1].p_idempotency_key);
  expect(writes.every(w=>w.p_notify_family===false)).toBe(true);
 });
 it("rejects a partial bulk retry precondition before writing anything",async()=>{
  const writes:Record<string,unknown>[]=[];
  await expect(calendarAttendanceBulk(fakeAttendanceDb(writes),"teacher-one",{
   ids:["lesson-one","lesson-two"],status:"no_show",
   idempotencyKey:"00000000-0000-4000-8000-000000000100",
   expectedMarkedAtByLesson:{"lesson-one":null},
  },noOrigin)).rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
  expect(writes).toHaveLength(0);
 });
 it("rejects invalid email origin before saving private or family lesson notes",async()=>{
  const writes:Record<string,unknown>[]=[];
  await expect(calendarLessonNoteWrite(fakeAttendanceDb(writes),"teacher-one",
   "lesson-one",{body:"Reviewing the rook endgame",sendEmail:true},noOrigin))
   .rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
  expect(writes).toHaveLength(0);
 });
});
