import {createHash,randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

function syntheticAdmin(){
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
}
async function syntheticTeacher(admin:ReturnType<typeof syntheticAdmin>){
 const email="freeze-"+randomUUID()+"@example.com";
 const password="FreezeSchemaSynthetic123!";
 const identity=await admin.auth.admin.createUser({
  email,password,email_confirm:true,
 });
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 const teacher=await admin.from("teachers").insert({
  id,email,display_name:"Synthetic schema-freeze account",
 });
 expect(teacher.error).toBeNull();
 return {id,email,password};
}
function studio(name:string,teacherId:string){
 return {teacher_id:teacherId,name,
  timezone:"UTC",currency:"USD",locale:"en",
  kind:"professional",policy:{}};
}

/** ENT-11: The Personal workplace cannot occupy or evade professional slots. */
test("professional workplace quota serializes, archives and restores without bypass",async()=>{
 const admin=syntheticAdmin();
 const teacher=await syntheticTeacher(admin);
 try{
  await configureSyntheticStudentCapacity(admin,teacher.id,2,1);
  const personal=await admin.from("workplaces")
   .select("id,kind,archived_at").eq("teacher_id",teacher.id)
   .eq("kind","personal").single();
  expect(personal.error).toBeNull();
  expect(personal.data?.archived_at).toBeNull();
  const attempts=await Promise.all([0,1,2,3].map(i=>
   admin.from("workplaces").insert(studio(
    "Concurrent professional "+i+" "+randomUUID(),teacher.id))
     .select("id").single()
  ));
  const winners=attempts.filter(x=>!x.error);
  const blocked=attempts.filter(x=>x.error);
  expect(winners).toHaveLength(1);
  expect(blocked).toHaveLength(3);
  for(const denied of blocked){
   expect(denied.error?.code).toBe("23514");
   expect(denied.error?.message).toContain("CAPACITY_EXCEEDED");
  }
  const original=winners[0].data!.id as string;
  const personalArchive=await admin.from("workplaces")
   .update({archived_at:new Date().toISOString()})
   .eq("id",personal.data!.id);
  expect(personalArchive.error?.message).toContain("PERSONAL_WORKPLACE_REQUIRED");
  const archived=await admin.from("workplaces")
   .update({archived_at:new Date().toISOString()}).eq("id",original);
  expect(archived.error).toBeNull();
  const replacement=await admin.from("workplaces")
   .insert(studio("Replacement "+randomUUID(),teacher.id))
   .select("id").single();
  expect(replacement.error).toBeNull();
  const reactivation=await admin.from("workplaces")
   .update({archived_at:null}).eq("id",original);
  expect(reactivation.error?.message).toContain("CAPACITY_EXCEEDED");
  const state=await admin.from("teacher_entitlement_state")
   .select("active_professional_workplace_count")
   .eq("teacher_id",teacher.id).single();
  expect(state.error).toBeNull();
  expect(state.data?.active_professional_workplace_count).toBe(1);
 }finally{
  expect((await admin.auth.admin.deleteUser(teacher.id)).error).toBeNull();
 }
});

/** RAT-01: a newly approved federation/category needs only registry rows, no DDL. */
test("rating registry accepts a new national provider but rejects unregistered categories",async()=>{
 const admin=syntheticAdmin();
 const teacher=await syntheticTeacher(admin);
 const code="x"+randomUUID().replaceAll("-","");
 try{
  const provider=await admin.from("rating_providers").insert({
   code,provider_kind:"federation",display_name:"Synthetic national federation",
  });
  expect(provider.error).toBeNull();
  const category=await admin.from("rating_categories").insert({
   provider_code:code,code:"standard",display_name:"National Standard",
  });
  expect(category.error).toBeNull();
  const student=await admin.from("students").insert({
   teacher_id:teacher.id,name:"Synthetic national player "+randomUUID(),
  }).select("id").single();
  expect(student.error).toBeNull();
  const newRating=await admin.from("student_rating_snapshots").insert({
   teacher_id:teacher.id,student_id:student.data!.id,
   provider:code,time_control:"standard",rating:1624,
   source:"teacher_manual",observed_at:new Date().toISOString(),
   request_id:randomUUID(),verification_state:"unverified",
  }).select("id").single();
  expect(newRating.error).toBeNull();
  const invalid=await admin.from("student_rating_snapshots").insert({
   teacher_id:teacher.id,student_id:student.data!.id,
   provider:code,time_control:"unregistered",rating:1700,
   source:"teacher_manual",observed_at:new Date().toISOString(),
   request_id:randomUUID(),verification_state:"unverified",
  });
  expect(invalid.error?.code).toBe("23503");
 }finally{
  expect((await admin.auth.admin.deleteUser(teacher.id)).error).toBeNull();
 }
});

/** TCH-03/04: a report is shareable only to the exact student and workplace of
 * an active explicitly-scoped guest grant; no relative or payer is inferred. */
test("report audience scope rejects other children and revoked guest grants",async()=>{
 const admin=syntheticAdmin();
 const teacher=await syntheticTeacher(admin);
 try{
  const workplace=await admin.from("workplaces")
   .select("id").eq("teacher_id",teacher.id).eq("kind","personal").single();
  expect(workplace.error).toBeNull();
  const studentA=await admin.from("students").insert({
   teacher_id:teacher.id,name:"Student A "+randomUUID(),
  }).select("id").single();
  const studentB=await admin.from("students").insert({
   teacher_id:teacher.id,name:"Student B "+randomUUID(),
  }).select("id").single();
  expect(studentA.error).toBeNull();
  expect(studentB.error).toBeNull();
  const contactA=await admin.from("contacts").insert({
   teacher_id:teacher.id,display_name:"Reviewer A "+randomUUID(),
  }).select("id").single();
  const contactB=await admin.from("contacts").insert({
   teacher_id:teacher.id,display_name:"Reviewer B "+randomUUID(),
  }).select("id").single();
  expect(contactA.error).toBeNull();
  expect(contactB.error).toBeNull();
  const future=new Date(Date.now()+86400000*30).toISOString();
  const grant=async(contactId:string,studentId:string)=>{
   const row=await admin.from("portal_access_grants").insert({
    teacher_id:teacher.id,contact_id:contactId,student_id:studentId,
    workplace_id:workplace.data!.id,permissions:["shared_notes"],
    expires_at:future,
   }).select("id").single();
   expect(row.error).toBeNull();
   return row.data!.id as string;
  };
  const grantA=await grant(contactA.data!.id,studentA.data!.id);
  const grantB=await grant(contactB.data!.id,studentB.data!.id);
  const publish=async()=>{
   const row=await admin.from("report_publications").insert({
    teacher_id:teacher.id,student_id:studentA.data!.id,
    workplace_id:workplace.data!.id,
    snapshot_digest:createHash("sha256").update(randomUUID()).digest("hex"),
    snapshot_storage_ref:"synthetic-reports/"+randomUUID(),
    output_locale:"en",approved_by:teacher.id,
    approved_at:new Date().toISOString(),request_id:randomUUID(),
   }).select("id").single();
   expect(row.error).toBeNull();
   return row.data!.id as string;
  };
  const publication=await publish();
  const denied=await admin.from("report_publication_audiences").insert({
   publication_id:publication,portal_grant_id:grantB,
   teacher_id:teacher.id,approved_by:teacher.id,request_id:randomUUID(),
  });
  expect(denied.error?.message).toContain("REPORT_AUDIENCE_NOT_AUTHORIZED");
  const allowed=await admin.from("report_publication_audiences").insert({
   publication_id:publication,portal_grant_id:grantA,
   teacher_id:teacher.id,approved_by:teacher.id,request_id:randomUUID(),
  });
  expect(allowed.error).toBeNull();
  const revoke=await admin.from("portal_access_grants")
   .update({revoked_at:new Date().toISOString()}).eq("id",grantA);
  expect(revoke.error).toBeNull();
  const nextPublication=await publish();
  const revokedDenied=await admin.from("report_publication_audiences").insert({
   publication_id:nextPublication,portal_grant_id:grantA,
   teacher_id:teacher.id,approved_by:teacher.id,request_id:randomUUID(),
  });
  expect(revokedDenied.error?.message).toContain("REPORT_AUDIENCE_NOT_AUTHORIZED");
 }finally{
  expect((await admin.auth.admin.deleteUser(teacher.id)).error).toBeNull();
 }
});

/** ENT-08/12: plan and individual-grant changes cannot evade the audit ledger. */
test("baseline and grant transitions produce immutable scoped entitlement audit events",async()=>{
 const admin=syntheticAdmin();
 const teacher=await syntheticTeacher(admin);
 try{
  await configureSyntheticStudentCapacity(admin,teacher.id,1);
  const issued=await admin.from("teacher_entitlement_grants").insert({
   teacher_id:teacher.id,kind:"capability_boost",
   capability_key:"students.active",capability_kind:"integer_limit",
   integer_value:2,unlimited:false,issued_by:teacher.id,
   reason:"Synthetic independently approved extra student capacity",
   request_id:randomUUID(),
  }).select("id").single();
  expect(issued.error).toBeNull();
  const revoke=await admin.from("teacher_entitlement_grants")
   .update({revoked_at:new Date().toISOString()}).eq("id",issued.data!.id);
  expect(revoke.error).toBeNull();
  const audited=await admin.from("entitlement_audit_events")
   .select("id,source,action,revision_before,revision_after")
   .eq("teacher_id",teacher.id).order("occurred_at",{ascending:true});
  expect(audited.error).toBeNull();
  const entries=audited.data??[];
  for(const action of ["baseline_plan_changed","grant_issued","grant_revoked"]){
   expect(entries.map(x=>x.action)).toContain(action);
  }
  for(const entry of entries){
   if(entry.revision_before!==null&&entry.revision_after!==null)
    expect(entry.revision_after).toBeGreaterThanOrEqual(entry.revision_before);
  }
  const tamper=await admin.from("entitlement_audit_events")
   .update({reason:"Tampered audit"}).eq("id",entries[0].id);
  expect(tamper.error?.message).toContain("IMMUTABLE_EVENT");
 }finally{
  expect((await admin.auth.admin.deleteUser(teacher.id)).error).toBeNull();
 }
});
