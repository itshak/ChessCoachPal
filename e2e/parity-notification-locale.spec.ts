import {expect,test} from "@playwright/test";
import {scopedEmailEventFixture} from "./helpers/scoped-event-fixture";

test("PARITY: teacher notification language is chosen by profile, with original scoped-contact notes preserved in website and MCP",async({page,request})=>{
 const {call,eventId,privateUrl,contactId}=await scopedEmailEventFixture(page,request);
 const contact=await call("ccp_contacts_detail",{
  contactId,includeDetails:true,confirmed:true,
 });
 expect(contact.error).toBeUndefined();
 const displayName=contact.data.displayName as string;
 const profile=await call("ccp_teacher_profile_get",{});
 expect(profile.error).toBeUndefined();
 const originalLocale=profile.data.preferredLocale as "en"|"he"|"ru";
 const updateLocale=async(locale:"he"|"ru")=>{
  const res=await call("ccp_teacher_profile_update",{
   preferredLocale:locale,confirmed:true,
  });
  expect(res.error).toBeUndefined();
 };
 const rsvpUrl=privateUrl+"/events/"+eventId+"/rsvp";
 // The privateUrl is a browser capability, never returned to MCP.
 const guestUrl=new URL(rsvpUrl);
 const portalRsvp="/api"+guestUrl.pathname.replace(/^\/portal\//,"/portal/");
 const notifications=async()=>{
  const response=await page.request.get("/api/notifications");
  expect(response.status(),await response.text()).toBe(200);
  const website=await response.json();
  const mcp=await call("ccp_notifications_list",{});
  expect(mcp.error).toBeUndefined();
  const match=(rows:Array<{href?:string|null;type?:string;title:string;body:string}>)=>
   rows.filter(row=>row.type==="event_rsvp"&&row.href==="/events/"+eventId);
  const siteRows=match(website.notifications);
  const modelRows=match(mcp.data.notifications);
  expect(modelRows.map(({title,body})=>({title,body})))
   .toEqual(siteRows.map(({title,body})=>({title,body})));
  return siteRows;
 };
 try{
  await updateLocale("he");
  const note="Мой ребёнок יגיע 12:30";
  const first=await page.request.post(portalRsvp,{
   data:{status:"maybe",partySize:3,note},
  });
  expect(first.status(),await first.text()).toBe(200);
  const afterHe=await notifications();
  expect(afterHe).toHaveLength(1);
  expect(afterHe[0].title).toContain("אולי");
  expect(afterHe[0].title).toContain(displayName);
  expect(afterHe[0].body).toContain(note);
  await updateLocale("ru");
  const second=await page.request.post(portalRsvp,{
   data:{status:"yes",partySize:2,note:"שלום мир"},
  });
  expect(second.status(),await second.text()).toBe(200);
  const afterRu=await notifications();
  expect(afterRu).toHaveLength(2);
  expect(afterRu.some(row=>row.title.includes("Да"))).toBe(true);
  const latest=afterRu.find(row=>row.title.includes("Да"));
  expect(latest?.title).toContain(displayName);
  expect(latest?.body).toContain("שלום мир");
  expect(afterRu.some(row=>row.title.includes("אולי"))).toBe(true);
  const check=await call("ccp_events_detail",{
   eventId,includeRsvps:true,confirmed:true,
  });
  expect(check.error).toBeUndefined();
  expect(check.data.event.rsvps.some((x:{status:string})=>x.status==="yes")).toBe(true);
 }finally{
  const restored=await call("ccp_teacher_profile_update",{
   preferredLocale:originalLocale,confirmed:true,
  });
  expect(restored.error).toBeUndefined();
 }
});
