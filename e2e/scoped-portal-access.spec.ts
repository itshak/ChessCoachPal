import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

const origin="http://localhost:3000";
const future=(days:number)=>new Date(Date.now()+days*86400000).toISOString();

test("PARITY:PARITY-scoped-guest-calendar and cancellation cannot access the same student's other workplace",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const student=await call("ccp_students_create",{
    name:"Two-workplace pupil "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  const school=await call("ccp_workplaces_create",{
    name:"Shared school "+randomUUID(),timezone:"UTC",currency:"USD",
    locale:"en",policy:{},idempotencyKey:randomUUID(),
  });
  const privatePlace=await call("ccp_workplaces_create",{
    name:"Private practice "+randomUUID(),timezone:"UTC",currency:"USD",
    locale:"en",policy:{},idempotencyKey:randomUUID(),
  });
  expect(school.error).toBeUndefined();
  expect(privatePlace.error).toBeUndefined();
  for(const workplaceId of [school.data.entityId,privatePlace.data.entityId]){
    const enrolled=await call("ccp_workplaces_enroll",{
      workplaceId,studentId,idempotencyKey:randomUUID(),
    });
    expect(enrolled.error).toBeUndefined();
  }
  const schoolLesson=await call("ccp_sessions_create",{
    workplaceId:school.data.entityId,studentId,title:"School chess",startsAt:future(8),
    durationMinutes:50,lessonNote:"Shared school",idempotencyKey:randomUUID(),
  });
  const privateLesson=await call("ccp_sessions_create",{
    workplaceId:privatePlace.data.entityId,studentId,title:"Private chess",startsAt:future(9),
    durationMinutes:45,lessonNote:"Private coaching",idempotencyKey:randomUUID(),
  });
  expect(schoolLesson.error).toBeUndefined();
  expect(privateLesson.error).toBeUndefined();
  const contact=await call("ccp_contacts_create",{
    displayName:"School liaison "+randomUUID(),idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(contact.error).toBeUndefined();
  const linked=await call("ccp_student_contacts_link",{
    studentId,contactId:contact.data.id,relationshipLabel:"School liaison",
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(linked.error).toBeUndefined();
  const grant=await call("ccp_portal_grants_create",{
    studentId,contactId:contact.data.id,workplaceId:school.data.entityId,
    expiresAt:future(10),permissions:["calendar","cancel"],
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(grant.error).toBeUndefined();
  const issued=await page.request.post("/api/portal-grants/"+grant.data.id+"/issue",{
    headers:{origin},data:{expectedRevision:1,confirmed:true},
  });
  expect(issued.status(),await issued.text()).toBe(200);
  const secret=new URL((await issued.json()).url).pathname.split("/").pop()!;
  const portal=await page.request.get("/portal/"+encodeURIComponent(secret));
  expect(portal.status(),await portal.text()).toBe(200);
  expect(await portal.text()).toContain("School liaison");
  expect(portal.headers()["cache-control"]).toContain("no-store");
  expect(portal.headers()["referrer-policy"]).toBe("no-referrer");
  const ics=await page.request.get("/api/portal/"+encodeURIComponent(secret)+"/calendar");
  expect(ics.status(),await ics.text()).toBe(200);
  const content=await ics.text();
  expect(content).toContain("BEGIN:VCALENDAR");
  expect(content).not.toContain("Private practice");
  expect(content).not.toContain("Private coaching");
  const wrong="/api/portal/"+encodeURIComponent(secret)+"/sessions/"+
    privateLesson.data.entityId+"/students/"+studentId+"/cancel";
  const forbidden=await page.request.post(wrong,{data:{note:"Unauthorised private lesson"}});
  expect(forbidden.status()).toBe(404);
  const correct="/api/portal/"+encodeURIComponent(secret)+"/sessions/"+
    schoolLesson.data.entityId+"/students/"+studentId+"/cancel";
  const cancelled=await page.request.post(correct,{data:{note:"School notice"}});
  expect(cancelled.status(),await cancelled.text()).toBe(200);
  expect(await cancelled.json()).toMatchObject({ok:true,replayed:false});
  const replay=await page.request.post(correct,{data:{note:"School notice"}});
  expect(replay.status()).toBe(200);
  expect((await replay.json()).replayed).toBe(true);
  const revoked=await call("ccp_portal_grants_revoke",{
    grantId:grant.data.id,expectedRevision:2,idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(revoked.error).toBeUndefined();
  const after=await page.request.post(correct,{data:{note:"Revoked"}});
  expect(after.status()).toBe(404);
  const old=await page.request.get("/portal/"+"f".repeat(48));
  // Next.js may stream an async notFound response with HTTP 200. Verify
  // access denial by content, not only the streaming response status.
  const blockedBody=await old.text();
  expect(blockedBody).not.toContain("School chess");
  expect(blockedBody).not.toContain("Private chess");
  expect(blockedBody).not.toContain("School liaison");
});
