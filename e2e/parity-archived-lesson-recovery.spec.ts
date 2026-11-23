import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {isolatedTeacherTest} from "./helpers/isolated-teacher";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";
import {createAssignedPayer} from "./helpers/canonical-payer";
import {delegatedTool,type TestMcpReply} from "./helpers/delegated-mcp";

type Call=(name:string,args:Record<string,unknown>)=>Promise<TestMcpReply>;
const tag=()=>randomUUID().slice(0,8);

async function fixture(call:Call,count=2){
 const name="Archived recovery campus "+tag();
 const w=await call("ccp_workplaces_create",{
  name,timezone:"Asia/Jerusalem",currency:"ILS",locale:"he",
  policy:{},idempotencyKey:randomUUID(),
 });
 expect(w.error).toBeUndefined();
 const workplaceId=w.data.entityId as string;
 const names:string[]=[],ids:string[]=[];
 for(let i=0;i<count;i++){
  const person="Recovery student "+tag();
  const created=await call("ccp_students_create",{
   name:person,idempotencyKey:randomUUID(),
  });
  expect(created.error).toBeUndefined();
  const studentId=created.data.entityId as string;
  names.push(person);ids.push(studentId);
  const enrolled=await call("ccp_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:randomUUID(),
  });
  expect(enrolled.error).toBeUndefined();
 }
 return {workplaceId,names,ids};
}
async function archive(call:Call,studentId:string){
 const p=await call("ccp_students_lifecycle_preview",{studentId});
 expect(p.error).toBeUndefined();
 expect(p.data.canArchive).toBe(true);
 const archived=await call("ccp_students_lifecycle_commit",{
  studentId,mode:"archive",expectedUpdatedAt:p.data.expectedUpdatedAt,
  selectedWorkplaceIds:[],requestId:randomUUID(),
  reason:"Coach verified this learner's archive and closed prior enrollment",
  confirmed:true,
 });
 expect(archived.error).toBeUndefined();
 expect(archived.data.archived).toBe(true);
}

test("PARITY:PARITY-archived-student-lesson-recovery-transactional-group-and-cross-channel-replay",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const f=await fixture(call,3);
 await archive(call,f.ids[0]);
 const date="2060-04-17T11:00:00+03:00";
 const payload={
  workplaceId:f.workplaceId,studentIds:f.ids,title:"Atomic archived group "+tag(),
  startsAt:date,durationMinutes:75,lessonNote:"Only teacher-attested lesson notes",
 };
 // The conversational name resolver must discover the archived candidate,
 // but never produce a directly committable ad-hoc roster.
 const naming=await call("ccp_lessons_capture_preview",{
  names:f.names,workplaceId:f.workplaceId,title:payload.title,
  startsAt:payload.startsAt,durationMinutes:payload.durationMinutes,
  lessonNote:payload.lessonNote,
 });
 expect(naming.error).toBeUndefined();
 expect(naming.data.canCommit).toBe(false);
 expect(naming.data.issues.some((v:{code:string})=>
  v.code==="ARCHIVED_STUDENT_CONFIRMATION_REQUIRED")).toBe(true);
 const response=await page.request.post(
  "/api/coaching/lesson-capture/recovery/preview",{data:payload});
 expect(response.status(),await response.text()).toBe(200);
 const preview=await response.json();
 const mcp=await call("ccp_lessons_archived_recovery_preview",payload);
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(preview);
 const gatewayPreview=await page.request.post("/api/agent/v1",{
  data:{action:"lessons.archivedRecoveryPreview",...payload},
 });
 expect(gatewayPreview.status(),await gatewayPreview.text()).toBe(200);
 expect((await gatewayPreview.json()).data).toEqual(preview);
 expect(preview).toMatchObject({
  canCommit:true,requiresTeacherConfirmation:true,
  review:{writesPerformed:false,reactivationCount:1,attendance:"unmarked"},
 });
 expect(preview.reactivations[0].studentId).toBe(f.ids[0]);
 expect(preview.reactivations[0].previousWorkplaceIds).toContain(f.workplaceId);
 expect(preview.proposedCommit.reactivations).toEqual([{
  studentId:f.ids[0],expectedUpdatedAt:preview.reactivations[0].expectedUpdatedAt,
 }]);
 const stillArchived=await call("ccp_students_lifecycle_preview",{studentId:f.ids[0]});
 expect(stillArchived.data.archived).toBe(true);
 const before=await call("ccp_sessions_list",{query:payload.title,workplaceId:f.workplaceId});
 expect(before.error).toBeUndefined();
 expect(before.data.filter((s:{title:string})=>s.title===payload.title)).toHaveLength(0);
 const approval={...preview.proposedCommit,requestId:randomUUID(),
  reason:"Coach explicitly approves returning this archived student for this specific lesson",
  confirmed:true};
 const created=await call("ccp_lessons_archived_recovery_commit",approval);
 expect(created.error).toBeUndefined();
 expect(created.data.replayed).toBe(false);
 expect(created.data.reactivatedStudentIds).toEqual([f.ids[0]]);
 expect(created.data.reactivatedCount).toBe(1);
 const sessionId=created.data.id as string;
 expect(sessionId).toBeTruthy();
 const replay=await page.request.post("/api/coaching/lesson-capture/recovery/commit",{data:approval});
 expect(replay.status(),await replay.text()).toBe(200);
 expect(await replay.json()).toMatchObject({id:sessionId,replayed:true});
 const gatewayCommit=await page.request.post("/api/agent/v1",{
  data:{action:"lessons.archivedRecoveryCommit",...approval},
 });
 expect(gatewayCommit.status(),await gatewayCommit.text()).toBe(200);
 expect((await gatewayCommit.json()).data).toMatchObject({id:sessionId,replayed:true});
 const changed=await call("ccp_lessons_archived_recovery_commit",{
  ...approval,title:"Change after approval",
 });
 expect(changed.error?.code).toBe("CONFLICT");
 const participants=await call("ccp_sessions_participants",{sessionId});
 expect(participants.error).toBeUndefined();
 expect(participants.data.map((r:{student_id:string})=>r.student_id).sort())
  .toEqual([...f.ids].sort());
 const after=await call("ccp_students_lifecycle_preview",{studentId:f.ids[0]});
 expect(after.error).toBeUndefined();
 expect(after.data.archived).toBe(false);
 expect(after.data.currentMemberships.some((m:{workplaceId:string})=>
  m.workplaceId===f.workplaceId)).toBe(true);
 const attendance=await call("ccp_attendance_preview",{sessionId});
 expect(attendance.error).toBeUndefined();
 expect(attendance.data.attendance.every((r:{status:string})=>r.status==="unmarked"))
  .toBe(true);
});

