import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {teacherProfileUpdate,TeacherProfileError} from "@/lib/server/teacher-profile-service";

describe("teacher profile identity boundary",()=>{
 it("fails closed on credentials, email, MFA and unexpected fields before any database query",async()=>{
   let queries=0;
   const db={
     from(){queries++;throw new Error("Database should not be touched");},
   } as unknown as SupabaseClient;
   for(const forbidden of [
     {email:"attacker@example.com"},
     {password:"unsafe"},
     {mfaFactorId:"factor"},
     {displayName:"Coach",email:"attacker@example.com"},
     {displayName:"Coach",arbitrary:true},
   ]){
     await expect(teacherProfileUpdate(db,"teacher-id",forbidden as never))
       .rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
   }
   expect(queries).toBe(0);
 });
 it("keeps normal field validation for intended browser and MCP updates",async()=>{
   let queries=0;
   const db={
     from(){queries++;throw new Error("Database should not be touched");},
   } as unknown as SupabaseClient;
   await expect(teacherProfileUpdate(db,"teacher-id",{displayName:" "}))
     .rejects.toBeInstanceOf(TeacherProfileError);
   await expect(teacherProfileUpdate(db,"teacher-id",{avatarUrl:"https://example.com/evil.png"}))
     .rejects.toMatchObject({code:"VALIDATION_ERROR"});
   expect(queries).toBe(0);
 });
});
