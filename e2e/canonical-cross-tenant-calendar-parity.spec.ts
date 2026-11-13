import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-canonical-calendar-all-operations-foreign-coach denies calendar, private, recurrence, attendance and notes across both clients",async({page,request,browser})=>{
 const tool=await delegatedTool(page,request);
 const learner=await tool("ccp_v1_students_create",{
  name:"Protected tenant lesson "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(learner.error).toBeUndefined();
 const studentId=learner.data.entityId as string;
 const workplace=await tool("ccp_v1_workplaces_create",{
  name:"Private calendar tenancy "+randomUUID(),timezone:"UTC",
  currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 expect((await tool("ccp_v1_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const lesson=await tool("ccp_v1_sessions_create",{
  workplaceId,studentId,title:"Owner-only private meeting",
  startsAt:"2094-04-20T13:00:00Z",durationMinutes:60,
  lessonNote:"Private teacher agenda",idempotencyKey:randomUUID(),
 });
 expect(lesson.error).toBeUndefined();
 const sessionId=lesson.data.entityId as string;
 const note=await page.request.put("/api/coaching/sessions/"+sessionId+"/notes",{
  data:{studentId,body:"Family-safe teaching memory",
   privateBody:"Never cross tenant",sharedWithGuardian:false,
   sendEmail:false,expectedUpdatedAt:null,idempotencyKey:randomUUID()},
 });
 expect(note.status(),await note.text()).toBe(200);
 const date=new Date(Date.UTC(2094,0,1)+
  (Number.parseInt(randomUUID().slice(0,8),16)%250)*86400000)
  .toISOString().slice(0,10);
 const slotId=randomUUID();
 const slot=await page.request.post("/api/coaching/calendar/slots",{
  data:{studentId,workplaceId,dayOfWeek:new Date(date+"T00:00:00Z").getUTCDay(),
   startTime:"09:00",durationMinutes:45,startDate:date,endDate:date,
   rateCents:4000,isHomeVisit:false,idempotencyKey:slotId},
 });
 expect(slot.status(),await slot.text()).toBe(200);
 const ownerSlots=await page.request.get("/api/coaching/calendar/slots?studentId="+studentId);
 expect(ownerSlots.status()).toBe(200);
 const record=(await ownerSlots.json()).find((x:{id:string})=>x.id===slotId);
 expect(record?.updated_at).toBeTruthy();
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!, service=process.env.SUPABASE_SERVICE_ROLE_KEY!;
 const admin=createClient(url,service,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="canonical-foreign-"+randomUUID()+"@example.com";
 const password="SyntheticOtherCoach-123!";
 const account=await admin.auth.admin.createUser({
  email,password,email_confirm:true,
 });
 expect(account.error).toBeNull();
 const teacherId=account.data.user!.id;
 const contextB=await browser.newContext({baseURL:"http://localhost:3000"});
 try{
  expect((await admin.from("teachers").insert({
   id:teacherId,email,display_name:"Other calendar coach",
  })).error).toBeNull();
  const otherPage=await contextB.newPage();
  const otherTool=await delegatedTool(otherPage,request,
   "coach:read coach:write",{email,password});
  const webSlots=await otherPage.request.get(
   "/api/coaching/calendar/slots?studentId="+studentId);
  expect(webSlots.status(),await webSlots.text()).toBe(200);
  expect(await webSlots.json()).toEqual([]);
  const modelSlots=await otherTool("ccp_v1_recurring_slots_list",{studentId});
  expect(modelSlots.error).toBeUndefined();
  expect(modelSlots.data).toEqual([]);
  expect((await otherPage.request.get(
   "/api/coaching/sessions/"+sessionId+"/attendance")).status()).toBe(404);
  expect((await otherPage.request.get(
   "/api/coaching/sessions/"+sessionId+"/notes")).status()).toBe(404);
  expect((await otherTool("ccp_v1_session_attendance_list",{
   sessionId,
  })).error?.code).toBe("NOT_FOUND");
  expect((await otherTool("ccp_v1_session_notes_list",{
   sessionId,includePrivate:false,
  })).error?.code).toBe("NOT_FOUND");
  expect((await otherTool("ccp_v1_sessions_details",{
   sessionId,
  })).error?.code).toBe("NOT_FOUND");
  const foreignSlot=await otherTool("ccp_v1_recurring_slots_update",{
   slotId,changes:{startTime:"10:00"},
   expectedUpdatedAt:record.updated_at,idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(foreignSlot.error?.code).toBe("NOT_FOUND");
  const siteSlot=await otherPage.request.patch(
   "/api/coaching/calendar/slots/"+slotId,{data:{
    changes:{startTime:"10:00"},
    expectedUpdatedAt:record.updated_at,idempotencyKey:randomUUID(),
   }});
  expect(siteSlot.status()).toBe(404);
  const input={studentId,workplaceId,date:"2094-07-20",time:"11:00",
   durationMinutes:45,isHomeVisit:false,idempotencyKey:randomUUID()};
  expect((await otherTool("ccp_v1_private_sessions_create",{
   ...input,confirmed:true,
  })).error?.code).toBe("NOT_FOUND");
  const deniedPrivate=await otherPage.request.post(
   "/api/coaching/calendar/private-sessions",{data:input});
  expect(deniedPrivate.status(),await deniedPrivate.text()).toBe(404);
  const deniedAttendance=await otherTool("ccp_v1_session_attendance_set",{
   sessionId,studentId,status:"present",note:"",noticeAt:null,cancelReason:"",
   expectedUpdatedAt:null,idempotencyKey:randomUUID(),
   notifyFamily:false,confirmed:true,
  });
  expect(deniedAttendance.error?.code).toBe("NOT_FOUND");
  const deniedWeb=await otherPage.request.put(
   "/api/coaching/sessions/"+sessionId+"/attendance",{data:{
    studentId,status:"present",note:"",noticeAt:null,cancelReason:"",
    expectedUpdatedAt:null,idempotencyKey:randomUUID(),notifyFamily:false,
   }});
  expect(deniedWeb.status()).toBe(404);
  // Owner's browser still reads exactly the unchanged source of truth.
  const owner=await page.request.get("/api/coaching/calendar/slots?studentId="+studentId);
  expect(owner.status()).toBe(200);
  expect((await owner.json()).find((x:{id:string})=>x.id===slotId).start_time)
   .toBe("09:00:00");
  const notes=await tool("ccp_v1_session_notes_list",{
   sessionId,includePrivate:true,confirmed:true,
  });
  expect(notes.error).toBeUndefined();
  expect(notes.data[0].private_body).toBe("Never cross tenant");
 }finally{
  await contextB.close();
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