test("PARITY:PARITY-archived-lesson-recovery-single-student-and-foreign-identity-denial",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const f=await fixture(call,1);
 await archive(call,f.ids[0]);
 const payload={workplaceId:f.workplaceId,studentIds:f.ids,
  title:"Single archived learner "+tag(),startsAt:"2060-05-22T16:00:00+03:00",
  durationMinutes:45,lessonNote:""};
 const namePreview=await call("ccp_lessons_capture_preview",{
  names:f.names,workplaceId:f.workplaceId,title:payload.title,
  startsAt:payload.startsAt,durationMinutes:payload.durationMinutes,
 });
 expect(namePreview.error).toBeUndefined();
 expect(namePreview.data.resolutions[0]).toMatchObject({
  studentId:f.ids[0],status:"archived",
 });
 const pre=await call("ccp_lessons_archived_recovery_preview",payload);
 expect(pre.error).toBeUndefined();
 expect(pre.data.canCommit).toBe(true);
 const denied=await call("ccp_lessons_archived_recovery_preview",{
  ...payload,studentIds:[randomUUID()],
 });
 expect(denied.error).toBeUndefined();
 expect(denied.data.canCommit).toBe(false);
 expect(denied.data.issues.some((x:{code:string})=>x.code==="STUDENT_NOT_FOUND"))
  .toBe(true);
 const approval={...pre.data.proposedCommit,reason:
  "Teacher requests reactivation for this single student at a verified campus",
  requestId:randomUUID(),confirmed:true};
 const web=await page.request.post("/api/coaching/lesson-capture/recovery/commit",{
  data:approval,
 });
 expect(web.status(),await web.text()).toBe(200);
 const receipt=await web.json();
 expect(receipt.reactivatedCount).toBe(1);
 expect(receipt.student_id).toBe(f.ids[0]);
 expect(receipt.roster_mode).not.toBe("ad_hoc");
 const mcpReplay=await call("ccp_lessons_archived_recovery_commit",approval);
 expect(mcpReplay.error).toBeUndefined();
 expect(mcpReplay.data).toMatchObject({id:receipt.id,replayed:true});
 const roster=await call("ccp_sessions_participants",{sessionId:receipt.id});
 expect(roster.error).toBeUndefined();
 expect(roster.data.map((x:{student_id:string})=>x.student_id)).toEqual(f.ids);
});

