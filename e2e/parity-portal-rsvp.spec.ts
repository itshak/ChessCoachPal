import {randomUUID} from "node:crypto";
import {expect,test,type Page} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

type Tool=(name:string,args:Record<string,unknown>)=>Promise<{
 data?:any;error?:{code:string;message:string};
}>;
async function setup(call:Tool,page:Page){
 const pupil=await call("ccp_v1_students_create",{
   name:"RSVP learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(pupil.error).toBeUndefined();
 const studentId=pupil.data.entityId as string;
 const family=await call("ccp_v1_guardians_create",{
   name:"Guardian "+randomUUID(),studentIds:[studentId],confirmed:true,
 });
 expect(family.error).toBeUndefined();
 const guardianId=family.data.id as string;
 const browser=await page.request.get("/api/guardians/"+guardianId);
 expect(browser.status()).toBe(200);
 const token=(await browser.json()).portal_token as string;
 expect(token).toBeTruthy();
 const title="Coach tournament "+randomUUID();
 const made=await call("ccp_v1_events_create",{
   title,startsAt:"2043-02-20T09:00:00+02:00",
   endsAt:"2043-02-20T11:00:00+02:00",studentIds:[studentId],confirmed:true,
 });
 expect(made.error).toBeUndefined();
 const eventId=made.data.event.id as string;
 return {studentId,guardianId,token,eventId,title};
}
const rsvp=(token:string,id:string)=>"/api/portal/"+encodeURIComponent(token)+
 "/events/"+id+"/rsvp";

test("PARITY:PARITY-events-lifecycle-rsvp reads, edits and removes owned events across both clients",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const record=await setup(call,page);
 const webList=await page.request.get("/api/events");
 expect(webList.status(),await webList.text()).toBe(200);
 expect((await webList.json()).events.some((x:{id:string})=>x.id===record.eventId))
   .toBe(true);
 const list=await call("ccp_v1_events_list",{});
 expect(list.error).toBeUndefined();
 expect(list.data.events.some((x:{id:string})=>x.id===record.eventId)).toBe(true);
 const accepted=await page.request.post(rsvp(record.token,record.eventId),{
   data:{status:"yes",partySize:2,note:"We will participate"},
 });
 expect(accepted.status(),await accepted.text()).toBe(200);
 const browser=await page.request.get("/api/events/"+record.eventId);
 expect(browser.status()).toBe(200);
 const event=(await browser.json()).event;
 expect(event.rsvps.find((x:{guardianId:string})=>
   x.guardianId===record.guardianId)?.status).toBe("yes");
 const fromMcp=await call("ccp_v1_events_detail",{
   eventId:record.eventId,includeRsvps:true,confirmed:true,
 });
 expect(fromMcp.error).toBeUndefined();
 expect(fromMcp.data.event.rsvps).toEqual(event.rsvps);
 const websiteEdit=await page.request.put("/api/events/"+record.eventId,{
   data:{location:"Chess center",description:"Individual Swiss rounds"},
 });
 expect(websiteEdit.status(),await websiteEdit.text()).toBe(200);
 expect((await call("ccp_v1_events_detail",{eventId:record.eventId}))
   .data.event.location).toBe("Chess center");
 const modelEdit=await call("ccp_v1_events_update",{
   eventId:record.eventId,title:record.title+" revised",confirmed:true,
 });
 expect(modelEdit.error).toBeUndefined();
 const after=await page.request.get("/api/events/"+record.eventId);
 expect((await after.json()).event.title).toBe(record.title+" revised");
 const preview=await call("ccp_v1_events_delete_impact",{eventId:record.eventId});
 expect(preview.error).toBeUndefined();
 expect(preview.data.studentCount).toBe(1);
 expect(preview.data.rsvpCount).toBe(1);
 const deletion=await call("ccp_v1_events_delete",{
   eventId:record.eventId,confirmed:true,
 });
 expect(deletion.error).toBeUndefined();
 expect((await page.request.get("/api/events/"+record.eventId)).status()).toBe(404);
});

test("PARITY:PARITY-portal-guardian-rsvp cannot be impersonated by teacher MCP and supports cancellation",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const record=await setup(call,page);
 const other=await call("ccp_v1_guardians_create",{
   name:"Uninvited guardian "+randomUUID(),confirmed:true,
 });
 expect(other.error).toBeUndefined();
 const otherSite=await page.request.get("/api/guardians/"+other.data.id);
 expect(otherSite.status()).toBe(200);
 const foreignToken=(await otherSite.json()).portal_token as string;
 const forbidden=await page.request.post(rsvp(foreignToken,record.eventId),{
   data:{status:"yes"},
 });
 expect(forbidden.status(),await forbidden.text()).toBe(403);
 const forged=await call("ccp_v1_events_update",{
   eventId:record.eventId,status:"yes",confirmed:true,
 });
 expect(forged.error?.code).toBe("VALIDATION_ERROR");
 const approved=await page.request.post(rsvp(record.token,record.eventId),{
   data:{status:"yes",partySize:3,note:"Confirmed attendance"},
 });
 expect(approved.status(),await approved.text()).toBe(200);
 const no=await page.request.post(rsvp(record.token,record.eventId),{
   data:{status:"no",partySize:1,note:"Cannot attend"},
 });
 expect(no.status(),await no.text()).toBe(200);
 const website=await page.request.get("/api/events/"+record.eventId);
 expect(website.status()).toBe(200);
 const site=(await website.json()).event;
 expect(site.rsvps.find((x:{guardianId:string})=>
   x.guardianId===record.guardianId)?.status).toBe("no");
 const masked=await call("ccp_v1_events_detail",{eventId:record.eventId});
 expect(masked.error).toBeUndefined();
 expect(masked.data.event.rsvps).toEqual([]);
 const confirmed=await call("ccp_v1_events_detail",{
   eventId:record.eventId,includeRsvps:true,confirmed:true,
 });
 expect(confirmed.error).toBeUndefined();
 expect(confirmed.data.event.rsvps).toEqual(site.rsvps);
 const invalid=await page.request.post(rsvp("not-a-real-portal-token",record.eventId),{
   data:{status:"yes"},
 });
 expect(invalid.status()).toBe(404);
});
