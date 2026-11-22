import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";

const origin=new URL(process.env.PLAYWRIGHT_BASE_URL??"http://localhost:3000").origin;
const future=(days:number)=>new Date(Date.now()+days*86400000).toISOString();

test("PARITY:PARITY-scoped-guest-calendar and cancellation cannot access the same student's other workplace",async({page,request,isolatedTeacher})=>{
  const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
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
  expect(schoolLesson.error,"independent school lesson").toBeUndefined();
  const privateLessonTitle="Private coaching "+randomUUID();
  const privateLesson=await call("ccp_sessions_create",{
    workplaceId:privatePlace.data.entityId,studentId,title:privateLessonTitle,startsAt:future(9),
    durationMinutes:45,lessonNote:"Private coaching",idempotencyKey:randomUUID(),
  });
  expect(privateLesson.error,"independent private lesson").toBeUndefined();
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
  expect(content).not.toContain(privateLessonTitle);
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
  // The 404 RSC stream contains generic translated text "Private chess
  // lesson"; only the unique private lesson title would prove a data leak.
  expect(blockedBody).not.toContain(privateLessonTitle);
  expect(blockedBody).not.toContain("School liaison");
});

test("TCH-04 scoped guest renders the approved note but never serializes private or unshared text",async({page,request,playwright,baseURL})=>{
  const call=await delegatedTool(page,request);
  const workplace=await call("ccp_workplaces_create",{
    name:"Scoped note workplace "+randomUUID(),timezone:"UTC",currency:"USD",
    locale:"en",policy:{},idempotencyKey:randomUUID(),
  });
  expect(workplace.error).toBeUndefined();
  const workplaceId=workplace.data.entityId as string;
  const student=await call("ccp_students_create",{
    name:"Scoped note pupil "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  expect((await call("ccp_workplaces_enroll",{
    workplaceId,studentId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
  const approved="Approved study guidance "+randomUUID();
  const approvedPrivate="Private annotation for shared note "+randomUUID();
  const unshared="Draft not approved "+randomUUID();
  const unsharedPrivate="Private annotation for draft "+randomUUID();
  const fixtures=[
    {body:approved,privateBody:approvedPrivate,sharedWithContacts:true},
    {body:unshared,privateBody:unsharedPrivate,sharedWithContacts:false},
  ];
  const notes=new Map<string,typeof fixtures[number]>();
  for(const [i,note] of fixtures.entries()){
    const session=await call("ccp_sessions_create",{
      workplaceId,studentId,title:"Synthetic guest note lesson "+i,
      startsAt:future(12+i),durationMinutes:45,lessonNote:"",
      idempotencyKey:randomUUID(),
    });
    expect(session.error).toBeUndefined();
    const sessionId=session.data.entityId as string;
    const saved=await call("ccp_session_notes_save",{
      ...note,sessionId,studentId,sendEmail:false,confirmed:true,
      expectedUpdatedAt:null,idempotencyKey:randomUUID(),
    });
    expect(saved.error).toBeUndefined();
    notes.set(sessionId,note);
  }
  // Independently prove the teacher's private fields were stored; absent
  // fixtures must not make the guest redaction assertions pass.
  const teacherBackup=await page.request.get("/api/settings/export");
  expect(teacherBackup.status()).toBe(200);
  const {tables}=await teacherBackup.json() as {tables:{session_notes:Array<Record<string,unknown>>}};
  for(const [sessionId,note] of notes){
    expect(tables.session_notes.filter(row=>row.session_id===sessionId)).toMatchObject([{
      student_id:studentId,body:note.body,private_body:note.privateBody,
      shared_with_contacts:note.sharedWithContacts,
    }]);
  }
  const contact=await call("ccp_contacts_create",{
    displayName:"Scoped note contact "+randomUUID(),idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(contact.error).toBeUndefined();
  expect((await call("ccp_student_contacts_link",{
    studentId,contactId:contact.data.id,relationshipLabel:"Coach liaison",
    idempotencyKey:randomUUID(),confirmed:true,
  })).error).toBeUndefined();
  const created=await call("ccp_portal_grants_create",{
    studentId,contactId:contact.data.id,workplaceId,
    expiresAt:future(30),permissions:["calendar","shared_notes"],
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(created.error).toBeUndefined();
  const grantId=created.data.id as string;
  const issued=await page.request.post("/api/portal-grants/"+grantId+"/issue",{
    headers:{origin:new URL(baseURL??"http://localhost:3000").origin},
    data:{expectedRevision:1,confirmed:true},
  });
  expect(issued.status()).toBe(200);
  const guestPath=new URL((await issued.json()).url).pathname;
  const guest=await playwright.request.newContext({baseURL});
  try{
    const shared=await guest.get(guestPath);
    expect(shared.status()).toBe(200);
    const html=await shared.text();
    expect(html).toContain(approved);
    expect(html).not.toContain(approvedPrivate);
    expect(html).not.toContain(unshared);
    expect(html).not.toContain(unsharedPrivate);
    expect(shared.headers()["cache-control"]).toContain("no-store");
    const revoked=await call("ccp_portal_grants_revoke",{
      grantId,expectedRevision:2,idempotencyKey:randomUUID(),confirmed:true,
    });
    expect(revoked.error).toBeUndefined();
    // Streaming notFound may have a 200 status. Verify content denial.
    expect(await (await guest.get(guestPath)).text()).not.toContain(approved);
  }finally{
    await guest.dispose();
  }
});
