import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";

test("direct authenticated family delete cannot detach a newly linked student",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="guardian-delete-"+randomUUID()+"@example.com";
 const password="SyntheticGuardianDelete-123!";
 const {data:identity,error:identityError}=await admin.auth.admin.createUser({
   email,password,email_confirm:true,
 });
 expect(identityError).toBeNull();
 const teacherId=identity.user!.id;
 try {
   expect((await admin.from("teachers").insert({
     id:teacherId,email,display_name:"Guardian delete guard",hosted_enforced:false,
   })).error).toBeNull();
   const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
     auth:{persistSession:false,autoRefreshToken:false},
   });
   expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
   const {data:family,error:familyError}=await auth.from("guardians")
     .insert({teacher_id:teacherId,name:"Guarded family",portal_token:randomUUID()})
     .select("id").single();
   expect(familyError).toBeNull();
   const {data:student,error:studentError}=await auth.from("students")
     .insert({teacher_id:teacherId,name:"Linked after preview"})
     .select("id").single();
   expect(studentError).toBeNull();
   const preview=await auth.from("students").select("id",{head:true,count:"exact"})
     .eq("guardian_id",family!.id);
   expect(preview.count).toBe(0);
   expect((await auth.from("students").update({guardian_id:family!.id})
     .eq("id",student!.id)).error).toBeNull();
   const blocked=await auth.from("guardians").delete().eq("id",family!.id);
   expect(blocked.error?.code).toBe("23503");
   const current=await auth.from("students").select("guardian_id")
     .eq("id",student!.id).single();
   expect(current.data?.guardian_id).toBe(family!.id);
   expect((await auth.from("students").update({guardian_id:null})
     .eq("id",student!.id)).error).toBeNull();
   expect((await auth.from("guardians").delete().eq("id",family!.id)).error).toBeNull();
 }finally {
   await admin.auth.admin.deleteUser(teacherId);
 }
});
