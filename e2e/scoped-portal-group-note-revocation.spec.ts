import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";

test("group portal renders only the authorized learner note and denies new requests after revocation",
  async ({page,request,playwright,baseURL,isolatedTeacher})=>{
    const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
    const run=async(name:string,args:Record<string,unknown>)=>{
      const result=await call(name,{...args,idempotencyKey:randomUUID()});
      expect(result.error,name).toBeUndefined();
      return result.data;
    };
    const future=(days:number)=>new Date(Date.now()+days*86400000).toISOString();
    const {entityId:workplaceId}=await run("ccp_workplaces_create",{
      name:"Synthetic group classroom",timezone:"UTC",currency:"USD",
    });
    const selectedName="Selected learner "+randomUUID();
    const otherName="Other learner "+randomUUID();
    const {entityId:studentId}=await run("ccp_students_create",{name:selectedName});
    const {entityId:otherId}=await run("ccp_students_create",{name:otherName});
    const {entityId:groupId}=await run("ccp_groups_create",{
      workplaceId,name:"Synthetic group audience",
    });
    for(const learner of [studentId,otherId]){
      await run("ccp_groups_enroll",{groupId,studentId:learner});
    }
    const {entityId:sessionId}=await run("ccp_sessions_create",{
      workplaceId,groupId,title:"Group chess notes",startsAt:future(5),durationMinutes:40,
    });
    const allowed="Approved learner note "+randomUUID();
    const privateText="Private learner note "+randomUUID();
    const other="Approved different learner note "+randomUUID();
    const group="Approved group-wide note "+randomUUID();
    const noteFixtures=[
      {studentId,body:allowed,privateBody:privateText},
      {studentId:otherId,body:other,privateBody:""},
      {studentId:null,body:group,privateBody:""},
    ];
    for(const note of noteFixtures){
      expect(await run("ccp_session_notes_save",{
        sessionId,...note,sharedWithContacts:true,sendEmail:false,
        expectedUpdatedAt:null,confirmed:true,
      })).toMatchObject({sessionId,studentId:note.studentId,emailQueued:false});
    }
    const backup=await page.request.get("/api/settings/export");
    expect(backup.ok()).toBe(true);
    const {tables}=await backup.json() as {tables:{
      session_notes:Array<Record<string,unknown>>;
      session_participants:Array<Record<string,unknown>>;
    }};
    const roster=tables.session_participants.filter(row=>row.session_id===sessionId);
    expect(roster.map(row=>row.student_id).sort()).toEqual([studentId,otherId].sort());
    const notes=tables.session_notes.filter(row=>row.session_id===sessionId);
    expect(notes).toHaveLength(noteFixtures.length);
    for(const note of noteFixtures){
      expect(notes).toContainEqual(expect.objectContaining({
        student_id:note.studentId,body:note.body,private_body:note.privateBody,shared_with_contacts:true,
      }));
    }

    const {id:contactId}=await run("ccp_contacts_create",{
      displayName:"Authorized synthetic contact",confirmed:true,
    });
    await run("ccp_student_contacts_link",{
      studentId,contactId,relationshipLabel:"Contact",confirmed:true,
    });
    const {id:grantId}=await run("ccp_portal_grants_create",{
      studentId,contactId,workplaceId,expiresAt:future(15),
      permissions:["calendar","shared_notes","cancel"],confirmed:true,
    });
    const issued=await page.request.post("/api/portal-grants/"+grantId+"/issue",{
      headers:{origin:new URL(baseURL??"http://localhost:3000").origin},
      data:{expectedRevision:1,confirmed:true},
    });
    expect(issued.status()).toBe(200);
    const path=new URL((await issued.json()).url).pathname;
    const token=path.split("/").at(-1)!;
    const calendar="/api/portal/"+token+"/calendar";
    const cancellation=(session:string,learner:string)=>
      "/api/portal/"+token+"/sessions/"+session+"/students/"+learner+"/cancel";
    const cancel=cancellation(sessionId,studentId);
    const guest=await playwright.request.newContext({baseURL});
    try{
      const initial=await guest.get(path);
      expect(initial.status()).toBe(200);
      const visible=await initial.text();
      expect(visible).toContain(allowed);
      for(const text of [privateText,other,group,otherName])expect(visible).not.toContain(text);
      expect(initial.headers()["cache-control"]).toContain("no-store");
      expect(initial.headers()["referrer-policy"]).toBe("no-referrer");
      const before=await call("ccp_attendance_preview",{sessionId});
      expect(before.error).toBeUndefined();
      expect(before.data.attendance.map((row:{student_id:string})=>row.student_id).sort())
        .toEqual([studentId,otherId].sort());
      for(const path of [cancellation(randomUUID(),studentId),cancellation(sessionId,randomUUID())]){
        const denied=await guest.post(path,{data:{note:"Incorrect calendar entry"}});
        expect(denied.status()).toBe(404);
        expect(await denied.json()).toEqual({error:"Not found"});
        expect(denied.headers()["cache-control"]).toContain("no-store");
        expect(denied.headers()["referrer-policy"]).toBe("no-referrer");
      }
      const unchanged=await call("ccp_attendance_preview",{sessionId});
      expect(unchanged.error).toBeUndefined();
      expect(unchanged.data.attendance).toEqual(before.data.attendance);
      const race=Promise.all([guest.get(path),guest.get(calendar)]);
      await run("ccp_portal_grants_revoke",{grantId,expectedRevision:2,confirmed:true});
      // A read started before the revoke committed can finish on the old grant.
      // It must never disclose another learner or the private note in either case.
      for(const response of await race){
        const body=await response.text();
        for(const text of [privateText,other,group,otherName])expect(body).not.toContain(text);
      }

      const [pageAfter,calendarAfter,cancelAfter]=await Promise.all([
        guest.get(path),guest.get(calendar),guest.post(cancel,{data:{note:"Synthetic post-revoke attempt"}}),
      ]);
      const deniedPage=await pageAfter.text();
      for(const text of [allowed,selectedName,privateText,other,group,otherName]){
        expect(deniedPage).not.toContain(text);
      }
      for(const response of [calendarAfter,cancelAfter]){
        expect(response.status()).toBe(404);
        expect(response.headers()["cache-control"]).toContain("no-store");
        expect(response.headers()["referrer-policy"]).toBe("no-referrer");
      }
      const attendance=await call("ccp_attendance_preview",{sessionId});
      expect(attendance.error).toBeUndefined();
      expect(attendance.data.attendance.map((row:{student_id:string;status:string})=>row.status))
        .not.toContain("student_cancelled");
    }finally{
      await guest.dispose();
    }
  });
