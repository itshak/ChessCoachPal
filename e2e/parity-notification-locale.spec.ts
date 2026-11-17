import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: teacher notification language is chosen by profile, with original family notes preserved in website and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const profile=await call("ccp_teacher_profile_get",{});
 expect(profile.error).toBeUndefined();
 const originalLocale=profile.data.preferredLocale as "en"|"he"|"ru";
 const student=await call("ccp_students_create",{
   name:"Localized notifications "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const familyName="כהן Петров "+randomUUID();
 const family=await call("ccp_guardians_create",{
   name:familyName,studentIds:[studentId],confirmed:true,
 });
 expect(family.error).toBeUndefined();
 const guardianId=family.data.id as string;
 const detail=await page.request.get("/api/guardians/"+guardianId);
 expect(detail.status()).toBe(200);
 const portalToken=(await detail.json()).portal_token as string;
 const event=await call("ccp_events_create",{
   title:"Multilingual chess "+randomUUID(),startsAt:"2042-12-05T18:00:00+02:00",
   endsAt:"2042-12-05T19:00:00+02:00",studentIds:[studentId],confirmed:true,
 });
 expect(event.error).toBeUndefined();
 const eventId=event.data.event.id as string;
 const updateLocale=async(locale:"he"|"ru")=>{
   const reply=await call("ccp_teacher_profile_update",{preferredLocale:locale,confirmed:true});
   expect(reply.error).toBeUndefined();
 };
 const rsvpUrl=`/api/portal/${encodeURIComponent(portalToken)}/events/${eventId}/rsvp`;
 const notifications=async()=>{
   const response=await page.request.get("/api/notifications");
   expect(response.status(),await response.text()).toBe(200);
   const website=await response.json();
   const mcp=await call("ccp_notifications_list",{});
   expect(mcp.error).toBeUndefined();
   // Ignore response wrapping if the MCP includes extra metadata, but require
   // exact canonical notification title/body in both surfaces.
   const match=(rows:Array<{href?:string|null;type?:string;title:string;body:string}>)=>
     rows.filter(row=>row.type==="event_rsvp"&&row.href===`/events/${eventId}`);
   const siteRows=match(website.notifications);
   const modelRows=match(mcp.data.notifications);
   expect(modelRows.map(({title,body})=>({title,body})))
     .toEqual(siteRows.map(({title,body})=>({title,body})));
   return siteRows;
 };
 try{
   await updateLocale("he");
   const rawNote="Мой ребёнок יגיע 12:30";
   const first=await page.request.post(rsvpUrl,{data:{status:"maybe",partySize:3,note:rawNote}});
   expect(first.status(),await first.text()).toBe(200);
   const afterHe=await notifications();
   expect(afterHe).toHaveLength(1);
   expect(afterHe[0].title).toContain("אולי");
   expect(afterHe[0].title).toContain(familyName);
   expect(afterHe[0].body).toContain("מספר משתתפים: 3");
   expect(afterHe[0].body).toContain(rawNote);
   await updateLocale("ru");
   const second=await page.request.post(rsvpUrl,{data:{status:"yes",partySize:2,note:"שלום мир"}});
   expect(second.status(),await second.text()).toBe(200);
   const afterRu=await notifications();
   expect(afterRu).toHaveLength(2);
   const latest=afterRu.find(row=>row.title.includes("Да"));
   expect(latest?.title).toContain(familyName);
   expect(latest?.body).toContain("Количество участников: 2");
   expect(latest?.body).toContain("שלום мир");
   // Existing bell entries remain historical events, never rewritten when
   // preferences change. The saved event record contains raw RSVP statuses.
   expect(afterRu.some(row=>row.title.includes("אולי"))).toBe(true);
   const eventRead=await call("ccp_events_detail",{eventId,includeRsvps:true,confirmed:true});
   expect(eventRead.error).toBeUndefined();
   expect(eventRead.data.event.rsvps.find((row:{guardianId:string})=>row.guardianId===guardianId)?.status).toBe("yes");
 }finally{
   const restored=await call("ccp_teacher_profile_update",{
     preferredLocale:originalLocale,confirmed:true,
   });
   expect(restored.error).toBeUndefined();
 }
});
