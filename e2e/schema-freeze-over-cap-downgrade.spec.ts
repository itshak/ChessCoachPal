import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {buildStudioExport} from "../lib/data-transfer";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

/** ENT-10: a bounded baseline stands in for commercial limits; published Free v1 is unlimited. */
test("ENT-10 expired paid Pro preserves over-cap professional lesson history, edit, capture and export",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options);
 const owner=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
 const email="over-cap-"+randomUUID()+"@example.com",password="SyntheticDowngrade-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id,email,display_name:"Synthetic over-cap downgrade",
  })).error).toBeNull();
  const baseline=await configureSyntheticStudentCapacity(admin,id,1,1);
  expect((await owner.auth.signInWithPassword({email,password})).error).toBeNull();
  const pro=await admin.from("plan_versions").select("id")
   .eq("code","pro").eq("version",1).single();
  expect(pro.error).toBeNull();
  const provider="synthetic",merchant_scope="scope_"+randomUUID();
  const customer=await admin.from("platform_billing_customers").insert({
   teacher_id:id,provider,merchant_scope,external_customer_id:"customer_"+randomUUID(),
  }).select("id").single();
  expect(customer.error).toBeNull();
  const offer=await admin.from("platform_subscription_offers").insert({
   plan_version_id:pro.data!.id,provider,merchant_scope,external_price_id:"price_"+randomUUID(),
   currency:"USD",billing_interval:"month",effective_from:"2020-01-01T00:00:00Z",
  }).select("id").single();
  expect(offer.error).toBeNull();
  const future=new Date(Date.now()+86400000).toISOString();
  const subscription=await admin.from("platform_subscriptions").insert({
   teacher_id:id,customer_id:customer.data!.id,offer_id:offer.data!.id,provider,merchant_scope,
   external_subscription_id:"subscription_"+randomUUID(),state:"active",
   current_period_end:future,paid_through:future,
   latest_event_time:new Date(Date.now()-60000).toISOString(),
  }).select("id").single();
  expect(subscription.error).toBeNull();
  const summary=async()=>{
   const result=await owner.rpc("ccp_entitlement_summary");
   expect(result.error).toBeNull();
   return result.data;
  };
  expect(await summary()).toMatchObject({
   studentCapacity:{planCode:"pro",unlimited:true},
   workplaceCapacity:{planCode:"pro",unlimited:true},
  });

  const workplaceRow=(name:string)=>({
   teacher_id:id,name,timezone:"UTC",currency:"USD",locale:"en",
   kind:"professional",policy:{},
  });
  const workplaceIds:string[]=[],studentIds:string[]=[];
  for(const n of [1,2]){
   const workplace=await owner.from("workplaces").insert(workplaceRow("Synthetic school "+n))
    .select("id").single();
   expect(workplace.error).toBeNull();
   workplaceIds.push(workplace.data!.id);
   const student=await owner.from("students").insert({teacher_id:id,name:"Synthetic learner "+n})
    .select("id").single();
   expect(student.error).toBeNull();
   studentIds.push(student.data!.id);
   expect((await owner.from("workplace_enrollments").insert({
    teacher_id:id,student_id:student.data!.id,workplace_id:workplace.data!.id,source:"manual",starts_on:"2020-03-01",
   })).error).toBeNull();
  }
  // Both existing learners already belong to the second professional workplace.
  expect((await owner.from("workplace_enrollments").insert({
   teacher_id:id,student_id:studentIds[0],workplace_id:workplaceIds[1],source:"manual",starts_on:"2020-03-01",
  })).error).toBeNull();
  const originalLesson=await owner.from("teaching_sessions").insert({
   teacher_id:id,workplace_id:workplaceIds[1],student_id:studentIds[1],title:"Existing professional lesson",
   starts_at:"2020-03-07T11:00:00Z",duration_minutes:45,
  }).select("id,workplace_id,student_id,title,duration_minutes").single();
  expect(originalLesson.error).toBeNull();

  const past=new Date(Date.now()-30000).toISOString();
  const dropped=await admin.from("platform_subscriptions").update({
   state:"expired",paid_through:past,current_period_end:past,latest_event_time:new Date().toISOString(),
  }).eq("id",subscription.data!.id);
  expect(dropped.error).toBeNull();
  expect(await summary()).toMatchObject({
   activeStudentCount:2,activeProfessionalWorkplaceCount:2,
   studentCapacity:{planVersionId:baseline.planId,limit:1,unlimited:false},
   workplaceCapacity:{planVersionId:baseline.planId,limit:1,unlimited:false},
  });
  const blocked={code:"23514",message:"CAPACITY_EXCEEDED"};
  expect((await owner.from("workplaces").insert(workplaceRow("Denied school"))).error)
   .toMatchObject(blocked);
  expect((await owner.from("students").insert({teacher_id:id,name:"Denied learner"})).error)
   .toMatchObject(blocked);
  const retained=await owner.from("teaching_sessions")
   .select("id,workplace_id,student_id,title,duration_minutes").eq("id",originalLesson.data!.id).single();
  expect(retained.error).toBeNull();
  expect(retained.data).toEqual(originalLesson.data);
  const correctedTitle="Corrected professional lesson title";
  const corrected=await owner.from("teaching_sessions").update({title:correctedTitle})
   .eq("id",originalLesson.data!.id).select("id,title").single();
  expect(corrected.error).toBeNull();
  expect(corrected.data?.title).toBe(correctedTitle);
  const captureTitle="Completed professional lesson after downgrade";
  const capture=await owner.rpc("ccp_teacher_completed_group_lesson_create",{
   p_workplace_id:workplaceIds[1],p_student_ids:studentIds,p_title:captureTitle,
   p_starts_at:"2020-03-08T11:00:00Z",p_duration_minutes:45,p_lesson_note:"Synthetic lesson capture",
   p_attendance:studentIds.map(studentId=>({studentId,status:"present"})),p_request_id:randomUUID(),
  });
  expect(capture.error).toBeNull();
  expect(capture.data).toMatchObject({
   workplaceId:workplaceIds[1],status:"completed",rosterMode:"ad_hoc",
   participantCount:2,oneTransaction:true,replayed:false,
  });
  const completedId=capture.data!.sessionId;
  const attendance=await owner.from("session_attendance").select("student_id,status")
   .eq("session_id",completedId).order("student_id");
  expect(attendance.error).toBeNull();
  expect(attendance.data).toEqual([...studentIds].sort().map(student_id=>({student_id,status:"present"})));
  expect(await summary()).toMatchObject({activeStudentCount:2,activeProfessionalWorkplaceCount:2});
  const backup=await buildStudioExport(owner,id);
  const professional=(backup.tables.workplaces as Record<string,unknown>[])
   .filter(row=>row.kind==="professional");
  expect(professional.map(row=>row.id).sort()).toEqual([...workplaceIds].sort());
  expect(professional.every(row=>row.archived_at===null)).toBe(true);
  expect((backup.tables.students as Record<string,unknown>[]).map(row=>row.id).sort())
   .toEqual([...studentIds].sort());
  expect(backup.tables.workplace_enrollments).toEqual(expect.arrayContaining(
   workplaceIds.map((workplace_id,index)=>expect.objectContaining({workplace_id,student_id:studentIds[index]})),
  ));
  expect(backup.tables.teaching_sessions).toHaveLength(2);
  expect(backup.tables.teaching_sessions).toEqual(expect.arrayContaining([
   expect.objectContaining({...originalLesson.data,title:correctedTitle}),
   expect.objectContaining({
    id:completedId,workplace_id:workplaceIds[1],title:captureTitle,status:"completed",roster_mode:"ad_hoc",
   }),
  ]));
  const exportedAttendance=(backup.tables.session_attendance as Record<string,unknown>[])
   .filter(row=>row.session_id===completedId)
   .map(({student_id,status})=>({student_id,status}));
  expect(exportedAttendance).toHaveLength(2);
  expect(exportedAttendance).toEqual(expect.arrayContaining(attendance.data!));
 }finally{
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});
