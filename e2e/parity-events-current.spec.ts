import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-events-crud schedules event roster and synchronizes changes without auto-email",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=(await call("ccp_students_create",{
   name:"Event participant "+randomUUID(),idempotencyKey:randomUUID(),
 })).data as {entityId:string};
 const title="Class tournament "+randomUUID();
 const created=await call("ccp_events_create",{
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
 const mcpRead=await call("ccp_events_detail",{eventId});
 expect(mcpRead.error).toBeUndefined();
 expect(mcpRead.data.event.location).toBe("Updated training venue");
 const changed=await call("ccp_events_update",{
   eventId,title:title+" revised",confirmed:true,
 });
 expect(changed.error).toBeUndefined();
 const browser=await page.request.get("/api/events/"+eventId);
 expect(browser.status()).toBe(200);
 expect((await browser.json()).event.title).toBe(title+" revised");
 const impact=await call("ccp_events_delete_impact",{eventId});
 expect(impact.error).toBeUndefined();
 const deleted=await call("ccp_events_delete",{eventId,confirmed:true});
 expect(deleted.error).toBeUndefined();
 const gone=await page.request.get("/api/events/"+eventId);
 expect(gone.status()).toBe(404);
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
 const model=await call("ccp_events_list",{});
 expect(model.error).toBeUndefined();
 const site=await page.request.get("/api/events");
 expect(site.status(),await site.text()).toBe(200);
 expect(model.data).toEqual(await site.json());
 expect(model.data.events.some((x:{id:string;title:string})=>
   x.id===eventId&&x.title===title)).toBe(true);
 const other=await call("ccp_events_create",{
   title:"Model chess event "+randomUUID(),
   startsAt:"2045-01-24T14:00:00+02:00",studentIds:[],confirmed:true,
 });
 expect(other.error).toBeUndefined();
 const detail=await page.request.get("/api/events/"+other.data.event.id);
 expect(detail.status(),await detail.text()).toBe(200);
 expect((await detail.json()).event.title).toBe(other.data.event.title);
});
