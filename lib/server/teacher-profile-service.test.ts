import {describe,expect,it,vi} from "vitest";
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


describe("mail-language metadata mirrors validated teacher language without sending email",()=>{
 it("syncs user_metadata only after a successful teacher-scoped update",async()=>{
   const updateUser=vi.fn(async()=>({error:null}));
   const maybeSingle=vi.fn(async()=>({data:{id:"teacher-id"},error:null}));
   const chain={
     eq(){return this;},select(){return this;},maybeSingle,
   };
   const db={auth:{updateUser},from:()=>({update:()=>chain})} as unknown as SupabaseClient;
   await expect(teacherProfileUpdate(db,"teacher-id",{preferredLocale:"ru"}))
     .resolves.toEqual({ok:true});
   expect(updateUser).toHaveBeenCalledExactlyOnceWith({data:{preferred_locale:"ru"}});
 });
 it("never touches auth or stored profile for unsupported locale",async()=>{
   const updateUser=vi.fn();const from=vi.fn();
   const db={auth:{updateUser},from} as unknown as SupabaseClient;
   await expect(teacherProfileUpdate(db,"teacher-id",{preferredLocale:"de"}))
     .rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
   expect(updateUser).not.toHaveBeenCalled();expect(from).not.toHaveBeenCalled();
 });
});
