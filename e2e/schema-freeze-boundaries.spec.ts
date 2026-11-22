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
    issued_at:new Date().toISOString(),
    token_digest:createHash("sha256").update(randomUUID()).digest("hex"),
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
  const pendingGrant=await admin.from("portal_access_grants").insert({
   teacher_id:teacher.id,contact_id:contactA.data!.id,
   student_id:studentA.data!.id,workplace_id:workplace.data!.id,
   permissions:["shared_notes"],expires_at:future,
  }).select("id").single();
  expect(pendingGrant.error).toBeNull();
  const unissuedDenied=await admin.from("report_publication_audiences").insert({
   publication_id:publication,portal_grant_id:pendingGrant.data!.id,
   teacher_id:teacher.id,approved_by:teacher.id,request_id:randomUUID(),
  });
  expect(unissuedDenied.error?.message).toContain("REPORT_AUDIENCE_NOT_AUTHORIZED");
  const selfSupersession=await admin.from("report_publications")
   .update({superseded_by:publication}).eq("id",publication);
  expect(selfSupersession.error?.code).toBe("23514");
  const otherStudentReport=await admin.from("report_publications").insert({
   teacher_id:teacher.id,student_id:studentB.data!.id,
   workplace_id:workplace.data!.id,
   snapshot_digest:createHash("sha256").update(randomUUID()).digest("hex"),
   snapshot_storage_ref:"synthetic-reports/"+randomUUID(),
   output_locale:"en",approved_by:teacher.id,
   approved_at:new Date().toISOString(),request_id:randomUUID(),
  }).select("id").single();
  expect(otherStudentReport.error).toBeNull();
  const crossStudentSupersession=await admin.from("report_publications")
   .update({superseded_by:otherStudentReport.data!.id}).eq("id",publication);
  expect(crossStudentSupersession.error?.message)
   .toContain("REPORT_SUPERSESSION_SCOPE_MISMATCH");
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
  const sameScopeSuccessor=await publish();
  const superseded=await admin.from("report_publications")
   .update({superseded_by:sameScopeSuccessor}).eq("id",publication);
  expect(superseded.error).toBeNull();
  const secondSupersession=await admin.from("report_publications")
   .update({superseded_by:otherStudentReport.data!.id}).eq("id",publication);
  expect(secondSupersession.error?.message).toContain("IMMUTABLE_PUBLICATION");
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

