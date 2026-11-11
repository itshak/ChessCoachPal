import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-ad-hoc-three-students freezes exact roster across website and MCP",async({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const suff=randomUUID().slice(0,9);
  const wp=(await callTool("ccp_v1_workplaces_create",{
    name:"Ad-hoc "+suff,timezone:"UTC",currency:"USD",locale:"en",
    policy:{},idempotencyKey:randomUUID(),
  })).data as {entityId:string};
  expect(wp.entityId).toBeTruthy();
  const members:string[]=[];
  for(let i=0;i<3;i++){
    const created=await callTool("ccp_v1_students_create",{
      name:"One-off learner "+suff+" "+i,idempotencyKey:randomUUID(),
    });
    expect(created.error).toBeUndefined();
    const id=(created.data as {entityId:string}).entityId;
    members.push(id);
    const enrolled=await page.request.post("/api/agent/v1",{data:{
      action:"workplaces.enroll",workplaceId:wp.entityId,studentId:id,
    }});
    expect(enrolled.status(),await enrolled.text()).toBe(200);
  }
  const startsAt="2040-05-19T12:00:00.000Z",requestId=randomUUID();
  const args={
    workplaceId:wp.entityId,studentIds:members,title:"Three-person pawn endgame",
    startsAt,durationMinutes:45,lessonNote:"No permanent class",requestId,
  };
  const site=await page.request.post("/api/agent/v1",{data:{
    action:"sessions.createAdHoc",...args,
  }});
  expect(site.status(),await site.text()).toBe(200);
  const siteLesson=(await site.json()).data as {id:string;roster_mode:string;group_id:null;student_id:null};
  expect(siteLesson).toMatchObject({roster_mode:"ad_hoc",group_id:null,student_id:null});
  const pageRoster=await page.request.post("/api/agent/v1",{data:{
    action:"sessions.participants",sessionId:siteLesson.id,
  }});
  expect(pageRoster.status()).toBe(200);
  const siteMembers=(await pageRoster.json()).data as Array<{student_id:string}>;
  expect(siteMembers.map(m=>m.student_id).sort()).toEqual([...members].sort());
  const mcpDetails=await callTool("ccp_v1_sessions_details",{sessionId:siteLesson.id});
  expect(mcpDetails.error).toBeUndefined();
  expect(((mcpDetails.data as {participants:Array<{student_id:string}>}).participants)
    .map(m=>m.student_id).sort()).toEqual([...members].sort());
  const webAttendance=await page.request.post("/api/agent/v1",{data:{
    action:"attendance.list",sessionId:siteLesson.id,
  }});
  expect(webAttendance.status()).toBe(200);
  const attendance=(await webAttendance.json()).data as Array<{student_id:string;status:string}>;
  expect(attendance).toHaveLength(3);
  expect(attendance.every(a=>a.status==="unmarked")).toBe(true);
  const {requestId: _websiteRequestId,...mcpArgs}=args;
  const replay=await callTool("ccp_v1_sessions_ad_hoc_create",{
    ...mcpArgs,idempotencyKey:requestId,confirmed:true,
  });
  expect(replay.error).toBeUndefined();
  expect(replay.data).toEqual(siteLesson);
  const changed=await callTool("ccp_v1_sessions_ad_hoc_create",{
    ...mcpArgs,title:"Changed topic",idempotencyKey:requestId,confirmed:true,
  });
  expect(changed.error?.code).toBe("CONFLICT");
  const overlap=await page.request.post("/api/agent/v1",{data:{
    action:"sessions.create",workplaceId:wp.entityId,studentId:members[0],
    startsAt:"2040-05-19T12:10:00.000Z",durationMinutes:30,
    title:"Overlapping private session",lessonNote:"",requestId:randomUUID(),
  }});
  expect(overlap.status()).toBe(409);

  // A foreign teacher's student UUID must not be accepted in a lesson.
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {auth:{persistSession:false,autoRefreshToken:false}});
  const email="foreign-adhoc-"+randomUUID()+"@example.com";
  const {data:foreignUser,error:foreignAuthError}=await admin.auth.admin.createUser({
    email,password:"SyntheticPassword-123!",email_confirm:true,
  });
  expect(foreignAuthError).toBeNull();
  expect((await admin.from("teachers").insert({
    id:foreignUser.user!.id,email,display_name:"Other chess teacher",
  })).error).toBeNull();
  const {data:foreignStudent,error:foreignStudentError}=await admin.from("students")
    .insert({teacher_id:foreignUser.user!.id,name:"Foreign one-off learner"})
    .select("id").single();
  expect(foreignStudentError).toBeNull();
  const rejected=await callTool("ccp_v1_sessions_ad_hoc_create",{
    workplaceId:wp.entityId,studentIds:[members[0],foreignStudent!.id],
    title:"Invalid mixed-tenancy lesson",startsAt:"2040-05-20T10:00:00.000Z",
    durationMinutes:30,lessonNote:"",idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(rejected.error?.code).toBe("NOT_FOUND");
  expect((await admin.auth.admin.deleteUser(foreignUser.user!.id)).error).toBeNull();
});

test("PARITY:PARITY-ad-hoc-mcp-create stays visible through website attendance and roster",async({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const wp=(await callTool("ccp_v1_workplaces_create",{
    name:"Ad-hoc MCP "+randomUUID().slice(0,8),timezone:"UTC",
    currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
  })).data as {entityId:string};
  const ids:string[]=[];
  for(let i=0;i<2;i++){
    const made=await callTool("ccp_v1_students_create",{
      name:"Ad-hoc MCP student "+randomUUID().slice(0,8),idempotencyKey:randomUUID(),
    });
    const sid=(made.data as {entityId:string}).entityId;
    ids.push(sid);
    const joined=await callTool("ccp_v1_workplaces_enroll",{
      workplaceId:wp.entityId,studentId:sid,idempotencyKey:randomUUID(),
    });
    expect(joined.error).toBeUndefined();
  }
  const key=randomUUID();
  const made=await callTool("ccp_v1_sessions_ad_hoc_create",{
    workplaceId:wp.entityId,studentIds:ids,title:"MCP one-off strategy study",
    startsAt:"2040-06-21T09:00:00.000Z",durationMinutes:60,
    lessonNote:"Two learner shared lesson",idempotencyKey:key,confirmed:true,
  });
  expect(made.error).toBeUndefined();
  const sessionId=(made.data as {id:string}).id;
  const webRoster=await page.request.post("/api/agent/v1",{data:{
    action:"sessions.participants",sessionId,
  }});
  expect(webRoster.status()).toBe(200);
  expect(((await webRoster.json()).data as Array<{student_id:string}>)
    .map(r=>r.student_id).sort()).toEqual(ids.sort());
  const webList=await page.request.post("/api/agent/v1",{data:{action:"sessions.list"}});
  expect(webList.status()).toBe(200);
  expect(((await webList.json()).data as Array<{id:string}>).some(x=>x.id===sessionId)).toBe(true);
  const webAttendance=await page.request.post("/api/agent/v1",{data:{
    action:"attendance.list",sessionId,
  }});
  expect(webAttendance.status()).toBe(200);
  expect((await webAttendance.json()).data).toHaveLength(2);
});
