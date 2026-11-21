import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
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
