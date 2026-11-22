import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";

test("tenant-owned contact with historical student relationships cannot be deleted or reparented",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="contact-delete-"+randomUUID()+"@example.com";
 const password="SyntheticContactDelete-123!";
 const identity=await admin.auth.admin.createUser({
  email,password,email_confirm:true,
 });
 expect(identity.error).toBeNull();
 const teacherId=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id:teacherId,email,display_name:"Contact deletion guard",})).error).toBeNull();
  const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
  expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
  const {data:contact,error:contactError}=await auth.from("contacts").insert({
   teacher_id:teacherId,display_name:"Historically linked contact",
  }).select("id").single();
  expect(contactError).toBeNull();
  const {data:student,error:studentError}=await auth.from("students").insert({
   teacher_id:teacherId,name:"Student whose relationship must survive",
  }).select("id").single();
  expect(studentError).toBeNull();
  const {data:link,error:linkError}=await auth.from("student_contacts").insert({
   teacher_id:teacherId,student_id:student!.id,contact_id:contact!.id,
   relationship_label:"Former parent",is_legal_guardian:false,
   may_receive_messages:false,
  }).select("id").single();
  expect(linkError).toBeNull();
  const cannotDelete=await auth.from("contacts").delete().eq("id",contact!.id);
  expect(cannotDelete.error?.code).toBe("23503");
  const history=await auth.from("student_contacts").select("id,contact_id")
   .eq("id",link!.id).single();
  expect(history.error).toBeNull();
  expect(history.data?.contact_id).toBe(contact!.id);
  expect((await auth.from("student_contacts").update({
   active_to:new Date().toISOString().slice(0,10),
  }).eq("id",link!.id)).error).toBeNull();
  // Ending a relationship retains the historical FK; archive identity instead.
  expect((await auth.from("contacts").delete().eq("id",contact!.id)).error?.code)
   .toBe("23503");
  expect((await auth.from("contacts").update({status:"archived"})
   .eq("id",contact!.id)).error).toBeNull();
  const archived=await auth.from("contacts").select("status")
   .eq("id",contact!.id).single();
  expect(archived.data?.status).toBe("archived");
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
