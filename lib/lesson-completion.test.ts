import {describe,it,expect} from "vitest";
import {lessonCompletionSchema} from "./lesson-completion";

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
});