test("PARITY:PARITY-archived-recovery-stale-revisions-fail-without-extra-lesson",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const f=await fixture(call,2);
 await archive(call,f.ids[0]);
 const payload={workplaceId:f.workplaceId,studentIds:f.ids,
  title:"Stale archived revision "+tag(),startsAt:"2060-06-21T16:00:00+03:00",
  durationMinutes:60,lessonNote:""};
 const preview=await call("ccp_lessons_archived_recovery_preview",payload);
 expect(preview.error).toBeUndefined();
 expect(preview.data.canCommit).toBe(true);
 const old=preview.data.proposedCommit;
 const latest=await call("ccp_students_lifecycle_preview",{studentId:f.ids[0]});
 const restore=await call("ccp_students_lifecycle_commit",{
  studentId:f.ids[0],mode:"reactivate",selectedWorkplaceIds:[f.workplaceId],
  expectedUpdatedAt:latest.data.expectedUpdatedAt,
  reason:"Teacher separately restored this student before stale lesson approval",
  requestId:randomUUID(),confirmed:true,
 });
 expect(restore.error).toBeUndefined();
 const stale=await call("ccp_lessons_archived_recovery_commit",{
  ...old,reason:"Stale teacher approval must not resurrect a separate operation",
  requestId:randomUUID(),confirmed:true,
 });
 expect(stale.error).toBeDefined();
 const after=await call("ccp_sessions_list",{query:payload.title,workplaceId:f.workplaceId});
 expect(after.error).toBeUndefined();
 expect(after.data.filter((s:{title:string})=>s.title===payload.title)).toHaveLength(0);
 const enrolled=await call("ccp_workplaces_enrollments",{workplaceId:f.workplaceId});
 expect(enrolled.error).toBeUndefined();
 expect(enrolled.data.filter((e:{student_id:string})=>e.student_id===f.ids[0]))
  .toHaveLength(1);
});

test("PARITY:PARITY-archived-recovery-schedule-conflict-rolls-back-activation",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const f=await fixture(call,3);
 await archive(call,f.ids[0]);
 const startsAt="2060-07-23T18:00:00+03:00";
 const blocking=await call("ccp_sessions_ad_hoc_create",{
  workplaceId:f.workplaceId,studentIds:f.ids.slice(1),
  title:"Existing calendar blocker "+tag(),startsAt,
  durationMinutes:60,lessonNote:"",idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(blocking.error).toBeUndefined();
 const archived=await call("ccp_students_lifecycle_preview",{studentId:f.ids[0]});
 expect(archived.error).toBeUndefined();
 expect(archived.data.archived).toBe(true);
 const payload={workplaceId:f.workplaceId,studentIds:[f.ids[0],f.ids[1]],
  title:"Must not partially restore "+tag(),startsAt,durationMinutes:60,lessonNote:""};
 const pre=await call("ccp_lessons_archived_recovery_preview",payload);
 expect(pre.error).toBeUndefined();
 expect(pre.data.canCommit).toBe(false);
 expect(pre.data.issues.some((x:{code:string})=>x.code==="SCHEDULE_CONFLICT")).toBe(true);
 // Even a deliberately forged confirmed write that bypasses the preview
 // must roll back the earlier lifecycle writes when lesson insertion fails.
 const forbidden=await call("ccp_lessons_archived_recovery_commit",{
  ...payload,reactivations:[{
   studentId:f.ids[0],expectedUpdatedAt:archived.data.expectedUpdatedAt,
  }],requestId:randomUUID(),reason:
  "Adversarial approval collides with an existing real teacher session",
  confirmed:true,
 });
 expect(forbidden.error).toBeDefined();
 const after=await call("ccp_students_lifecycle_preview",{studentId:f.ids[0]});
 expect(after.error).toBeUndefined();
 expect(after.data.archived).toBe(true);
 expect(after.data.currentMemberships).toHaveLength(0);
 const roster=await call("ccp_workplaces_enrollments",{workplaceId:f.workplaceId});
 expect(roster.error).toBeUndefined();
 expect(roster.data.some((x:{student_id:string})=>x.student_id===f.ids[0]))
  .toBe(false);
 const sessions=await call("ccp_sessions_list",{query:payload.title,workplaceId:f.workplaceId});
 expect(sessions.error).toBeUndefined();
 expect(sessions.data.filter((x:{title:string})=>x.title===payload.title))
  .toHaveLength(0);
});

test("PARITY:PARITY-archived-active-alias-collision-and-historical-lesson-fail-closed",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const f=await fixture(call,3);
 await archive(call,f.ids[0]);
 const shared="Shared archived and active alias "+tag();
 for(const studentId of f.ids.slice(0,2)){
  const patched=await page.request.put("/api/students/"+studentId,{
   data:{nameAliases:[shared]},
  });
  expect(patched.status(),await patched.text()).toBe(200);
 }
 const preview=await call("ccp_lessons_capture_preview",{
  names:[shared,f.names[2]],workplaceId:f.workplaceId,
  title:"Ambiguous alias recovery "+tag(),
  startsAt:"2060-08-26T18:00:00+03:00",durationMinutes:45,
 });
 expect(preview.error).toBeUndefined();
 expect(preview.data.canCommit).toBe(false);
 const ambiguous=preview.data.issues.find((x:{code:string})=>x.code==="AMBIGUOUS_STUDENT");
 expect(ambiguous).toBeDefined();
 expect(ambiguous.candidates).toEqual(expect.arrayContaining([
  expect.objectContaining({id:f.ids[0],archived:true}),
  expect.objectContaining({id:f.ids[1],archived:false}),
 ]));
 const historical={
  workplaceId:f.workplaceId,studentIds:[f.ids[0]],
  title:"Old historical correction "+tag(),
  startsAt:"2023-03-10T15:00:00+02:00",durationMinutes:45,lessonNote:"",
 };
 const read=await page.request.post(
  "/api/coaching/lesson-capture/recovery/preview",{data:historical});
 expect(read.status(),await read.text()).toBe(200);
 const body=await read.json();
 expect(body.canCommit).toBe(false);
 expect(body.issues.some((x:{code:string})=>
  x.code==="HISTORICAL_LESSON_NO_REACTIVATION")).toBe(true);
 const state=await call("ccp_students_lifecycle_preview",{studentId:f.ids[0]});
 const forbidden=await call("ccp_lessons_archived_recovery_commit",{
  ...historical,reactivations:[{
   studentId:f.ids[0],expectedUpdatedAt:state.data.expectedUpdatedAt,
  }],
  reason:"Historical correction must never cause automatic reactivation",
  requestId:randomUUID(),confirmed:true,
 });
 expect(forbidden.error?.code).toBe("VALIDATION_ERROR");
 const after=await call("ccp_students_lifecycle_preview",{studentId:f.ids[0]});
 expect(after.data.archived).toBe(true);
});

