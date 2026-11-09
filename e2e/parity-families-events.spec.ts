import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-families-crud manages linked students and safe deletion through website and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=(await call("ccp_v1_students_create",{
   name:"Family pupil "+randomUUID(),idempotencyKey:randomUUID(),
 })).data as {entityId:string};
 expect(student.entityId).toBeTruthy();
 const family=await call("ccp_v1_guardians_create",{
   name:"Guardian "+randomUUID(),email:"family-"+randomUUID()+"@example.com",
   studentIds:[student.entityId],confirmed:true,
 });
 expect(family.error).toBeUndefined();
 const guardianId=family.data.id as string;
 expect(family.data.portal_token).toBeUndefined();
 expect(family.data.email).toBeUndefined();
 const website=await page.request.get("/api/guardians/"+guardianId);
 expect(website.status(),await website.text()).toBe(200);
 const detail=await website.json();
 expect(detail.name).toBeTruthy();
 const linked=await page.request.get("/api/students/"+student.entityId);
 expect(linked.status()).toBe(200);
 expect((await linked.json()).guardian_id).toBe(guardianId);
 const updated=await page.request.put("/api/guardians/"+guardianId,{data:{
   familyName:"Revised family "+randomUUID(),
 }});
 expect(updated.status(),await updated.text()).toBe(200);
 const read=await call("ccp_v1_guardians_detail",{guardianId});
 expect(read.error).toBeUndefined();
 expect(read.data.family_name).toContain("Revised family");
 const blocked=await call("ccp_v1_guardians_delete_impact",{guardianId});
 expect(blocked.error).toBeUndefined();
 expect(blocked.data.studentCount).toBe(1);
 const refusal=await call("ccp_v1_guardians_delete",{guardianId,confirmed:true});
 expect(refusal.error).toBeDefined();
 const detach=await call("ccp_v1_guardians_update",{
   guardianId,studentIds:[],confirmed:true,
 });
 expect(detach.error).toBeUndefined();
 const refreshed=await page.request.get("/api/students/"+student.entityId);
 expect(refreshed.status()).toBe(200);
 expect((await refreshed.json()).guardian_id).toBeNull();
 const safe=await call("ccp_v1_guardians_delete_impact",{guardianId});
 expect(safe.data.studentCount).toBe(0);
 const removed=await call("ccp_v1_guardians_delete",{guardianId,confirmed:true});
 expect(removed.error).toBeUndefined();
 const after=await page.request.get("/api/guardians/"+guardianId);
 expect(after.status()).toBe(404);
});

test("PARITY:PARITY-families-token-rotation invalidates old link without returning model secrets",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const created=await call("ccp_v1_guardians_create",{
   name:"Portal family "+randomUUID(),confirmed:true,
 });
 expect(created.error).toBeUndefined();
 const guardianId=created.data.id as string;
 const before=await page.request.get("/api/guardians/"+guardianId);
 expect(before.status()).toBe(200);
 const oldToken=(await before.json()).portal_token as string;
 expect(oldToken).toBeTruthy();
 const rotation=await call("ccp_v1_guardians_rotate_portal_token",{
   guardianId,confirmed:true,
 });
 expect(rotation.error).toBeUndefined();
 expect(rotation.data.secretNotReturned).toBe(true);
 expect(rotation.data.portal_token).toBeUndefined();
 const browser=await page.request.get("/api/guardians/"+guardianId);
 expect(browser.status()).toBe(200);
 const token=(await browser.json()).portal_token as string;
 expect(token).toBeTruthy();
 expect(token).not.toBe(oldToken);
 const ordinary=await call("ccp_v1_guardians_detail",{guardianId});
 expect(ordinary.error).toBeUndefined();
 expect(ordinary.data.portal_token).toBeUndefined();
 const confirmed=await call("ccp_v1_guardians_detail",{
   guardianId,includeContacts:true,confirmed:true,
 });
 expect(confirmed.error).toBeUndefined();
 expect(confirmed.data.portal_token).toBeUndefined();
});

test("PARITY:PARITY-events-crud schedules event roster and synchronizes changes without auto-email",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=(await call("ccp_v1_students_create",{
   name:"Event participant "+randomUUID(),idempotencyKey:randomUUID(),
 })).data as {entityId:string};
 const title="Class tournament "+randomUUID();
 const created=await call("ccp_v1_events_create",{
   title,startsAt:"2027-01-23T11:00:00+02:00",
   endsAt:"2027-01-23T13:00:00+02:00",
   studentIds:[student.entityId],location:"Training hall",confirmed:true,
 });
 expect(created.error).toBeUndefined();
 const eventId=created.data.event.id as string;
 const website=await page.request.get("/api/events/"+eventId);
 expect(website.status(),await website.text()).toBe(200);
 const event=(await website.json()).event;
 expect(event.title).toBe(title);
 expect(event.students.map((x:{studentId:string})=>x.studentId))
   .toContain(student.entityId);
 const websiteEdit=await page.request.put("/api/events/"+eventId,{data:{
   location:"Updated training venue",
 }});
 expect(websiteEdit.status(),await websiteEdit.text()).toBe(200);
 const mcpRead=await call("ccp_v1_events_detail",{eventId});
 expect(mcpRead.error).toBeUndefined();
 expect(mcpRead.data.event.location).toBe("Updated training venue");
 const changed=await call("ccp_v1_events_update",{
   eventId,title:title+" revised",confirmed:true,
 });
 expect(changed.error).toBeUndefined();
 const browser=await page.request.get("/api/events/"+eventId);
 expect(browser.status()).toBe(200);
 expect((await browser.json()).event.title).toBe(title+" revised");
 const impact=await call("ccp_v1_events_delete_impact",{eventId});
 expect(impact.error).toBeUndefined();
 const deleted=await call("ccp_v1_events_delete",{eventId,confirmed:true});
 expect(deleted.error).toBeUndefined();
 const gone=await page.request.get("/api/events/"+eventId);
 expect(gone.status()).toBe(404);
});
