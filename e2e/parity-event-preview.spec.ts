import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-events-email-preview uses same web/MCP template without leaking tokens or sending",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_students_create",{
   name:"Invitation learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const email="event-preview-"+randomUUID()+"@example.com";
 const family=await call("ccp_guardians_create",{
   name:"Preview guardian "+randomUUID(),email,studentIds:[studentId],confirmed:true,
 });
 expect(family.error).toBeUndefined();
 const id=family.data.id as string;
 const browserFamily=await page.request.get("/api/guardians/"+id);
 expect(browserFamily.status()).toBe(200);
 const token=(await browserFamily.json()).portal_token as string;
 expect(token).toBeTruthy();
 const title="Rapid chess festival "+randomUUID();
 const event=await call("ccp_events_create",{
   title,startsAt:"2043-03-20T09:00:00+02:00",
   endsAt:"2043-03-20T11:00:00+02:00",studentIds:[studentId],
   location:"Chess auditorium",description:"Five rapid rounds",
   repertoireByStudent:{[studentId]:"Rook ending"},confirmed:true,
 });
 expect(event.error).toBeUndefined();
 const eventId=event.data.event.id as string;
 const path="/api/events/"+eventId+"/email";
 const website=await page.request.get(path);
 expect(website.status(),await website.text()).toBe(200);
 const preview=await website.json();
 expect(preview.draftCount).toBe(1);
 expect(preview.recipientCount).toBe(1);
 expect(preview.drafts[0].subject).toContain(title);
 expect(preview.drafts[0].text).toContain("Rook ending");
 expect(preview.drafts[0].text).toContain("Please RSVP");
 expect(preview.drafts[0].portalLinkIncluded).toBe(true);
 expect(preview.drafts[0].recipients).toBeUndefined();
 const fromMcp=await call("ccp_events_email_preview",{eventId});
 expect(fromMcp.error).toBeUndefined();
 expect(fromMcp.data).toEqual(preview);
 expect(JSON.stringify(fromMcp.data)).not.toContain(token);
 const refused=await call("ccp_events_email_preview",{
   eventId,includeRecipients:true,
 });
 expect(refused.error?.code).toBe("VALIDATION_ERROR");
 const confirmed=await call("ccp_events_email_preview",{
   eventId,includeRecipients:true,confirmed:true,
 });
 expect(confirmed.error).toBeUndefined();
 expect(confirmed.data.drafts[0].recipients).toEqual([email]);
 const webContacts=await page.request.get(path+"?includeRecipients=true");
 expect(webContacts.status(),await webContacts.text()).toBe(200);
 expect(confirmed.data).toEqual(await webContacts.json());
 expect(JSON.stringify(confirmed.data)).not.toContain(token);
 // Family-facing invitations must use the family preference on BOTH surfaces,
 // not the sender's teacher UI locale. The recipient roster is unchanged.
 const familyHebrew=await page.request.put("/api/guardians/"+id,{
   data:{preferredLocale:"he"},
 });
 expect(familyHebrew.status(),await familyHebrew.text()).toBe(200);
 const hebrewSite=await page.request.get(path);
 expect(hebrewSite.status()).toBe(200);
 const hebrewPreview=await hebrewSite.json();
 expect(hebrewPreview.drafts[0].locale).toBe("he");
 expect(hebrewPreview.drafts[0].text).toContain("נא לאשר השתתפות");
 expect((await call("ccp_events_email_preview",{eventId})).data).toEqual(hebrewPreview);
 expect(JSON.stringify(hebrewPreview)).not.toContain(token);

 const familyRussian=await call("ccp_guardians_update",{
   guardianId:id,preferredLocale:"ru",confirmed:true,
 });
 expect(familyRussian.error).toBeUndefined();
 const russianSite=await page.request.get(path);
 expect(russianSite.status()).toBe(200);
 const russianPreview=await russianSite.json();
 expect(russianPreview.drafts[0].locale).toBe("ru");
 expect(russianPreview.drafts[0].text).toContain("Пожалуйста, подтвердите участие");
 expect((await call("ccp_events_email_preview",{eventId})).data).toEqual(russianPreview);
 expect(JSON.stringify(russianPreview)).not.toContain(token);
 const detail=await page.request.get("/api/events/"+eventId);
 expect(detail.status()).toBe(200);
 expect((await detail.json()).event.reminderSentAt).toBeNull();
});
