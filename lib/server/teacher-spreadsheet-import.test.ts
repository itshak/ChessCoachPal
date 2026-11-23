import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {teacherSpreadsheetSuggest,teacherSpreadsheetCommit} from "@/lib/server/teacher-spreadsheet-import";

const noDb={} as SupabaseClient;
describe("external AI spreadsheet mapping privacy boundary",()=>{
 it("never reads an external provider key or sends row samples without explicit approval",async()=>{
  const sampleRows=[{Name:"A student",Email:"student@example.com"}];
  await expect(teacherSpreadsheetSuggest(noDb,"teacher",{
   headers:["Name","Email"],sampleRows,useAi:true,
  })).rejects.toMatchObject({status:400,code:"CONFIRMATION_REQUIRED"});
  await expect(teacherSpreadsheetSuggest(noDb,"teacher",{
   headers:["Name","Email"],sampleRows,useAi:true,confirmedExternal:false,
  })).rejects.toMatchObject({status:400,code:"CONFIRMATION_REQUIRED"});
 });
 it("keeps heuristic column mapping fully local and available without provider credentials",async()=>{
  const result=await teacherSpreadsheetSuggest(noDb,"teacher",{
   headers:["Student Name","Email"],sampleRows:[{Email:"private@example.com"}],
   useAi:false,
  });
  expect(result.warning).toBeNull();
  expect(result.mapping).toBeDefined();
 });
 it("rejects oversized, malformed or non-text samples before calling a provider",async()=>{
  for(const sampleRows of [
   Array.from({length:9},()=>({Name:"Student"})),
   [{Name:"x".repeat(513)}],
   [{Name:123} as unknown as Record<string,string>],
  ]){
   await expect(teacherSpreadsheetSuggest(noDb,"teacher",{
    headers:["Name"],sampleRows,useAi:true,confirmedExternal:true,
   })).rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
  }
 });
});

describe("spreadsheet workplace fail-closed contract",()=>{
 const body={rows:[{"Student Name":"Learner"}],mapping:{student_name:"Student Name"}};
 const mock=(workplaces:Array<{id:string;name:string}>)=>{
  let rpcCalls=0;
  const db={
   from:(table:string)=>{
    expect(table).toBe("workplaces");
    return {select:()=>({eq:()=>({is:()=>({order:()=>({order:async()=>({data:workplaces,error:null})})})})})};
   },
   rpc:async()=>{rpcCalls++;return {data:null,error:{message:"IMPORT_REVIEW_REQUIRED"}};},
  } as unknown as SupabaseClient;
  return {db,calls:()=>rpcCalls};
 };
 it("rejects a partially invalid spreadsheet instead of skipping pupils",async()=>{
  const {db,calls}=mock([{id:"a",name:"Yatmo"}]);
  const res=await teacherSpreadsheetCommit(db,"teacher",{
    rows:[{"Student Name":"Learner"},{"Student Name":"","Notes":"Needs review"}],
    mapping:{student_name:"Student Name"},
  });
  expect(res.status).toBe(422);
  expect((await res.json()).code).toBe("IMPORT_REVIEW_REQUIRED");
  expect(calls()).toBe(0);
 });
 it("requires explicit workplace when two choices exist; no writes",async()=>{
  const {db,calls}=mock([{id:"a",name:"Yatmo"},{id:"b",name:"Other"}]);
  const res=await teacherSpreadsheetCommit(db,"teacher",body);
  expect(res.status).toBe(422);
  expect((await res.json()).code).toBe("WORKPLACE_REQUIRED");
  expect(calls()).toBe(0);
 });
 it("requires workplace creation if no workplaces exist",async()=>{
  const {db,calls}=mock([]);
  const res=await teacherSpreadsheetCommit(db,"teacher",body);
  expect(res.status).toBe(422);
  expect(calls()).toBe(0);
 });
 it("rejects an unknown or foreign workplace after the receipt-only legacy check",async()=>{
  const {db,calls}=mock([{id:"a",name:"Yatmo"}]);
  const res=await teacherSpreadsheetCommit(db,"teacher",{...body,workplaceId:"b"});
  expect(res.status).toBe(422);
  expect((await res.json()).code).toBe("WORKPLACE_REQUIRED");
  expect(calls()).toBe(1); // Old arrays can only read an exact owned receipt in SQL.
 });
});
