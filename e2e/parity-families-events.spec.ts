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


test("PARITY:PARITY-family-portal-replay keeps exactly one rotated secret across browser and MCP retries",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const create=await call("ccp_v1_guardians_create",{
   name:"Replay family "+randomUUID(),confirmed:true,
 });
 expect(create.error).toBeUndefined();
 const id=create.data.id as string;
 const key=randomUUID();
 const url="/api/guardians/"+id+"/rotate-token";
 const website=await page.request.post(url,{data:{requestId:key}});
 expect(website.status(),await website.text()).toBe(200);
 expect((await website.json()).replayed).toBe(false);
 const first=await page.request.get("/api/guardians/"+id);
 expect(first.status(),await first.text()).toBe(200);
 const firstToken=(await first.json()).portal_token as string;
 expect(firstToken).toBeTruthy();

 const modelRetry=await call("ccp_v1_guardians_rotate_portal_token",{
   guardianId:id,requestId:key,confirmed:true,
 });
 expect(modelRetry.error).toBeUndefined();
 expect(modelRetry.data.replayed).toBe(true);
 expect(modelRetry.data.secretNotReturned).toBe(true);
 expect(modelRetry.data.portal_token).toBeUndefined();
 const stable=await page.request.get("/api/guardians/"+id);
 expect((await stable.json()).portal_token).toBe(firstToken);

 const anotherKey=randomUUID();
 const modelRotate=await call("ccp_v1_guardians_rotate_portal_token",{
   guardianId:id,requestId:anotherKey,confirmed:true,
 });
 expect(modelRotate.error).toBeUndefined();
 expect(modelRotate.data.replayed).toBe(false);
 const newToken=(await (await page.request.get("/api/guardians/"+id)).json()).portal_token as string;
 expect(newToken).toBeTruthy();
 expect(newToken).not.toBe(firstToken);

 const browserRetry=await page.request.post(url,{data:{requestId:anotherKey}});
 expect(browserRetry.status(),await browserRetry.text()).toBe(200);
 expect((await browserRetry.json()).replayed).toBe(true);
 expect((await (await page.request.get("/api/guardians/"+id)).json()).portal_token).toBe(newToken);

 const other=await call("ccp_v1_guardians_create",{
   name:"Different family "+randomUUID(),confirmed:true,
 });
 expect(other.error).toBeUndefined();
 const conflict=await call("ccp_v1_guardians_rotate_portal_token",{
   guardianId:other.data.id,requestId:anotherKey,confirmed:true,
 });
 expect(conflict.error?.code).toBe("IDEMPOTENCY_CONFLICT");
});


test("PARITY:PARITY-families-list-create matches website and MCP while redacting contact details",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const websiteName="Browser family "+randomUUID();
 const created=await page.request.post("/api/guardians",{data:{
   name:websiteName,email:"synthetic-"+randomUUID()+"@example.com",
 }});
 expect(created.status(),await created.text()).toBe(200);
 const websiteFamily=await created.json();
 const listedSite=await page.request.get("/api/guardians");
 expect(listedSite.status(),await listedSite.text()).toBe(200);
 const listedModel=await call("ccp_v1_guardians_list",{});
 expect(listedModel.error).toBeUndefined();
 const record=(listedModel.data as Array<{id:string;name:string;email?:string;portal_token?:string}>)
   .find(x=>x.id===websiteFamily.id);
 expect(record).toMatchObject({id:websiteFamily.id,name:websiteName});
 expect(record?.email).toBeUndefined();
 expect(record?.portal_token).toBeUndefined();
 expect((await listedSite.json()).some((x:{id:string})=>x.id===websiteFamily.id)).toBe(true);
 const modelName="Model family "+randomUUID();
 const modelCreate=await call("ccp_v1_guardians_create",{
   name:modelName,confirmed:true,
 });
 expect(modelCreate.error).toBeUndefined();
 const webDetail=await page.request.get("/api/guardians/"+modelCreate.data.id);
 expect(webDetail.status(),await webDetail.text()).toBe(200);
 expect((await webDetail.json()).name).toBe(modelName);
});

test("PARITY:PARITY-events-list-create shares exact event summaries from website and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const title="Browser chess event "+randomUUID();
 const browser=await page.request.post("/api/events",{data:{
   title,startsAt:"2045-01-23T11:00:00+02:00",
   endsAt:"2045-01-23T13:00:00+02:00",studentIds:[],
 }});
 expect(browser.status(),await browser.text()).toBe(201);
 const eventId=(await browser.json()).event.id as string;
 const model=await call("ccp_v1_events_list",{});
 expect(model.error).toBeUndefined();
 const site=await page.request.get("/api/events");
 expect(site.status(),await site.text()).toBe(200);
 expect(model.data).toEqual(await site.json());
 expect(model.data.events.some((x:{id:string;title:string})=>
   x.id===eventId&&x.title===title)).toBe(true);
 const other=await call("ccp_v1_events_create",{
   title:"Model chess event "+randomUUID(),
   startsAt:"2045-01-24T14:00:00+02:00",studentIds:[],confirmed:true,
 });
 expect(other.error).toBeUndefined();
 const detail=await page.request.get("/api/events/"+other.data.event.id);
 expect(detail.status(),await detail.text()).toBe(200);
 expect((await detail.json()).event.title).toBe(other.data.event.title);
});
