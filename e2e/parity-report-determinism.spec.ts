import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-reports-shared-determinism gives identical website/MCP totals after corrections",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const day="2042-04-12";
 const workplace=await call("ccp_v1_workplaces_create",{
   name:"Deterministic reports "+randomUUID(),timezone:"UTC",
   currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 const student=await call("ccp_v1_students_create",{
   name:"Report learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const enrolled=await call("ccp_v1_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:randomUUID(),
 });
 expect(enrolled.error).toBeUndefined();
 const session=await call("ccp_v1_sessions_create",{
   workplaceId,studentId,title:"Endgame interval",
   startsAt:day+"T10:00:00.000Z",durationMinutes:45,
   lessonNote:"Synthetic comparison",idempotencyKey:randomUUID(),
 });
 expect(session.error).toBeUndefined();
 const sessionId=session.data.entityId as string;
 const path="/api/coaching/report?"+new URLSearchParams({
   workplaceId,from:day,to:day,
 });
 const websiteBefore=await page.request.get(path);
 expect(websiteBefore.status(),await websiteBefore.text()).toBe(200);
 const before=await websiteBefore.json();
 const mcpBefore=await call("ccp_v1_reports_workplace_summary",{
   workplaceId,from:day,to:day,format:"json",
 });
 expect(mcpBefore.error).toBeUndefined();
 expect(mcpBefore.data).toEqual(before);
 expect(before.report.sessions).toBe(1);
 expect(before.report.teachingMinutes).toBe(45);
 const correction=await page.request.post("/api/agent/v1",{data:{
   action:"attendance.record",sessionId,studentId,status:"late",
   note:"Synthetic late arrival",
 }});
 expect(correction.status(),await correction.text()).toBe(200);
 const siteAfter=await page.request.get(path);
 expect(siteAfter.status()).toBe(200);
 const corrected=await siteAfter.json();
 const mcpAfter=await call("ccp_v1_reports_workplace_summary",{
   workplaceId,from:day,to:day,format:"json",
 });
 expect(mcpAfter.error).toBeUndefined();
 expect(mcpAfter.data).toEqual(corrected);
 expect(corrected.report.attendance.late).toBe(1);
 expect(corrected.report.teachingMinutes).toBe(45);
 const again=await call("ccp_v1_reports_workplace_summary",{
   workplaceId,from:day,to:day,format:"json",
 });
 expect(again.data).toEqual(mcpAfter.data);
});