isolatedTeacherTest("PARITY: archived recovery advises on aggregate capacity and held credits; stale capacity rolls back two learners",
 async({page,request,isolatedTeacher})=>{
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,
   {auth:{persistSession:false,autoRefreshToken:false}});
  const owner=await admin.from("teachers").select("id").eq("email",isolatedTeacher.email).single();
  expect(owner.error).toBeNull();
  const teacher_id=owner.data!.id as string;
  await configureSyntheticStudentCapacity(admin,teacher_id,6,4);
  const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
  const f=await fixture(call,3);
  const id=f.ids[0];
  const today=(await call("ccp_students_lifecycle_preview",{studentId:id})).data.teacherLocalToday as string;
  const expiry=new Date(Date.parse(today+"T00:00Z")+86400000).toISOString().slice(0,10);
  await createAssignedPayer(call,{studentId:id,workplaceId:f.workplaceId,effectiveFrom:today});
  const purchase=await call("ccp_credits_package_create",{
   studentId:id,workplaceId:f.workplaceId,credits:3,durationMinutes:45,priceCents:2500,
   startsOn:today,expiresOn:expiry,requestId:randomUUID(),confirmed:true,
  });
  expect(purchase.error).toBeUndefined();
  await archive(call,f.ids[0]);
  await archive(call,f.ids[1]);
  const payload={workplaceId:f.workplaceId,studentIds:f.ids,title:"Two archived learners "+tag(),
   startsAt:"2062-01-17T12:00:00+02:00",durationMinutes:60,lessonNote:""};
  const preview=async(extra:Record<string,unknown>={})=>{
   const data={...payload,...extra};
   const response=await page.request.post("/api/coaching/lesson-capture/recovery/preview",{data});
   expect(response.status(),await response.text()).toBe(200);
   const result=await response.json();
   expect((await call("ccp_lessons_archived_recovery_preview",data)).data).toEqual(result);
   return result;
  };
  const snapshot=async()=>{
   const scopes=[
    ["students","id,archived_at,updated_at"],["workplace_enrollments","id,revision,starts_on,ends_on,cancelled_at"],
    ["teaching_sessions","id"],["session_participants","session_id,student_id"],
    ["agent_tool_receipts","idempotency_key"],["credit_packages","id,credits,expires_on"],
    ["credit_adjustment_events","id"],["credit_redemptions","id"],["invoices","id,status"],
   ] as const;
   return await Promise.all(scopes.map(async([table,fields])=>{
    const row=await admin.from(table).select(fields).eq("teacher_id",teacher_id).order(fields.split(",")[0]);
    expect(row.error,table).toBeNull();
    return row.data;
   }));
  };
  const before=await snapshot();
  const ready=await preview();
  expect(ready).toMatchObject({canCommit:true,capacity:{
   advisory:true,activeStudentCount:1,requestedReactivations:2,projectedActiveStudentCount:3,
   limit:6,remaining:5,blocked:false,
  },review:{writesPerformed:false}});
  expect(ready.reactivations).toEqual(expect.arrayContaining([
   expect.objectContaining({studentId:id,creditNotice:{
    packagesWithUnusedUnits:1,expiredBeforeLesson:1,scopedToAnotherWorkplace:0,
   }}),
  ]));
  expect(JSON.stringify(ready)).not.toContain(purchase.data.invoiceId);
  expect(JSON.stringify(ready)).not.toContain(purchase.data.packageId);
  const foreign=await preview({workplaceId:randomUUID()});
  expect(foreign.capacity).toBeNull();
  expect(foreign.reactivations.every((x:{creditNotice:unknown})=>x.creditNotice===null)).toBe(true);
  await configureSyntheticStudentCapacity(admin,teacher_id,2,4);
  const blocked=await preview();
  expect(blocked).toMatchObject({canCommit:false,proposedCommit:null,
   capacity:{remaining:1,limit:2,requestedReactivations:2,blocked:true},
   issues:[{code:"CAPACITY_EXCEEDED"}],review:{writesPerformed:false}});
  await page.goto("/coaching");
  await page.getByLabel("Student names, one per line (1–50)").fill(f.names.join("\n"));
  await page.getByLabel("Workplace / time zone").selectOption(f.workplaceId);
  await page.getByLabel("Lesson title").fill(payload.title);
  await page.getByLabel("Start time in workplace time zone").fill("2062-01-17T12:00");
  await page.getByRole("button",{name:"Preview only"}).click();
  await page.getByRole("button",{name:"Review archived learner and lesson"}).click();
  await expect(page.getByText("Capacity preview: 2 to reactivate; places currently available: 1.",{exact:false})).toBeVisible();
  await expect(page.getByText("This roster exceeds the active-student limit.",{exact:false})).toBeVisible();
  await expect(page.getByText("Credit packages with unused units: 1.",{exact:false})).toBeVisible();
  await expect(page.getByRole("button",{name:"Confirm reactivation and create lesson"})).toHaveCount(0);
  const one=await preview({studentIds:[f.ids[0],f.ids[2]]});
  expect(one).toMatchObject({canCommit:true,capacity:{requestedReactivations:1,remaining:1,blocked:false}});
  expect(await snapshot()).toEqual(before);
  // Submit the originally legitimate review after the ceiling changes.
  // The first student can fit but the second cannot: both MUST remain archived.
  const approved={...ready.proposedCommit,requestId:randomUUID(),confirmed:true,
   reason:"Approved both exact student IDs before the advisory quota changed"};
  const rejected=await page.request.post("/api/coaching/lesson-capture/recovery/commit",{data:approved});
  expect(rejected.status(),await rejected.text()).toBe(409);
  const web=await rejected.json();
  expect(web.code).toBe("CAPACITY_EXCEEDED");
  expect((await call("ccp_lessons_archived_recovery_commit",approved)).error?.code).toBe(web.code);
  expect(await snapshot()).toEqual(before);
 });

