import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {mailpitMessagesTo} from "./helpers/mailpit";
import {scopedEmailEventFixture} from "./helpers/scoped-event-fixture";

test("PARITY:PARITY-events-invitation-delivery requires explicit scoped consent and avoids double sending",async({page,request})=>{
 const {call,eventId,title,recipient}=await scopedEmailEventFixture(page,request);
 const endpoint="/api/events/"+eventId+"/email";
 const before=await page.request.get(endpoint);
 expect(before.status(),await before.text()).toBe(200);
 const preview=await before.json();
 expect(preview.draftCount).toBe(1);
 expect(preview.recipientCount).toBe(1);
 expect(preview.drafts[0].subject).toContain(title);
 expect(preview.drafts[0].recipients).toBeUndefined();
 const mcpPreview=await call("ccp_events_email_preview",{eventId});
 expect(mcpPreview.error).toBeUndefined();
 expect(mcpPreview.data).toEqual(preview);
 expect((await call("ccp_events_email_invites",{
   eventId,confirmed:true,
 })).error?.code).toBe("VALIDATION_ERROR");
 expect((await mailpitMessagesTo(request,recipient)).length).toBe(0);
 const [first,viaSite]=await Promise.all([
   call("ccp_events_email_invites",{
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
 expect((await mailpitMessagesTo(request,recipient))[0].Subject).toContain(title);
 const replay=await page.request.post(endpoint);
 expect(replay.status(),await replay.text()).toBe(200);
 expect(await replay.json()).toMatchObject({sent:0,skipped:1});
 const mcpReplay=await call("ccp_events_email_invites",{
   eventId,confirmed:true,confirmedEmail:true,
 });
 expect(mcpReplay.error).toBeUndefined();
 expect(mcpReplay.data).toMatchObject({sent:0,skipped:1});
 expect((await mailpitMessagesTo(request,recipient)).length).toBe(1);
});

test("PARITY:PARITY-events-email-tenant-isolation denies foreign event preview and sending",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const email="foreign-invite-"+randomUUID()+"@example.com";
 const user=await admin.auth.admin.createUser({
  email,password:"SyntheticForeignCoach-123!",email_confirm:true,
 });
 expect(user.error).toBeNull();
 const teacherId=user.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id:teacherId,email,display_name:"Foreign event teacher",
  })).error).toBeNull();
  const {data:event,error}=await admin.from("events").insert({
   teacher_id:teacherId,title:"Private tournament",
   starts_at:new Date(Date.now()+8*86400000).toISOString(),
  }).select("id").single();
  expect(error).toBeNull();
  const eventId=event!.id as string;
  const endpoint="/api/events/"+eventId+"/email";
  expect((await page.request.get(endpoint)).status()).toBe(404);
  expect((await call("ccp_events_email_preview",{eventId})).error?.code).toBe("NOT_FOUND");
  expect((await page.request.post(endpoint)).status()).toBe(404);
  expect((await call("ccp_events_email_invites",{
    eventId,confirmed:true,confirmedEmail:true,
  })).error?.code).toBe("NOT_FOUND");
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
