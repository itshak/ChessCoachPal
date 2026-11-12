import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

type Tool=Awaited<ReturnType<typeof delegatedTool>>;
const name=(prefix:string)=>prefix+" "+randomUUID().slice(0,9);
async function fixture(call:Tool){
 const workplace=await call("ccp_v1_workplaces_create",{
  name:name("Atomic lesson"),timezone:"UTC",currency:"USD",locale:"en",policy:{},
  idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 const students:string[]=[];
 for(let i=0;i<2;i++){
  const created=await call("ccp_v1_students_create",{
   name:name("Student"),idempotencyKey:randomUUID(),
  });
  expect(created.error).toBeUndefined();
  const studentId=created.data.entityId as string;
  students.push(studentId);
  expect((await call("ccp_v1_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
 }
 const group=await call("ccp_v1_groups_create",{
  workplaceId,name:name("Frozen class"),idempotencyKey:randomUUID(),
 });
 expect(group.error).toBeUndefined();
 const groupId=group.data.entityId as string;
 for(const studentId of students)
  expect((await call("ccp_v1_groups_enroll",{
   groupId,studentId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
 const created=await call("ccp_v1_sessions_create",{
  workplaceId,groupId,title:name("Endgame session"),
  // Never re-use a teacher-wide scheduled interval across test retries. One
  // failed assertion must not make every retry conflict with an earlier fixture.
  startsAt:new Date(Date.UTC(2058,0,1)+
   (Number.parseInt(randomUUID().slice(0,8),16)%(366*24*3600))*1000).toISOString(),
  durationMinutes:60,
  lessonNote:"Original teacher note stays unless explicitly changed",idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const sessionId=created.data.entityId as string;
 const details=await call("ccp_v1_sessions_details",{sessionId});
 expect(details.error).toBeUndefined();
 const attendance=await call("ccp_v1_attendance_preview",{sessionId});
 expect(attendance.error).toBeUndefined();
 const rows=attendance.data.attendance as Array<{
  student_id:string;status:string;updated_at:string;
 }>;
 expect(rows).toHaveLength(2);
 return {workplaceId,studentIds:students,sessionId,
  updatedAt:details.data.updated_at as string,rows};
}

test("PARITY:PARITY-sessions-complete-atomic rolls back stale roster and replays across website/MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const ctx=await fixture(call);
 const attendance=ctx.rows.map((row,i)=>({
  studentId:row.student_id,status:i===0?"present" as const:"late" as const,
  note:i===0?"Participated":"Late arrival",expectedUpdatedAt:row.updated_at,
 }));
 const payload={action:"sessions.complete" as const,sessionId:ctx.sessionId,
  expectedUpdatedAt:ctx.updatedAt,idempotencyKey:randomUUID(),
  attendance,lessonNote:"Opposition and triangulation",confirmed:true as const};
 // Website action discriminator is not part of the strictly validated MCP
 // tool arguments. Build one shared domain payload without an alias.
 const mcpPayload={
  sessionId:payload.sessionId,expectedUpdatedAt:payload.expectedUpdatedAt,
  idempotencyKey:payload.idempotencyKey,attendance:payload.attendance,
  lessonNote:payload.lessonNote,confirmed:true as const,
 };
 const stale=await page.request.post("/api/agent/v1",{data:{
  ...payload,idempotencyKey:randomUUID(),attendance:[
   {...attendance[0],expectedUpdatedAt:"2000-01-01T00:00:00.000Z"},
   attendance[1],
  ],
 }});
 expect(stale.status(),await stale.text()).toBe(409);
 const before=await call("ccp_v1_sessions_details",{sessionId:ctx.sessionId});
 expect(before.error).toBeUndefined();
 expect(before.data.status).toBe("scheduled");
 const registerBefore=await call("ccp_v1_attendance_preview",{sessionId:ctx.sessionId});
 expect(registerBefore.data.attendance.every((a:{status:string})=>a.status==="unmarked")).toBe(true);
 const partial=await call("ccp_v1_sessions_complete",{
  ...mcpPayload,attendance:[attendance[0]],idempotencyKey:randomUUID(),
 });
 expect(partial.error?.code).toBe("VALIDATION_ERROR");
 const committed=await page.request.post("/api/agent/v1",{data:payload});
 expect(committed.status(),await committed.text()).toBe(200);
 const receipt=(await committed.json()).data;
 expect(receipt).toMatchObject({operation:"sessions.commit",sessionId:ctx.sessionId});
 expect(receipt.attendance).toHaveLength(2);
 const replay=await call("ccp_v1_sessions_complete",{
  sessionId:payload.sessionId,expectedUpdatedAt:payload.expectedUpdatedAt,
  idempotencyKey:payload.idempotencyKey,attendance,lessonNote:payload.lessonNote,confirmed:true,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data).toEqual(receipt);
 const changedKey=await call("ccp_v1_sessions_complete",{
  ...mcpPayload,lessonNote:"Different confirmation",
 });
 expect(changedKey.error?.code).toBe("CONFLICT");
 const after=await call("ccp_v1_sessions_details",{sessionId:ctx.sessionId});
 expect(after.data.status).toBe("completed");
 expect(after.data.lesson_note).toBe("Opposition and triangulation");
 const websiteAttendance=await page.request.post("/api/agent/v1",{
  data:{action:"attendance.list",sessionId:ctx.sessionId},
 });
 expect(websiteAttendance.status()).toBe(200);
 const rows=(await websiteAttendance.json()).data;
 expect(rows.find((x:{student_id:string})=>x.student_id===attendance[0].studentId).status).toBe("present");
 expect(rows.find((x:{student_id:string})=>x.student_id===attendance[1].studentId).status).toBe("late");
});

test("PARITY:PARITY-sessions-complete-website form requires explicit per-learner approval",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const ctx=await fixture(call);
 await page.goto("/coaching");
 const panel=page.locator('section[aria-label="Complete coaching lesson"]');
 await expect(panel).toBeVisible();
 await panel.getByLabel("Lesson to complete").selectOption(ctx.sessionId);
 // Recover explicitly from superseded in-flight roster reads. This button is
 // also the teacher's real UI recovery action for a transient network error.
 await panel.getByRole("button",{name:"Reload selected roster"}).click();
 // The panel reads roster asynchronously after selecting a lesson. Bind the
 // assertions to the actual selected session/learner IDs, not a display name
 // that could also belong to another learner or transient previous roster.
 const selected=panel.locator('form[data-session-id="'+ctx.sessionId+'"]');
 await expect(selected).toBeVisible();
 const roster=await page.request.get("/api/coaching/sessions/"+ctx.sessionId+"/roster");
 expect(roster.status()).toBe(200);
 const persons=(await roster.json()).participants as Array<{studentId:string;name:string}>;
 for(const person of persons)
  await selected.locator('select[data-student-id="'+person.studentId+'"]').selectOption("present");
 await panel.getByText("I confirm these attendance statuses and lesson completion.").click();
 await panel.getByRole("button",{name:"Complete lesson"}).click();
 await expect(panel.getByRole("status")).toContainText("committed atomically");
 const details=await call("ccp_v1_sessions_details",{sessionId:ctx.sessionId});
 expect(details.error).toBeUndefined();
 expect(details.data.status).toBe("completed");
 expect(details.data.lesson_note).toBe("Original teacher note stays unless explicitly changed");
 const attendance=await call("ccp_v1_attendance_preview",{sessionId:ctx.sessionId});
 expect(attendance.data.attendance.every((a:{status:string})=>a.status==="present")).toBe(true);
});

test("PARITY:PARITY-completion-cannot-bypass rejects ordinary website/MCP and direct RLS completion",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const ctx=await fixture(call);
 const directWebsite=await page.request.post("/api/agent/v1",{
  data:{action:"sessions.update",sessionId:ctx.sessionId,status:"completed"},
 });
 expect(directWebsite.status(),await directWebsite.text()).toBe(400);
 const deniedMcp=await call("ccp_v1_sessions_edit",{
  sessionId:ctx.sessionId,changes:{status:"completed"},
  expectedUpdatedAt:ctx.updatedAt,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(deniedMcp.error?.code).toBe("VALIDATION_ERROR");
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const signIn=await client.auth.signInWithPassword(SEED_TEACHER);
 expect(signIn.error).toBeNull();
 const {error:rawError}=await client.from("teaching_sessions")
  .update({status:"completed"})
  .eq("id",ctx.sessionId)
  .eq("teacher_id",signIn.data.user!.id);
 expect(rawError?.code).toBe("22023");
 const still=await call("ccp_v1_sessions_details",{sessionId:ctx.sessionId});
 expect(still.error).toBeUndefined();
 expect(still.data.status).toBe("scheduled");
 const register=await call("ccp_v1_attendance_preview",{sessionId:ctx.sessionId});
 expect(register.error).toBeUndefined();
 expect(register.data.attendance.every((row:{status:string})=>row.status==="unmarked")).toBe(true);
});


test("PARITY:canonical-participant-cancellation preserves notice across website and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const ctx=await fixture(call);
 const participant=ctx.rows[0];
 const noticeAt="2057-12-21T09:30:00.000Z";
 const key=randomUUID();
 const input={
  sessionId:ctx.sessionId,studentId:participant.student_id,
  status:"student_cancelled",note:"Guardian communicated a cancellation",
  noticeAt,cancelReason:"School trip",
  expectedUpdatedAt:participant.updated_at,idempotencyKey:key,
 };
 const cancelled=await call("ccp_v1_attendance_record",input);
 expect(cancelled.error).toBeUndefined();
 expect(cancelled.data.attendance).toHaveLength(1);
 expect(cancelled.data.attendance[0]).toMatchObject({
  studentId:participant.student_id,status:"student_cancelled",
  cancelledBy:"student",cancelReason:"School trip",
 });
 expect(new Date(cancelled.data.attendance[0].noticeAt as string).toISOString()).toBe(noticeAt);
 const replay=await call("ccp_v1_attendance_record",input);
 expect(replay.error).toBeUndefined();
 expect(replay.data).toEqual(cancelled.data);
 const read=await page.request.post("/api/agent/v1",{
  data:{action:"attendance.list",sessionId:ctx.sessionId},
 });
 expect(read.status(),await read.text()).toBe(200);
 const row=(await read.json()).data.find((item:{student_id:string})=>
   item.student_id===participant.student_id);
 expect(row).toMatchObject({status:"student_cancelled",cancelled_by:"student",
   cancel_reason:"School trip"});
 expect(new Date(row.notice_at).toISOString()).toBe(noticeAt);
 // A teacher website correction and delegated MCP share a single SQL writer.
 const corrected=await page.request.post("/api/agent/v1",{
  data:{action:"attendance.record",sessionId:ctx.sessionId,
   studentId:participant.student_id,status:"present",note:"Attendance corrected"},
 });
 expect(corrected.status(),await corrected.text()).toBe(200);
 expect((await corrected.json()).data).toMatchObject({status:"present",
  cancelled_by:null,notice_at:null,cancel_reason:""});
 const conflict=await call("ccp_v1_attendance_record",{
  ...input,status:"teacher_cancelled",note:"Different decision",
 });
 expect(conflict.error?.code).toBe("CONFLICT");
});
