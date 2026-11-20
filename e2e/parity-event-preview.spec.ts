import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {scopedEmailEventFixture} from "./helpers/scoped-event-fixture";

test("PARITY:PARITY-events-email-preview uses exact scoped contact invitation without exposing private links",async({page,request})=>{
 const {call,eventId,contactId,title,recipient,privateUrl}=await scopedEmailEventFixture(page,request);
 const path="/api/events/"+eventId+"/email";
 const website=await page.request.get(path);
 expect(website.status(),await website.text()).toBe(200);
 const preview=await website.json();
 expect(preview.draftCount).toBe(1);
 expect(preview.recipientCount).toBe(1);
 expect(preview.drafts[0].subject).toContain(title);
 expect(preview.drafts[0].text).toContain("Rook endgame");
 expect(preview.drafts[0].text).toContain("secure event link");
 expect(preview.drafts[0].portalLinkIncluded).toBe(false);
 expect(preview.drafts[0].recipients).toBeUndefined();
 const mcp=await call("ccp_events_email_preview",{eventId});
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(preview);
 expect(JSON.stringify(mcp.data)).not.toContain(privateUrl);
 expect((await call("ccp_events_email_preview",{
   eventId,includeRecipients:true,
 })).error?.code).toBe("VALIDATION_ERROR");
 const confirmed=await call("ccp_events_email_preview",{
   eventId,includeRecipients:true,confirmed:true,
 });
 expect(confirmed.error).toBeUndefined();
 expect(confirmed.data.drafts[0].recipients).toEqual([recipient]);
 const webContacts=await page.request.get(path+"?includeRecipients=true");
 expect(webContacts.status(),await webContacts.text()).toBe(200);
 expect(confirmed.data).toEqual(await webContacts.json());
 expect(JSON.stringify(confirmed.data)).not.toContain(privateUrl);

 for(const [locale,fragment] of [["he","יש לאשר השתתפות"],["ru","Подтвердите участие"]] as const){
   const detail=await call("ccp_contacts_detail",{
     contactId,includeDetails:true,confirmed:true,
   });
   expect(detail.error).toBeUndefined();
   const updated=await call("ccp_contacts_update",{
     contactId,preferredLocale:locale,expectedRevision:detail.data.revision,
     idempotencyKey:randomUUID(),confirmed:true,
   });
   expect(updated.error).toBeUndefined();
   const localized=await page.request.get(path);
   expect(localized.status()).toBe(200);
   const newPreview=await localized.json();
   expect(newPreview.drafts[0].locale).toBe(locale);
   expect(newPreview.drafts[0].text).toContain(fragment);
   expect((await call("ccp_events_email_preview",{eventId})).data).toEqual(newPreview);
 }
 const detail=await page.request.get("/api/events/"+eventId);
 expect(detail.status()).toBe(200);
 expect((await detail.json()).event.reminderSentAt).toBeNull();
});
