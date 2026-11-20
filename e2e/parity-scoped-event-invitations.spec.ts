import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
const origin="http://localhost:3000";
const when=(days:number)=>new Date(Date.now()+days*86400000).toISOString();

test("PARITY:PARITY-scoped-event-invitations require an explicit teacher grant and workplace match",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const student=await call("ccp_students_create",{
    name:"Event guest pupil "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  const place=await call("ccp_workplaces_create",{
    name:"Event school "+randomUUID(),timezone:"UTC",currency:"USD",locale:"en",
    policy:{},idempotencyKey:randomUUID(),
  });
  expect(place.error).toBeUndefined();
  const workplaceId=place.data.entityId as string;
  const enrolled=await call("ccp_workplaces_enroll",{
    studentId,workplaceId,idempotencyKey:randomUUID(),
  });
  expect(enrolled.error).toBeUndefined();
  const contact=await call("ccp_contacts_create",{
    displayName:"Event contact "+randomUUID(),idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(contact.error).toBeUndefined();
  const contactId=contact.data.id as string;
  const linked=await call("ccp_student_contacts_link",{
    studentId,contactId,relationshipLabel:"School contact",idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(linked.error).toBeUndefined();
  const grant=await call("ccp_portal_grants_create",{
    studentId,contactId,workplaceId,permissions:["event_rsvp"],
    expiresAt:when(20),idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(grant.error).toBeUndefined();
  const issued=await page.request.post("/api/portal-grants/"+grant.data.id+"/issue",{
    headers:{origin},data:{expectedRevision:1,confirmed:true},
  });
  expect(issued.status(),await issued.text()).toBe(200);
  const secret=new URL((await issued.json()).url).pathname.split("/").pop()!;
  const event=await call("ccp_events_create",{
    title:"Event within school "+randomUUID(),workplaceId,
    startsAt:when(9),studentIds:[studentId],
    repertoireByStudent:{[studentId]:"Knight tactics"},
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(event.error).toBeUndefined();
  const eventId=event.data.event.id as string;
  const noInvite=await page.request.post("/api/portal/"+secret+"/events/"+eventId+"/rsvp",{
    data:{status:"yes",partySize:2,note:"Before invitation"},
  });
  expect(noInvite.status()).toBe(404);
  const invitationInput={portalGrantId:grant.data.id,idempotencyKey:randomUUID(),confirmed:true};
  const created=await page.request.post("/api/events/"+eventId+"/portal-invitations",{
    headers:{origin},data:invitationInput,
  });
  expect(created.status(),await created.text()).toBe(201);
  const invite=await created.json() as {id:string;eventId:string;revision:number;status:string};
  expect(invite).toMatchObject({eventId,revision:1,status:"pending"});
  const repeat=await call("ccp_events_portal_invitations_create",{
    ...invitationInput,eventId,
  });
  expect(repeat.error).toBeUndefined();
  expect(repeat.data.replayed).toBe(true);
  const webList=await page.request.get("/api/events/"+eventId+"/portal-invitations");
  expect(webList.status(),await webList.text()).toBe(200);
  const mcpList=await call("ccp_events_portal_invitations_list",{eventId});
  expect(mcpList.error).toBeUndefined();
  expect(mcpList.data).toEqual(await webList.json());
  expect(JSON.stringify(mcpList)).not.toMatch(/token_digest|rawToken|"url"/i);

  const portal=await page.request.get("/portal/"+secret);
  expect(portal.status(),await portal.text()).toBe(200);
  expect(await portal.text()).toContain("Event within school");
  const rsvp=await page.request.post("/api/portal/"+secret+"/events/"+eventId+"/rsvp",{
    data:{status:"yes",partySize:2,note:"Coming"},
  });
  expect(rsvp.status(),await rsvp.text()).toBe(200);
  expect(await rsvp.json()).toMatchObject({ok:true,replayed:false});
  const replay=await page.request.post("/api/portal/"+secret+"/events/"+eventId+"/rsvp",{
    data:{status:"yes",partySize:2,note:"Coming"},
  });
  expect(replay.status(),await replay.text()).toBe(200);
  expect((await replay.json()).replayed).toBe(true);
  const checked=await call("ccp_events_portal_invitations_list",{eventId});
  expect(checked.error).toBeUndefined();
  const updated=checked.data.find((row:{id:string})=>row.id===invite.id);
  expect(updated).toMatchObject({status:"yes",partySize:2});
  const revoked=await call("ccp_events_portal_invitations_revoke",{
    eventId,inviteId:invite.id,expectedRevision:2,
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(revoked.error).toBeUndefined();
  expect(revoked.data.revokedAt).toBeTruthy();
  const rejected=await page.request.post("/api/portal/"+secret+"/events/"+eventId+"/rsvp",{
    data:{status:"no",partySize:null,note:""},
  });
  expect(rejected.status()).toBe(404);
});