/** TCH-03: session correction provenance is immutable while its session exists. */
test("session amendment history rejects direct updates and deletes",async()=>{
 const admin=syntheticAdmin();
 const teacher=await syntheticTeacher(admin);
 try{
  const workplace=await admin.from("workplaces").select("id")
   .eq("teacher_id",teacher.id).eq("kind","personal").single();
  expect(workplace.error).toBeNull();
  const student=await admin.from("students").insert({
   teacher_id:teacher.id,name:"Audit learner "+randomUUID(),
  }).select("id").single();
  expect(student.error).toBeNull();
  const enrollment=await admin.from("workplace_enrollments").insert({
   teacher_id:teacher.id,student_id:student.data!.id,
   workplace_id:workplace.data!.id,source:"manual",
  });
  expect(enrollment.error).toBeNull();
  const session=await admin.from("teaching_sessions").insert({
   teacher_id:teacher.id,workplace_id:workplace.data!.id,
   student_id:student.data!.id,title:"Schema audit lesson",
   starts_at:"2060-03-07T11:00:00Z",duration_minutes:45,
  }).select("id").single();
  expect(session.error).toBeNull();
  const corrected=await admin.from("teaching_sessions")
   .update({duration_minutes:60}).eq("id",session.data!.id);
  expect(corrected.error).toBeNull();
  const events=await admin.from("session_amendment_events")
   .select("id,previous_state,next_state")
   .eq("session_id",session.data!.id);
  expect(events.error).toBeNull();
  expect(events.data).toHaveLength(1);
  expect(events.data?.[0].previous_state.duration_minutes).toBe(45);
  expect(events.data?.[0].next_state.duration_minutes).toBe(60);
  const tamper=await admin.from("session_amendment_events")
   .update({source:"service"}).eq("id",events.data![0].id);
  expect(tamper.error?.message).toContain("IMMUTABLE_SESSION_AMENDMENT");
  const erase=await admin.from("session_amendment_events")
   .delete().eq("id",events.data![0].id);
  expect(erase.error?.message).toContain("IMMUTABLE_SESSION_AMENDMENT");
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

/** TCH-01/02: a cancelled unmaterialized recurring occurrence is durable,
 * exactly dated, versioned and replaceable without creating a phantom lesson. */
test("cancelled recurring occurrence can be reviewed, revoked and replaced without a session",async()=>{
 const admin=syntheticAdmin();
 const teacher=await syntheticTeacher(admin);
 try{
  const workplace=await admin.from("workplaces")
   .select("id").eq("teacher_id",teacher.id).eq("kind","personal").single();
  expect(workplace.error).toBeNull();
  const student=await admin.from("students").insert({
   teacher_id:teacher.id,name:"Weekly learner "+randomUUID(),
  }).select("id").single();
  expect(student.error).toBeNull();
  const enrollment=await admin.from("workplace_enrollments").insert({
   teacher_id:teacher.id,workplace_id:workplace.data!.id,
   student_id:student.data!.id,source:"manual",
  });
  expect(enrollment.error).toBeNull();
  const day=new Date("2060-04-01T00:00:00Z").getUTCDay();
  const slot=await admin.from("lesson_slots").insert({
   teacher_id:teacher.id,student_id:student.data!.id,
   workplace_id:workplace.data!.id,day_of_week:day,
   start_time:"14:00:00",duration_minutes:45,start_date:"2060-04-01",
  }).select("id").single();
  expect(slot.error).toBeNull();
  const original="2060-04-08";
  const canceled=await admin.from("slot_occurrence_exceptions").insert({
   teacher_id:teacher.id,slot_id:slot.data!.id,
   original_occurrence_on:original,action:"cancel",
   approved_by:teacher.id,
   reason:"Explicit weekly cancellation by teacher",
   request_id:randomUUID(),
  }).select("id").single();
  expect(canceled.error).toBeNull();
  const dupe=await admin.from("slot_occurrence_exceptions").insert({
   teacher_id:teacher.id,slot_id:slot.data!.id,
   original_occurrence_on:original,action:"cancel",
   approved_by:teacher.id,
   reason:"A duplicate would create two current intents",
   request_id:randomUUID(),
  });
  expect(dupe.error?.code).toBe("23505");
  const revoked=await admin.from("slot_occurrence_exceptions").update({
   revoked_at:new Date().toISOString(),revoked_by:teacher.id,
   revocation_request_id:randomUUID(),
  }).eq("id",canceled.data!.id);
  expect(revoked.error).toBeNull();
  const amended=await admin.from("slot_occurrence_exceptions").insert({
   teacher_id:teacher.id,slot_id:slot.data!.id,
   original_occurrence_on:original,action:"reschedule",
   revised_starts_at:"2060-04-09T14:00:00+00:00",revised_timezone:"UTC",
   approved_by:teacher.id,reason:"Approved replacement after cancellation",
   request_id:randomUUID(),
  });
  expect(amended.error).toBeNull();
  const overwrite=await admin.from("slot_occurrence_exceptions")
   .update({action:"override"}).eq("id",canceled.data!.id);
  expect(overwrite.error?.message).toContain("IMMUTABLE_OCCURRENCE");
  const sessions=await admin.from("teaching_sessions")
   .select("id",{count:"exact",head:true}).eq("teacher_id",teacher.id);
  expect(sessions.error).toBeNull();
  expect(sessions.count).toBe(0);
 }finally{
  expect((await admin.auth.admin.deleteUser(teacher.id)).error).toBeNull();
 }
});

/** SCH-04/06: tenant identity is enforced by both composite foreign keys
 * and authenticated row security, not by UI filters or caller claims. */
test("cross-tenant report references are rejected and private reports are invisible",async()=>{
 const admin=syntheticAdmin();
 const a=await syntheticTeacher(admin);
 const b=await syntheticTeacher(admin);
 try{
  const aWorkplace=await admin.from("workplaces")
   .select("id").eq("teacher_id",a.id).eq("kind","personal").single();
  const bWorkplace=await admin.from("workplaces")
   .select("id").eq("teacher_id",b.id).eq("kind","personal").single();
  expect(aWorkplace.error).toBeNull();
  expect(bWorkplace.error).toBeNull();
  const aStudent=await admin.from("students").insert({
   teacher_id:a.id,name:"Tenant A learner "+randomUUID(),
  }).select("id").single();
  const bStudent=await admin.from("students").insert({
   teacher_id:b.id,name:"Tenant B learner "+randomUUID(),
  }).select("id").single();
  expect(aStudent.error).toBeNull();
  expect(bStudent.error).toBeNull();
  const report=(teacherId:string,studentId:string,workplaceId:string)=>({
   teacher_id:teacherId,student_id:studentId,workplace_id:workplaceId,
   snapshot_digest:createHash("sha256").update(randomUUID()).digest("hex"),
   snapshot_storage_ref:"synthetic-reports/"+randomUUID(),
   output_locale:"en",approved_by:teacherId,
   approved_at:new Date().toISOString(),request_id:randomUUID(),
  });
  const own=await admin.from("report_publications").insert(
   report(a.id,aStudent.data!.id,aWorkplace.data!.id)
  ).select("id").single();
  expect(own.error).toBeNull();
  const foreignStudent=await admin.from("report_publications").insert(
   report(a.id,bStudent.data!.id,aWorkplace.data!.id)
  );
  expect(foreignStudent.error?.code).toBe("23503");
  const foreignWorkplace=await admin.from("report_publications").insert(
   report(a.id,aStudent.data!.id,bWorkplace.data!.id)
  );
  expect(foreignWorkplace.error?.code).toBe("23503");
  const outsider=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
   });
  const login=await outsider.auth.signInWithPassword({
   email:b.email,password:b.password,
  });
  expect(login.error).toBeNull();
  const hidden=await outsider.from("report_publications")
   .select("id").eq("id",own.data!.id);
  expect(hidden.error).toBeNull();
  expect(hidden.data).toEqual([]);
  const forged=await outsider.from("report_publications").insert(
   report(a.id,aStudent.data!.id,aWorkplace.data!.id)
  );
  expect(forged.error).not.toBeNull();
  await outsider.auth.signOut();
 }finally{
  expect((await admin.auth.admin.deleteUser(a.id)).error).toBeNull();
  expect((await admin.auth.admin.deleteUser(b.id)).error).toBeNull();
 }
});

/** SCH-05/06: A signed-in teacher can inspect only their own entitlement
 * state, while direct writes to authority, subscription and audit tables
 * fail at the database privilege boundary. Anonymous users get no rows. */
test("authenticated and anonymous roles cannot mutate commercial authority",async()=>{
 const admin=syntheticAdmin();
 const a=await syntheticTeacher(admin);
 const b=await syntheticTeacher(admin);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
 const anon=createClient(url,key,{auth:{
  persistSession:false,autoRefreshToken:false,
 }});
 const member=createClient(url,key,{auth:{
  persistSession:false,autoRefreshToken:false,
 }});
 try{
  const signed=await member.auth.signInWithPassword({
   email:a.email,password:a.password,
  });
  expect(signed.error).toBeNull();
  const own=await member.from("teacher_entitlement_state")
   .select("teacher_id,revision").eq("teacher_id",a.id).single();
  expect(own.error).toBeNull();
  expect(own.data?.teacher_id).toBe(a.id);
  const other=await member.from("teacher_entitlement_state")
   .select("teacher_id").eq("teacher_id",b.id);
  expect(other.error).toBeNull();
  expect(other.data).toEqual([]);
  const anonymous=await anon.from("teacher_entitlement_state")
   .select("teacher_id").eq("teacher_id",a.id);
  expect(anonymous.data ?? []).toEqual([]);
  const changes=[
   member.from("teacher_entitlement_state")
    .update({revision:99999}).eq("teacher_id",a.id),
   member.from("teacher_entitlement_grants").insert({
    teacher_id:a.id,kind:"plan_access",request_id:randomUUID(),
    reason:"synthetic forged grant",
   }),
   member.from("entitlement_audit_events").insert({
    teacher_id:a.id,source:"operator",action:"fake",
    request_id:randomUUID(),reason:"synthetic forged audit",
   }),
   member.from("platform_billing_events").insert({
    provider:"synthetic",merchant_scope:"tenant-test",
    external_event_id:randomUUID(),event_type:"paid",
    payload_sha256:"a".repeat(64),
    signature_verified_at:new Date().toISOString(),
   }),
   member.from("platform_subscriptions").delete().eq("teacher_id",a.id),
  ];
  for(const mutation of changes){
   const result=await mutation;
   expect(result.error,"direct commercial mutation must be denied").not.toBeNull();
  }
  const unchanged=await admin.from("teacher_entitlement_state")
   .select("revision").eq("teacher_id",a.id).single();
  expect(unchanged.error).toBeNull();
  expect(unchanged.data?.revision).toBe(own.data?.revision);
 }finally{
  await member.auth.signOut();
  expect((await admin.auth.admin.deleteUser(a.id)).error).toBeNull();
  expect((await admin.auth.admin.deleteUser(b.id)).error).toBeNull();
 }
});
