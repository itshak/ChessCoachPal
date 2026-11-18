import {randomUUID} from "node:crypto";
import {expect,type APIRequestContext,type Page} from "@playwright/test";
import {delegatedTool} from "./delegated-mcp";
const origin="http://localhost:3000";

/** Synthetic, teacher-owned test data. No Family/guardian schema or tokens. */
export async function scopedEmailEventFixture(page:Page,request:APIRequestContext,
  options:{locale?:"en"|"he"|"ru";recipient?:string}={}){
  const call=await delegatedTool(page,request);
  const student=await call("ccp_students_create",{
    name:"Event pupil "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  const workplace=await call("ccp_workplaces_create",{
    name:"Event venue "+randomUUID(),timezone:"UTC",currency:"USD",locale:"en",
    policy:{},idempotencyKey:randomUUID(),
  });
  expect(workplace.error).toBeUndefined();
  const workplaceId=workplace.data.entityId as string;
  expect((await call("ccp_workplaces_enroll",{
    workplaceId,studentId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
  const recipient=options.recipient??"event-once-"+randomUUID()+"@example.com";
  const contact=await call("ccp_contacts_create",{
    displayName:"Event contact "+randomUUID(),email:recipient,
    preferredLocale:options.locale??"en",idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(contact.error).toBeUndefined();
  const contactId=contact.data.id as string;
  expect((await call("ccp_student_contacts_link",{
    studentId,contactId,relationshipLabel:"Authorized guardian",
    isLegalGuardian:true,mayReceiveMessages:true,
    idempotencyKey:randomUUID(),confirmed:true,
  })).error).toBeUndefined();
  const grant=await call("ccp_portal_grants_create",{
    contactId,studentId,workplaceId,permissions:["event_rsvp"],
    expiresAt:new Date(Date.now()+30*86400000).toISOString(),
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(grant.error).toBeUndefined();
  const grantId=grant.data.id as string;
  const issued=await page.request.post("/api/portal-grants/"+grantId+"/issue",{
    headers:{origin},data:{expectedRevision:1,confirmed:true},
  });
  expect(issued.status(),await issued.text()).toBe(200);
  const privateUrl=(await issued.json()).url as string;
  const title="Chess field trip "+randomUUID();
  const event=await call("ccp_events_create",{
    title,workplaceId,startsAt:new Date(Date.now()+8*86400000).toISOString(),
    studentIds:[studentId],location:"Main chess hall",
    repertoireByStudent:{[studentId]:"Rook endgame"},
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(event.error).toBeUndefined();
  const eventId=event.data.event.id as string;
  const invitation=await call("ccp_events_portal_invitations_create",{
    eventId,portalGrantId:grantId,idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(invitation.error).toBeUndefined();
  return {call,eventId,studentId,workplaceId,contactId,grantId,
    invitationId:invitation.data.id as string,recipient,privateUrl,title};
}
