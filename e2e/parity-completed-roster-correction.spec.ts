import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

/**
 * Real delegated OAuth and authenticated browser operations exercise the
 * same SQL correction. No fake tool list, manual DB patch or completion-by-
 * naming: original attendance is auditable, no group roster is rewritten.
 */
test("PARITY:PARITY-calendar-correct-frozen-history completes group roster correction with atomic audit/replay",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const create=async(name:string,payload:Record<string,unknown>)=>{
   const result=await call(name,payload);
   expect(result.error,JSON.stringify(result)).toBeUndefined();
   return result.data.entityId as string;
 };
 const workplaceId=await create("ccp_v1_workplaces_create",{
   name:"Roster correction "+randomUUID(),timezone:"UTC",locale:"en",
   currency:"USD",policy:{},idempotencyKey:randomUUID(),
 });
 const studentA=await create("ccp_v1_students_create",{
   name:"Frozen alpha "+randomUUID(),idempotencyKey:randomUUID(),
 });
 const studentB=await create("ccp_v1_students_create",{
   name:"Frozen beta "+randomUUID(),idempotencyKey:randomUUID(),
 });
 const studentC=await create("ccp_v1_students_create",{
   name:"Historical late entrant "+randomUUID(),idempotencyKey:randomUUID(),
 });
 const groupId=await create("ccp_v1_groups_create",{
   workplaceId,name:"Historical correcting class",idempotencyKey:randomUUID(),
 });
 for(const id of [studentA,studentB]){
   const member=await call("ccp_v1_groups_enroll",{
     groupId,studentId:id,idempotencyKey:randomUUID(),
   });
   expect(member.error).toBeUndefined();
 }
 const sessionId=await create("ccp_v1_sessions_create",{
   workplaceId,groupId,title:"Completed rook endgame",
   startsAt:"2048-03-02T14:00:00.000Z",durationMinutes:60,
   lessonNote:"Original group lesson",idempotencyKey:randomUUID(),
 });
 const browserAttendance=await page.request.post("/api/agent/v1",{data:{
   action:"attendance.record",sessionId,studentId:studentB,
   status:"absent",note:"Originally marked absent, requires correction",
 }});
 expect(browserAttendance.status(),await browserAttendance.text()).toBe(200);
 const details=await call("ccp_v1_sessions_details",{sessionId});
 expect(details.error).toBeUndefined();
 const attendance=await call("ccp_v1_attendance_preview",{sessionId});
 expect(attendance.error).toBeUndefined();
 const completed=await call("ccp_v1_sessions_complete",{
   sessionId,expectedUpdatedAt:details.data.updated_at,
   idempotencyKey:randomUUID(),confirmed:true,
   attendance:attendance.data.attendance.map((row:{
     student_id:string;status:string;note:string;updated_at:string;
   })=>({
     studentId:row.student_id,
     status:row.status==="absent"?"absent":"present",
     note:row.note,
     expectedUpdatedAt:row.updated_at,
   })),
 });
 expect(completed.error).toBeUndefined();

 const url="/api/coaching/sessions/"+sessionId+"/roster";
 const siteBefore=await page.request.get(url);
 expect(siteBefore.status(),await siteBefore.text()).toBe(200);
 const preview=await siteBefore.json();
 expect(preview.studentIds.slice().sort()).toEqual([studentA,studentB].sort());
 expect(preview.status).toBe("completed");
 const mcpBefore=await call("ccp_v1_sessions_roster_preview",{sessionId});
 expect(mcpBefore.error).toBeUndefined();
 expect(mcpBefore.data.studentIds).toEqual(preview.studentIds);
 expect(mcpBefore.data.updatedAt).toBe(preview.updatedAt);

 const args={
   sessionId,studentIds:[studentA,studentC],
   expectedUpdatedAt:preview.updatedAt,idempotencyKey:randomUUID(),
   reason:"Correct mistaken historical attendee after coach review",
   confirmed:true,
 };
 const denied=await call("ccp_v1_sessions_roster_correct",{
   ...args,confirmed:false,
 });
 expect(denied.error?.code).toBe("VALIDATION_ERROR");
 const revised=await call("ccp_v1_sessions_roster_correct",args);
 expect(revised.error).toBeUndefined();
 expect(revised.data.removedStudentIds).toEqual([studentB]);
 expect(revised.data.addedStudentIds).toEqual([studentC]);
 const replay=await call("ccp_v1_sessions_roster_correct",args);
 expect(replay.error).toBeUndefined();
 expect(replay.data).toEqual(revised.data);
 const changedKey=await call("ccp_v1_sessions_roster_correct",{
   ...args,reason:"Different historical reason, same request key",
 });
 expect(changedKey.error?.code).toBe("CONFLICT");
 const stale=await call("ccp_v1_sessions_roster_correct",{
   ...args,idempotencyKey:randomUUID(),
 });
 expect(stale.error?.code).toBe("CONFLICT");

 const siteAfter=await page.request.get(url);
 expect(siteAfter.status(),await siteAfter.text()).toBe(200);
 const current=await siteAfter.json();
 expect(current.studentIds.slice().sort()).toEqual([studentA,studentC].sort());
 expect(current.updatedAt).not.toBe(preview.updatedAt);
 const register=await page.request.post("/api/agent/v1",{data:{
   action:"attendance.list",sessionId,
 }});
 expect(register.status(),await register.text()).toBe(200);
 const marks=(await register.json()).data as {student_id:string;status:string}[];
 expect(marks.map(x=>x.student_id).sort()).toEqual([studentA,studentC].sort());
 expect(marks.find(x=>x.student_id===studentC)?.status).toBe("unmarked");

 const publicAudit=await call("ccp_v1_sessions_roster_revisions_list",{sessionId});
 expect(publicAudit.error).toBeUndefined();
 expect(publicAudit.data.corrections).toHaveLength(1);
 expect(publicAudit.data.corrections[0].removedAttendanceCount).toBe(1);
 expect(publicAudit.data.corrections[0].removedAttendance).toBeUndefined();
 const refusedPrivate=await call("ccp_v1_sessions_roster_revisions_list",{
   sessionId,includePrivate:true,
 });
 expect(refusedPrivate.error?.code).toBe("VALIDATION_ERROR");
 const privateAudit=await call("ccp_v1_sessions_roster_revisions_list",{
   sessionId,includePrivate:true,confirmed:true,
 });
 expect(privateAudit.error).toBeUndefined();
 expect(privateAudit.data.corrections[0].removedAttendance[0].student_id).toBe(studentB);
 expect(privateAudit.data.corrections[0].removedAttendance[0].note)
   .toBe("Originally marked absent, requires correction");
 const siteAudit=await page.request.get(url+"?revisions=true&includePrivate=true&confirmed=true");
 expect(siteAudit.status(),await siteAudit.text()).toBe(200);
 expect((await siteAudit.json()).corrections).toEqual(privateAudit.data.corrections);
 expect((await page.request.get(url+"?revisions=true&includePrivate=true")).status()).toBe(400);

 // Browser corrections must be visible to delegated MCP, with the original
 // audited attendance still retrievable even though current row has changed.
 const browserCorrection=await page.request.post(url,{data:{
   studentIds:[studentA,studentB,studentC],expectedUpdatedAt:current.updatedAt,
   idempotencyKey:randomUUID(),reason:"Reinstate pupil for signed class list",
   confirmed:true,
 }});
 expect(browserCorrection.status(),await browserCorrection.text()).toBe(200);
 const modelFinal=await call("ccp_v1_sessions_roster_preview",{sessionId});
 expect(modelFinal.error).toBeUndefined();
 expect(modelFinal.data.studentIds.slice().sort()).toEqual([studentA,studentB,studentC].sort());
 const history=await call("ccp_v1_sessions_roster_revisions_list",{sessionId});
 expect(history.error).toBeUndefined();
 expect(history.data.corrections).toHaveLength(2);
 expect(history.data.corrections[1].previousStudentIds).toEqual([studentA,studentB].sort());

 // A foreign or invented learner ID cannot be slipped into history.
 const bad=await page.request.post(url,{data:{
   studentIds:[studentA,randomUUID()],expectedUpdatedAt:modelFinal.data.updatedAt,
   idempotencyKey:randomUUID(),reason:"Do not attach unowned student",
   confirmed:true,
 }});
 expect(bad.status()).toBe(404);
 const still=await call("ccp_v1_sessions_roster_preview",{sessionId});
 expect(still.data.studentIds.slice().sort()).toEqual([studentA,studentB,studentC].sort());
});

