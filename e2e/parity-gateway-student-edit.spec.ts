import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-student-basic-edit-revision-replay uses one SQL receipt across website and delegated MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const made=await call("ccp_v1_students_create",{
  name:"Basic edit parity "+randomUUID().slice(0,8),level:"Beginner",
  idempotencyKey:randomUUID(),
 });
 expect(made.error).toBeUndefined();
 const studentId=made.data.entityId as string;
 const before=await page.request.post("/api/agent/v1",{
  data:{action:"students.search",query:"Basic edit parity"},
 });
 expect(before.status(),await before.text()).toBe(200);
 const row=((await before.json()).data as Array<{
  id:string;name:string;level:string;updated_at:string;
 }>).find(x=>x.id===studentId);
 expect(row).toBeDefined();

 const key=randomUUID();
 const browserPayload={
  action:"students.update" as const,studentId,
  name:row!.name,level:"Intermediate",
  expectedUpdatedAt:row!.updated_at,idempotencyKey:key,
 };
 const browser=await page.request.post("/api/agent/v1",{data:browserPayload});
 expect(browser.status(),await browser.text()).toBe(200);
 const receipt=(await browser.json()).data;
 expect(receipt).toMatchObject({
  operation:"students.update",entityId:studentId,idempotencyKey:key,
 });
 const modelReplay=await call("ccp_v1_students_update",{
  studentId,name:row!.name,level:"Intermediate",
  expectedUpdatedAt:row!.updated_at,idempotencyKey:key,
 });
 expect(modelReplay.error).toBeUndefined();
 expect(modelReplay.data).toEqual(receipt);
 const updated=await call("ccp_v1_students_search",{query:row!.name});
 expect(updated.error).toBeUndefined();
 const refreshed=(updated.data as Array<{id:string;level:string;updated_at:string}>)
  .find(x=>x.id===studentId);
 expect(refreshed?.level).toBe("Intermediate");
 expect(refreshed?.updated_at).toBe(receipt.revision);

 const reused=await call("ccp_v1_students_update",{
  studentId,name:row!.name,level:"Different under same key",
  expectedUpdatedAt:row!.updated_at,idempotencyKey:key,
 });
 expect(reused.error?.code).toBe("CONFLICT");
 const stale=await page.request.post("/api/agent/v1",{data:{
  ...browserPayload,idempotencyKey:randomUUID(),level:"Stale overwrite",
 }});
 expect(stale.status(),await stale.text()).toBe(409);
 const missing=await page.request.post("/api/agent/v1",{data:{
  action:"students.update",studentId,level:"Unreviewed overwrite",
 }});
 expect(missing.status(),await missing.text()).toBe(400);

 const reverseKey=randomUUID();
 const updatedMcp=await call("ccp_v1_students_update",{
  studentId,level:"Advanced",expectedUpdatedAt:refreshed!.updated_at,
  idempotencyKey:reverseKey,
 });
 expect(updatedMcp.error).toBeUndefined();
 const browserReplay=await page.request.post("/api/agent/v1",{data:{
  action:"students.update",studentId,level:"Advanced",
  expectedUpdatedAt:refreshed!.updated_at,idempotencyKey:reverseKey,
 }});
 expect(browserReplay.status(),await browserReplay.text()).toBe(200);
 expect((await browserReplay.json()).data).toEqual(updatedMcp.data);
 const site=await page.request.post("/api/agent/v1",{
  data:{action:"students.search",query:row!.name},
 });
 expect(site.status(),await site.text()).toBe(200);
 expect((await site.json()).data.find((x:{id:string})=>x.id===studentId).level)
  .toBe("Advanced");
});
