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
 const completed=await call("ccp_v1_sessions_edit",{
   sessionId,expectedUpdatedAt:details.data.updated_at,
   idempotencyKey:randomUUID(),confirmed:true,
   changes:{status:"completed"},
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