isolatedTeacherTest("PARITY: an existing archived learner historical note correction does not reactivate or reenroll",
 async({page,request,isolatedTeacher})=>{
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,
   {auth:{persistSession:false,autoRefreshToken:false}});
  const owner=await admin.from("teachers").select("id").eq("email",isolatedTeacher.email).single();
  expect(owner.error).toBeNull();
  const teacher_id=owner.data!.id as string;
  await configureSyntheticStudentCapacity(admin,teacher_id,4,2);
  const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
  const f=await fixture(call,1);
  const studentId=f.ids[0];
  expect((await admin.from("workplace_enrollments").insert({
   teacher_id,student_id:studentId,workplace_id:f.workplaceId,
   starts_on:"2023-01-01",ends_on:"2023-12-31",
  })).error).toBeNull();
  // A snapshot-local Sunday sits in the preceding UTC week. The current
  // workplace timezone is later changed to exercise historic precedence.
  const saved=await admin.from("teaching_sessions").insert({
   teacher_id,workplace_id:f.workplaceId,student_id:studentId,title:"Historical lesson "+tag(),
   starts_at:"2023-05-27T21:30:00Z",local_timezone:"Asia/Jerusalem",
   duration_minutes:45,lesson_note:"Original review",
  }).select("id,local_timezone").single();
  expect(saved.error).toBeNull();
  expect(saved.data!.local_timezone).toBe("Asia/Jerusalem");
  const sessionId=saved.data!.id as string;
  expect((await admin.from("workplaces").update({timezone:"UTC"})
   .eq("teacher_id",teacher_id).eq("id",f.workplaceId)).error).toBeNull();
  const path="/api/coaching/sessions/"+sessionId+"/notes";
  const originalNote={studentId,body:"Original historical coaching note",privateBody:"",
   sharedWithContacts:false,sendEmail:false,expectedUpdatedAt:null,idempotencyKey:randomUUID()};
  const initial=await page.request.put(path,{data:originalNote});
  expect(initial.status(),await initial.text()).toBe(200);
  const original=await initial.json();
  await archive(call,studentId);
  const before=(await call("ccp_students_lifecycle_preview",{studentId})).data;
  expect(before).toMatchObject({archived:true,currentMemberships:[]});
  const session=await call("ccp_sessions_details",{sessionId});
  expect(session.error).toBeUndefined();
  const correction={...originalNote,body:"Corrected historical coaching note",
   expectedUpdatedAt:original.revision,idempotencyKey:randomUUID()};
  const changed=await call("ccp_session_notes_save",{sessionId,...correction,confirmed:true});
  expect(changed.error).toBeUndefined();
  expect(changed.data).toMatchObject({sessionId,studentId,emailQueued:false,replayed:false});
  const replay=await page.request.put(path,{data:correction});
  expect(replay.status(),await replay.text()).toBe(200);
  expect(await replay.json()).toMatchObject({
   sessionId,studentId,replayed:true,revision:changed.data.revision,
  });
  const read=await page.request.get(path);
  expect(read.status(),await read.text()).toBe(200);
  expect(await read.json()).toMatchObject([{session_id:sessionId,student_id:studentId,
   body:correction.body,shared_with_contacts:false}]);
  const after=await call("ccp_sessions_details",{sessionId});
  expect(after.data).toEqual(session.data);

  const venue=await call("ccp_workplace_context_set",{
   selectedWorkplaceId:f.workplaceId,expectedSelectedWorkplaceId:null,confirmed:true,
  });
  expect(venue.error).toBeUndefined();
  const mcpList=await call("ccp_sessions_list",{workplaceId:f.workplaceId});
  const webList=await page.request.post("/api/agent/v1",{data:{
   action:"sessions.list",workplaceId:f.workplaceId,
  }});
  expect(webList.status(),await webList.text()).toBe(200);
  for(const rows of [mcpList.data,(await webList.json()).data]){
   expect(rows.find((row:{id:string})=>row.id===sessionId)).toMatchObject({
    id:sessionId,studentArchived:true,lesson_note:"Original review",
   });
  }
  const noteReads:string[]=[];
  page.on("request",request=>{
   const pathname=new URL(request.url()).pathname;
   if(request.method()==="GET"&&pathname===path)noteReads.push(pathname);
  });
  await page.goto("/coaching");
  const attendance=page.getByRole("heading",{name:"Session attendance",exact:true}).locator("..");
  const lessonPicker=attendance.locator("select").filter({
   has:page.locator('option[value="'+sessionId+'"]'),
  });
  await expect(lessonPicker).toHaveCount(1);
  await lessonPicker.selectOption(sessionId);
  await expect(attendance.getByRole("button",{name:"Save session changes"})).toHaveCount(0);
  await expect(attendance.getByText("Original review",{exact:true})).toBeHidden();
  await attendance.getByText("Original lesson summary",{exact:true}).click();
  await expect(attendance.getByText("Original review",{exact:true})).toBeVisible();
  await attendance.getByText("Original lesson summary",{exact:true}).click();
  await expect(attendance.getByText("Original review",{exact:true})).toBeHidden();
  const href="/schedule?session="+sessionId+"#lesson-notes-"+sessionId;
  const link=attendance.getByRole("link",{name:"Open this lesson’s coaching notes",exact:true});
  await expect(link).toHaveAttribute("href",href);
  await link.press("Enter");
  await expect(page).toHaveURL(url=>url.pathname+url.search+url.hash===href);
  await expect(page.locator('[data-calendar-date="2023-05-28"]').locator("#lesson-notes-"+sessionId)).toBeVisible();
  expect(noteReads).toHaveLength(0);
  const notesButton=page.locator("#lesson-notes-"+sessionId);
  await notesButton.click();
  const dialog=page.getByRole("dialog",{name:"Teaching session details",exact:true});
  await expect(dialog.getByLabel("Contact-shareable lesson note")).toHaveValue(correction.body);
  await dialog.getByLabel("Contact-shareable lesson note").fill("Browser corrected historical evidence");
  await dialog.getByRole("button",{name:"Save coaching notes",exact:true}).click();
  await expect(page.getByText("Coaching notes saved",{exact:true})).toBeVisible();
  expect(noteReads.length).toBeGreaterThan(0);
  expect((await call("ccp_session_notes_list",{sessionId})).data).toMatchObject([
   {student_id:studentId,body:"Browser corrected historical evidence",shared_with_contacts:false},
  ]);
  expect((await call("ccp_sessions_details",{sessionId})).data).toEqual(session.data);
  expect((await call("ccp_workplace_context_get",{})).data.selectedWorkplaceId).toBe(f.workplaceId);

  const other=await admin.from("teaching_sessions").select("id")
   .neq("teacher_id",teacher_id).limit(1).single();
  expect(other.error).toBeNull();
  for(const unusable of ["not-a-uuid",randomUUID(),other.data!.id]){
   await page.goto("/schedule?session="+unusable+"#lesson-notes-"+unusable);
   await expect(page.getByText("That lesson is unavailable in this calendar view.",{exact:true})).toBeVisible();
   await expect(page.locator("#lesson-notes-"+unusable)).toHaveCount(0);
  }
  const personal=await admin.from("workplaces").select("id")
   .eq("teacher_id",teacher_id).eq("kind","personal").single();
  expect(personal.error).toBeNull();
  expect((await call("ccp_workplace_context_set",{
   selectedWorkplaceId:personal.data!.id,expectedSelectedWorkplaceId:f.workplaceId,confirmed:true,
  })).error).toBeUndefined();
  await page.goto(href);
  await expect(page.getByText("That lesson is unavailable in this calendar view.",{exact:true})).toBeVisible();
  await expect(page.locator("#lesson-notes-"+sessionId)).toHaveCount(0);
  expect((await call("ccp_workplace_context_get",{})).data.selectedWorkplaceId).toBe(personal.data!.id);
  expect((await call("ccp_students_lifecycle_preview",{studentId})).data).toEqual(before);
 });

