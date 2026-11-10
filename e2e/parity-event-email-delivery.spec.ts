import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {mailpitMessagesTo} from "./helpers/mailpit";

test("PARITY:PARITY-events-invitation-delivery previews and sends one local SMTP email despite MCP/browser retries",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_v1_students_create",{
   name:"Invitation pupil "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const recipient="event-once-"+randomUUID()+"@example.com";
 const family=await call("ccp_v1_guardians_create",{
   name:"Invitation family "+randomUUID(),email:recipient,
   studentIds:[studentId],confirmed:true,
 });
 expect(family.error).toBeUndefined();
 const title="Chess field trip "+randomUUID();
 const event=await call("ccp_v1_events_create",{
   title,startsAt:"2042-12-10T09:00:00+02:00",
   endsAt:"2042-12-10T12:00:00+02:00",
   studentIds:[studentId],location:"Main chess hall",
   repertoireByStudent:{[studentId]:"Rook endgame"},
   confirmed:true,
 });
 expect(event.error).toBeUndefined();
 const eventId=event.data.event.id as string;
 const endpoint="/api/events/"+eventId+"/email";
 const before=await page.request.get(endpoint);
 expect(before.status(),await before.text()).toBe(200);
 const preview=await before.json();
 expect(preview.draftCount).toBe(1);
 expect(preview.recipientCount).toBe(1);
 expect(preview.drafts[0].subject).toContain(title);
 expect(preview.drafts[0].recipients).toBeUndefined();
 const mcpPreview=await call("ccp_v1_events_email_preview",{eventId});
 expect(mcpPreview.error).toBeUndefined();
 expect(mcpPreview.data).toEqual(preview);
 const unconfirmed=await call("ccp_v1_events_email_invites",{
   eventId,confirmed:true,
 });
 expect(unconfirmed.error?.code).toBe("VALIDATION_ERROR");
 expect((await mailpitMessagesTo(request,recipient)).length).toBe(0);
 // Exercise simultaneous cross-client send attempts: the PostgreSQL
 // receipt must select exactly one sender before either SMTP request.
 const [first,viaSite]=await Promise.all([
   call("ccp_v1_events_email_invites",{
     eventId,confirmed:true,confirmedEmail:true,
   }),
   page.request.post(endpoint),
 ]);
 expect(first.error).toBeUndefined();
 expect(viaSite.status(),await viaSite.text()).toBe(200);
 const websiteResult=await viaSite.json();
 expect([first.data.sent,websiteResult.sent].sort()).toEqual([0,1]);
 expect([first.data.skipped,websiteResult.skipped].sort()).toEqual([0,1]);
 await expect.poll(async()=>(await mailpitMessagesTo(request,recipient)).length,{
   timeout:10000,
 }).toBe(1);
 const message=(await mailpitMessagesTo(request,recipient))[0];
 expect(message.Subject).toContain(title);
 const siteReplay=await page.request.post(endpoint);
 expect(siteReplay.status(),await siteReplay.text()).toBe(200);
 expect(await siteReplay.json()).toMatchObject({sent:0,skipped:1});
 const replay=await call("ccp_v1_events_email_invites",{
   eventId,confirmed:true,confirmedEmail:true,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data).toMatchObject({sent:0,skipped:1});
 expect((await mailpitMessagesTo(request,recipient)).length).toBe(1);
 const eventDetail=await page.request.get("/api/events/"+eventId);
 expect(eventDetail.status(),await eventDetail.text()).toBe(200);
 expect((await eventDetail.json()).event.id).toBe(eventId);
});

test("PARITY:PARITY-events-email-tenant-isolation denies foreign invitation preview and delivery",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const email="foreign-invite-"+randomUUID()+"@example.com";
 const user=await admin.auth.admin.createUser({
  email,password:"SyntheticForeignCoach-123!",email_confirm:true,
 });
 expect(user.error).toBeNull();
 const teacherId=user.data.user!.id;
 const recipient="foreign-event-recipient-"+randomUUID()+"@example.com";
 try{
  expect((await admin.from("teachers").insert({
   id:teacherId,email,display_name:"Private event teacher",
  })).error).toBeNull();
  const family=await admin.from("guardians").insert({
   teacher_id:teacherId,name:"Foreign invite family",
   email:recipient,portal_token:randomUUID(),
  }).select("id").single();
  expect(family.error).toBeNull();
  const student=await admin.from("students").insert({
   teacher_id:teacherId,name:"Private chess pupil",guardian_id:family.data!.id,
  }).select("id").single();
  expect(student.error).toBeNull();
  const event=await admin.from("events").insert({
   teacher_id:teacherId,title:"Private tournament",
   starts_at:"2042-12-01T09:00:00+02:00",
  }).select("id").single();
  expect(event.error).toBeNull();
  const eventId=event.data!.id as string;
  expect((await admin.from("event_students").insert({
   event_id:eventId,student_id:student.data!.id,repertoire:"Bishop endgames",
  })).error).toBeNull();
  const api="/api/events/"+eventId+"/email";
  expect((await page.request.get(api)).status()).toBe(404);
  expect((await call("ccp_v1_events_email_preview",{eventId})).error?.code)
   .toBe("NOT_FOUND");
  expect((await page.request.post(api)).status()).toBe(404);
  expect((await call("ccp_v1_events_email_invites",{
   eventId,confirmed:true,confirmedEmail:true,
  })).error?.code).toBe("NOT_FOUND");
  expect((await mailpitMessagesTo(request,recipient)).length).toBe(0);
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
