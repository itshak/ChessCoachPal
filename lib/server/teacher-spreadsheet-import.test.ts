import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {teacherSpreadsheetSuggest} from "@/lib/server/teacher-spreadsheet-import";

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
