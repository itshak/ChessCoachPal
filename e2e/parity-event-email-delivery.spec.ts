import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
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
 const first=await call("ccp_v1_events_email_invites",{
   eventId,confirmed:true,confirmedEmail:true,
 });
 expect(first.error).toBeUndefined();
 expect(first.data).toMatchObject({sent:1,skipped:0});
 await expect.poll(async()=>(await mailpitMessagesTo(request,recipient)).length,{
   timeout:10000,
 }).toBe(1);
 const message=(await mailpitMessagesTo(request,recipient))[0];
 expect(message.Subject).toContain(title);
 const viaSite=await page.request.post(endpoint);
 expect(viaSite.status(),await viaSite.text()).toBe(200);
 expect(await viaSite.json()).toMatchObject({sent:0,skipped:1});
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