test("PARITY:PARITY-session-roster-foreign-tenant denies snapshot, confidential audit and corrections in website and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const {createClient}=await import("@supabase/supabase-js");
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const email="foreign-roster-"+randomUUID()+"@example.com";
 const created=await admin.auth.admin.createUser({
  email,password:"SyntheticRosterTenant-123!",email_confirm:true,
 });
 expect(created.error).toBeNull();
 const teacherId=created.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id:teacherId,email,display_name:"Foreign historical teacher",
   hosted_enforced:false,
  })).error).toBeNull();
  const workplace=await admin.from("workplaces").insert({
   teacher_id:teacherId,name:"Foreign chess school",timezone:"UTC",
  }).select("id").single();
  expect(workplace.error).toBeNull();
  const pupil=await admin.from("students").insert({
   teacher_id:teacherId,name:"Unrelated roster learner",
  }).select("id").single();
  expect(pupil.error).toBeNull();
  const studentId=pupil.data!.id as string;
  const workplaceId=workplace.data!.id as string;
  expect((await admin.from("workplace_enrollments").insert({
   teacher_id:teacherId,workplace_id:workplaceId,student_id:studentId,
  })).error).toBeNull();
  const session=await admin.from("teaching_sessions").insert({
   teacher_id:teacherId,workplace_id:workplaceId,student_id:studentId,
   title:"Other teacher's private history",
   starts_at:"2054-01-01T12:00:00.000Z",duration_minutes:60,
   status:"scheduled",
  }).select("id,updated_at").single();
  expect(session.error).toBeNull();
  const id=session.data!.id as string;
  // The current canonical private-session trigger freezes this learner
  // into the roster at session creation, so a second insert is a duplicate.
  const frozen=await admin.from("session_participants").select("student_id")
    .eq("session_id",id);
  expect(frozen.error).toBeNull();
  expect(frozen.data?.map(row=>row.student_id)).toEqual([studentId]);

  const site=await page.request.get("/api/coaching/sessions/"+id+"/roster");
  expect(site.status(),await site.text()).toBe(404);
  const model=await call("ccp_v1_sessions_roster_preview",{sessionId:id});
  expect(model.error?.code).toBe("NOT_FOUND");
  const privateSite=await page.request.get(
   "/api/coaching/sessions/"+id+"/roster?revisions=true&includePrivate=true&confirmed=true");
  expect(privateSite.status(),await privateSite.text()).toBe(404);
  const privateModel=await call("ccp_v1_sessions_roster_revisions_list",{
   sessionId:id,includePrivate:true,confirmed:true,
  });
  expect(privateModel.error?.code).toBe("NOT_FOUND");

  const correction={
   studentIds:[studentId],expectedUpdatedAt:session.data!.updated_at,
   idempotencyKey:randomUUID(),reason:"Try to edit another tenant's snapshot",
   confirmed:true,
  };
  const deniedWeb=await page.request.post(
   "/api/coaching/sessions/"+id+"/roster",{data:correction});
  expect(deniedWeb.status(),await deniedWeb.text()).toBe(404);
  const deniedMcp=await call("ccp_v1_sessions_roster_correct",{
   sessionId:id,...correction,idempotencyKey:randomUUID(),
  });
  expect(deniedMcp.error?.code).toBe("NOT_FOUND");
  const still=await admin.from("teaching_sessions")
   .select("updated_at,title").eq("id",id).single();
  expect(still.error).toBeNull();
  expect(still.data!.updated_at).toBe(session.data!.updated_at);
  expect(still.data!.title).toBe("Other teacher's private history");
 }finally{
  await admin.auth.admin.deleteUser(teacherId);
 }
});
