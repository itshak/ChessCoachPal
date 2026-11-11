import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {
 calendarAttendanceWrite,calendarAttendanceBulk,calendarLessonNoteWrite,
} from "@/lib/server/legacy-attendance-service";

function fakeAttendanceDb(writes:Record<string,unknown>[]){
 return {
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
    return {upsert(row:Record<string,unknown>){
     writes.push(row);
     return {
      select(){return {single:async()=>({data:row,error:null})};},
      then(resolve:(r:{error:null})=>unknown){
       return Promise.resolve({error:null}).then(resolve);
      },
     };
    }};
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
 it("rejects invalid email origin before saving private or family lesson notes",async()=>{
  const writes:Record<string,unknown>[]=[];
  await expect(calendarLessonNoteWrite(fakeAttendanceDb(writes),"teacher-one",
   "lesson-one",{body:"Reviewing the rook endgame",sendEmail:true},noOrigin))
   .rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
  expect(writes).toHaveLength(0);
 });
});
