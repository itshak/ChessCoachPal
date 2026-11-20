import {describe,expect,it} from "vitest";
import {previewEventEmails,type EventEmailRow} from "./event-email";
import {DEFAULT_POLICY} from "@/lib/schedule";

const later=new Date(Date.now()+3*86400000).toISOString();
function fixture():EventEmailRow{return {
  id:"event",title:"Chess club celebration",description:"Welcome",location:"Club room",
  starts_at:later,ends_at:null,
  event_students:[
    {repertoire:"Endgames",sort_order:0,students:{id:"learner-A",name:"Student A"}},
    {repertoire:"Tactics",sort_order:1,students:{id:"learner-B",name:"Student B"}},
  ],
  portal_event_invitations:[{
    id:"invite-A",status:"pending",revoked_at:null,
    portal_access_grants:{id:"grant-A",student_id:"learner-A",contact_id:"contact-A",
      expires_at:new Date(Date.now()+10*86400000).toISOString(),revoked_at:null,
      issued_at:new Date().toISOString(),
      permissions:["event_rsvp"],contacts:{id:"contact-A",display_name:"Contact A",
        email:"contact@example.invalid",preferred_locale:"en",status:"active"}},
  }],
};}
const policy={...DEFAULT_POLICY,business_name:"Coach"};
describe("scoped event email preview",()=>{
 it("emails only explicitly invited contacts and never cross-student repertoire",()=>{
  const result=previewEventEmails({event:fixture(),policy,mode:"invite",includeRecipients:true});
  expect(result.draftCount).toBe(1);
  expect(result.recipientCount).toBe(1);
  expect(result.drafts[0].recipients).toEqual(["contact@example.invalid"]);
  expect(result.drafts[0].text).toContain("Student A");
  expect(result.drafts[0].text).toContain("Endgames");
  expect(result.drafts[0].text).not.toContain("Student B");
  expect(result.drafts[0].text).not.toContain("Tactics");
  expect(result.drafts[0].portalLinkIncluded).toBe(false);
  expect(JSON.stringify(result)).not.toMatch(/portal\/|bearer|token_digest/);
 });
 it.each(["expired","revoked","not-consented","no-email","not-in-roster","inactive-contact"])(
  "skips unauthorized %s invite",reason=>{
   const event=fixture();
   const invitation=event.portal_event_invitations![0];
   const grant=invitation.portal_access_grants;
   if(!grant||Array.isArray(grant))throw new Error("Expected exactly one scoped grant");
   const contact=grant.contacts;
   if(!contact||Array.isArray(contact))throw new Error("Expected exactly one contact");
   if(reason==="expired")grant.expires_at=new Date(Date.now()-86400000).toISOString();
   if(reason==="revoked")grant.revoked_at=new Date().toISOString();
   if(reason==="not-consented")grant.permissions=["calendar"];
   if(reason==="no-email")contact.email=null;
   if(reason==="not-in-roster")grant.student_id="unrelated";
   if(reason==="inactive-contact")contact.status="archived";
   const result=previewEventEmails({event,policy,mode:"invite",includeRecipients:true});
   expect(result.draftCount).toBe(0);expect(result.skippedCount).toBe(1);
  });
 it("does not remind an RSVP no and never returns email by default",()=>{
  const event=fixture();event.portal_event_invitations![0].status="no";
  expect(previewEventEmails({event,policy,mode:"reminder"}).draftCount).toBe(0);
  event.portal_event_invitations![0].status="yes";
  const result=previewEventEmails({event,policy,mode:"reminder"});
  expect(result.draftCount).toBe(1);
  expect(JSON.stringify(result)).not.toContain("contact@example.invalid");
 });
});
