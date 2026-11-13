import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-unified-lessons-reconcile counts canonical teaching time only once",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const day="2042-06-12",startsAt=day+"T14:00:00.000Z";
 const workplace=await call("ccp_v1_workplaces_create",{
   name:"Unified history "+randomUUID(),timezone:"UTC",
   currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const wp=workplace.data.entityId as string;
 const student=await call("ccp_v1_students_create",{
   name:"Historic learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const id=student.data.entityId as string;
 expect((await call("ccp_v1_workplaces_enroll",{
   workplaceId:wp,studentId:id,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const modern=await call("ccp_v1_sessions_create",{
   workplaceId:wp,studentId:id,title:"Duplicate lesson evidence",
   startsAt,durationMinutes:60,lessonNote:"Modern record",
   idempotencyKey:randomUUID(),
 });
 expect(modern.error).toBeUndefined();
 const sessionId=modern.data.entityId as string;
 const attended=await page.request.post("/api/agent/v1",{data:{
   action:"attendance.record",sessionId,studentId:id,status:"present",
   note:"Recorded actual lesson",
 }});
 expect(attended.status(),await attended.text()).toBe(200);
 const query={from:day,to:day,studentId:id};
 const browser=await page.request.get("/api/coaching/unified-lessons?"+new URLSearchParams(query));
 expect(browser.status(),await browser.text()).toBe(200);
 const site=await browser.json();
 const tool=await call("ccp_v1_lessons_history_unified",query);
 expect(tool.error).toBeUndefined();
 expect(tool.data).toEqual(site);
 expect(site.total).toBe(1);
 expect(site.summary.canonicalSessionCount).toBe(1);
 expect(site.summary.bookedInstructorMinutes).toBe(60);
 expect(site.summary.evidencedInstructorMinutes).toBe(60);
 expect(site.entries).toHaveLength(1);
 expect(site.entries[0]).toMatchObject({id:sessionId,kind:"coaching"});
 const focused=await call("ccp_v1_lessons_history_unified",{
   from:day,to:day,workplaceId:wp,
 });
 expect(focused.error).toBeUndefined();
 expect(focused.data.summary.canonicalSessionCount).toBe(1);
 const missingId="00000000-0000-4000-8000-000000000001";
 const rejected=await call("ccp_v1_lessons_history_unified",{
   from:day,to:day,studentId:missingId,
 });
 expect(rejected.error?.code).toBe("NOT_FOUND");
 const websiteDenied=await page.request.get("/api/coaching/unified-lessons?"+
   new URLSearchParams({from:day,to:day,studentId:missingId}));
 expect(websiteDenied.status()).toBe(404);
});
