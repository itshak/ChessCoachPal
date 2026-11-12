import {describe,it,expect} from "vitest";
import {lessonCompletionSchema,attendanceBulkRecordSchema} from "./lesson-completion";

const a="00000000-0000-4000-8000-000000000001";
const b="00000000-0000-4000-8000-000000000002";
const revision="2056-07-01T10:00:00.000Z";
const values={
 sessionId:a,expectedUpdatedAt:revision,idempotencyKey:b,confirmed:true,
 attendance:[{studentId:a,status:"present",note:"",expectedUpdatedAt:revision}],
};

describe("explicit frozen-roster session completion contract",()=>{
 it("requires a complete, confirmed, revisioned student decision",()=>{
  expect(lessonCompletionSchema.safeParse(values).success).toBe(true);
  expect(lessonCompletionSchema.safeParse({...values,confirmed:false}).success).toBe(false);
  expect(lessonCompletionSchema.safeParse({...values,attendance:[]}).success).toBe(false);
  expect(lessonCompletionSchema.safeParse({...values,idempotencyKey:undefined}).success).toBe(false);
  expect(lessonCompletionSchema.safeParse({...values,expectedUpdatedAt:undefined}).success).toBe(false);
  expect(lessonCompletionSchema.safeParse({...values,attendance:[
   {...values.attendance[0],expectedUpdatedAt:undefined},
  ]}).success).toBe(false);
 });
 it("accepts a null revision only for an unmarked decision not yet stored",()=>{
  expect(lessonCompletionSchema.safeParse({...values,attendance:[
   {...values.attendance[0],expectedUpdatedAt:null},
  ]}).success).toBe(true);
  expect(lessonCompletionSchema.safeParse({...values,expectedUpdatedAt:null}).success).toBe(false);
 });
 it("requires a revisioned atomic batch with unique student IDs",()=>{
  const input={sessionId:a,idempotencyKey:b,attendance:[
   {...values.attendance[0],expectedUpdatedAt:null},
  ]};
  expect(attendanceBulkRecordSchema.safeParse(input).success).toBe(true);
  expect(attendanceBulkRecordSchema.safeParse({...input,attendance:[]}).success).toBe(false);
  expect(attendanceBulkRecordSchema.safeParse({...input,attendance:[
   input.attendance[0],input.attendance[0],
  ]}).success).toBe(false);
  expect(attendanceBulkRecordSchema.safeParse({...input,attendance:[
   {...input.attendance[0],expectedUpdatedAt:undefined},
  ]}).success).toBe(false);
 });
 it("does not infer success, mastery or learning from unmarked attendance",()=>{
  expect(lessonCompletionSchema.safeParse({...values,attendance:[
   {...values.attendance[0],status:"unmarked"},
  ]}).success).toBe(false);
  expect(lessonCompletionSchema.safeParse({...values,attendance:[
   {...values.attendance[0],status:"present",verifiedMastery:true},
  ]}).success).toBe(false);
 });
 it("rejects duplicate roster IDs and unknown fields",()=>{
  expect(lessonCompletionSchema.safeParse({...values,attendance:[
   values.attendance[0],{...values.attendance[0]},
  ]}).success).toBe(false);
  expect(lessonCompletionSchema.safeParse({...values,sessionChanged:true}).success).toBe(false);
 });
 it("requires cancellation notice provenance without contaminating presence decisions",()=>{
  const row=values.attendance[0];
  expect(lessonCompletionSchema.safeParse({...values,attendance:[
   {...row,status:"student_cancelled"},
  ]}).success).toBe(false);
  expect(lessonCompletionSchema.safeParse({...values,attendance:[
   {...row,status:"student_cancelled",noticeAt:revision,cancelReason:"Away"},
  ]}).success).toBe(true);
  expect(lessonCompletionSchema.safeParse({...values,attendance:[
   {...row,status:"teacher_cancelled",cancelReason:"Weather"},
  ]}).success).toBe(true);
  expect(lessonCompletionSchema.safeParse({...values,attendance:[
   {...row,status:"present",noticeAt:revision},
  ]}).success).toBe(false);
 });
});