isolatedTeacherTest("PARITY: choose exact owned identities for mixed and multiple archived aliases without silent writes",
 async({page,request,isolatedTeacher})=>{
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,
   {auth:{persistSession:false,autoRefreshToken:false}});
  const owner=await admin.from("teachers").select("id").eq("email",isolatedTeacher.email).single();
  expect(owner.error).toBeNull();
  const teacher_id=owner.data!.id as string;
  await configureSyntheticStudentCapacity(admin,teacher_id,8,3);
  const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
  const f=await fixture(call,4);
  const [archivedA,archivedB,active,unrelated]=f.ids;
  const shared="Exact shared learner "+tag(),archivedOnly="Both archived learners "+tag();
  for(const studentId of [archivedA,archivedB,active]){
   const patch=await page.request.put("/api/students/"+studentId,{
    data:{nameAliases:studentId===active?[shared]:[shared,archivedOnly]},
   });
   expect(patch.status(),await patch.text()).toBe(200);
  }
  await archive(call,archivedA);
  await archive(call,archivedB);
  const title="Exact choice lesson "+tag(), startsAt="2063-01-11T10:00:00.000Z";
  const common={names:[shared],workplaceId:f.workplaceId,title,startsAt,durationMinutes:60};
  const before=async()=>{
   const [students,memberships,sessions]=await Promise.all([
    admin.from("students").select("id,archived_at,updated_at").eq("teacher_id",teacher_id).order("id"),
    admin.from("workplace_enrollments").select("id,student_id,revision,starts_on,ends_on,cancelled_at").eq("teacher_id",teacher_id).order("id"),
    admin.from("teaching_sessions").select("id").eq("teacher_id",teacher_id).order("id"),
   ]);
   for(const result of [students,memberships,sessions])expect(result.error).toBeNull();
   return [students.data,memberships.data,sessions.data];
  };
  const original=await before();
  const endpoint="/api/coaching/lesson-capture/preview";
  const compare=async(input:Record<string,unknown>)=>{
   const response=await page.request.post(endpoint,{data:input});
   expect(response.status(),await response.text()).toBe(200);
   const site=await response.json();
   const mcp=await call("ccp_lessons_capture_preview",input);
   expect(mcp.error).toBeUndefined();
   expect(mcp.data).toEqual(site);
   return site;
  };
  const ambiguous=await compare(common);
  expect(ambiguous).toMatchObject({canCommit:false,proposedSession:null,issues:[{code:"AMBIGUOUS_STUDENT"}]});
  expect(ambiguous.resolutions[0].studentId).toBeNull();
  expect(ambiguous.resolutions[0].candidates).toEqual(expect.arrayContaining([
   expect.objectContaining({id:archivedA,archived:true}),expect.objectContaining({id:archivedB,archived:true}),
   expect.objectContaining({id:active,archived:false}),
  ]));
  for(const wrong of [unrelated,randomUUID()]){
   const blocked=await compare({...common,studentChoices:[{index:0,studentId:wrong}]});
   expect(blocked).toMatchObject({canCommit:false,proposedSession:null,issues:[{code:"INVALID_STUDENT_CHOICE"}]});
   expect(JSON.stringify(blocked)).not.toContain(wrong);
  }
  const chosenActive=await compare({...common,studentChoices:[{index:0,studentId:active}]});
  expect(chosenActive).toMatchObject({canCommit:true,issues:[],proposedSession:{studentIds:[active]}});
  const duplicate=await compare({...common,names:[shared,shared],
   studentChoices:[{index:0,studentId:active},{index:1,studentId:active}]});
  expect(duplicate).toMatchObject({canCommit:false,issues:[{code:"DUPLICATE_STUDENT"}]});
  const malformed={...common,studentChoices:[{index:0,studentId:active},{index:0,studentId:archivedA}]};
  expect((await page.request.post(endpoint,{data:malformed})).status()).toBe(400);
  expect((await call("ccp_lessons_capture_preview",malformed)).error?.code).toBe("VALIDATION_ERROR");

  await page.goto("/coaching");
  const openPreview=async(alias:string)=>{
   await page.getByLabel("Student names, one per line (1–50)").fill(alias);
   await page.getByLabel("Workplace / time zone").selectOption(f.workplaceId);
   await page.getByLabel("Lesson title").fill(title);
   await page.getByLabel("Start time in workplace time zone").fill("2063-01-11T12:00");
   await page.getByRole("button",{name:"Preview only",exact:true}).click();
   const picker=page.getByRole("combobox",{name:/Choose learner for/});
   await expect(picker).toHaveValue("");
   return picker;
  };
  const mixed=await openPreview(shared);
  await expect(mixed.getByRole("option",{name:new RegExp("Active learner.*"+active)})).toHaveCount(1);
  await expect(mixed.getByRole("option",{name:new RegExp("Archived learner.*"+archivedB)})).toHaveCount(1);
  const verify=page.getByRole("button",{name:"Verify selected learners",exact:true});
  await expect(verify).toBeDisabled();
  // Native keyboard selection is local; leaving it unresolved abandons it.
  await mixed.focus();
  await mixed.press("ArrowDown");
  await expect(verify).toBeEnabled();
  await mixed.press("Home");
  await expect(verify).toBeDisabled();
  expect(await before()).toEqual(original);
  await mixed.selectOption(active);
  const activeResult=page.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().method()==="POST");
  await verify.click();
  expect(await (await activeResult).json()).toEqual(chosenActive);
  await expect(page.getByRole("button",{name:"Review archived learner and lesson"})).toHaveCount(0);
  expect(await before()).toEqual(original);

  const past=await openPreview(archivedOnly);
  await expect(past.getByRole("option",{name:new RegExp(archivedA)})).toHaveCount(1);
  await expect(past.getByRole("option",{name:new RegExp(archivedB)})).toHaveCount(1);
  await expect(past.getByRole("option",{name:new RegExp(active)})).toHaveCount(0);
  const chosen=await compare({...common,names:[archivedOnly],studentChoices:[{index:0,studentId:archivedB}]});
  expect(chosen).toMatchObject({canCommit:false,resolutions:[{studentId:archivedB,archived:true}],
   issues:[{code:"ARCHIVED_STUDENT_CONFIRMATION_REQUIRED"}]});
  await past.selectOption(archivedB);
  const archivedResult=page.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().method()==="POST");
  await verify.click();
  expect(await (await archivedResult).json()).toEqual(chosen);
  await page.getByRole("button",{name:"Review archived learner and lesson"}).click();
  const commit=page.getByRole("button",{name:"Confirm reactivation and create lesson"});
  await expect(commit).toBeDisabled();
  expect(await before()).toEqual(original);
  await page.getByLabel(/Reason for reactivation and new lesson/).fill("Explicitly choose the second archived learner");
  await page.getByLabel(/I approve reactivating these exact archived students/).check();
  await commit.click();
  await expect(page.getByRole("status").filter({hasText:"archived students reactivated atomically"})).toBeVisible();
  const found=await call("ccp_sessions_list",{query:title,workplaceId:f.workplaceId});
  expect(found.error).toBeUndefined();
  expect(found.data).toMatchObject([{title,student_id:archivedB,workplace_id:f.workplaceId}]);
  for(const [studentId,archived] of [[archivedA,true],[archivedB,false]]) {
   const lifecycle=await call("ccp_students_lifecycle_preview",{studentId});
   expect(lifecycle.error).toBeUndefined();
   expect(lifecycle.data.archived).toBe(archived);
  }
 });
