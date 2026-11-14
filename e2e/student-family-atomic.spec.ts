import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";

/** Real authenticated SQL rollback: family creation succeeds inside the
 * function, then the student-capacity trigger fails. Neither partial family
 * nor student may survive the transaction. No service-role mutation is used
 * for the RPC itself.
 */
test("atomic full student-family create rolls back orphan guardians on hosted capacity failure",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="student-atomic-"+randomUUID()+"@example.com";
 const password="SyntheticStudentAtomic-123!";
 const created=await admin.auth.admin.createUser({
   email,password,email_confirm:true,
 });
 expect(created.error).toBeNull();
 const teacherId=created.data.user!.id;
 try{
   const teacher=await admin.from("teachers").insert({
     id:teacherId,email,display_name:"Atomic family student teacher",
     hosted_enforced:true,hosted_plan:"free",
     hosted_max_active_students:1,active_student_count:0,
   });
   expect(teacher.error).toBeNull();
   const occupant=await admin.from("students").insert({
     teacher_id:teacherId,name:"Student occupying the only active slot",
   });
   expect(occupant.error).toBeNull();

   const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
     auth:{persistSession:false,autoRefreshToken:false},
   });
   expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
   const suffix=randomUUID();
   const familyName="Should not survive "+suffix;
   const studentName="Should not be created "+suffix;
   const refused=await auth.rpc("ccp_student_create_full",{
     p_name:studentName,p_birthdate:"2018-01-01",
     p_level:"Beginner",p_teacher_notes:"",
     p_guardian_id:null,p_contact_email:"synthetic-"+suffix+"@example.com",
     p_contact_phone:null,p_contact_name:familyName,
     p_adult_self:false,p_request_id:randomUUID(),
   });
   expect(refused.error).not.toBeNull();
   expect(refused.error?.message).toContain("HOSTED_LIMIT_REACHED");

   const guardianCheck=await admin.from("guardians").select("id")
     .eq("teacher_id",teacherId).eq("name",familyName);
   const studentCheck=await admin.from("students").select("id")
     .eq("teacher_id",teacherId).eq("name",studentName);
   expect(guardianCheck.error).toBeNull();
   expect(studentCheck.error).toBeNull();
   expect(guardianCheck.data).toEqual([]);
   expect(studentCheck.data).toEqual([]);
   const counted=await admin.from("teachers").select("active_student_count")
     .eq("id",teacherId).single();
   expect(counted.error).toBeNull();
   expect(counted.data?.active_student_count).toBe(1);
 }finally{
   await admin.auth.admin.deleteUser(teacherId);
 }
});
