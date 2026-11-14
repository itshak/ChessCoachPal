import {randomUUID} from "node:crypto";
import {expect,test,type Page} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

type Tool=(name:string,args:Record<string,unknown>)=>Promise<{
  data?:any;error?:{code:string;message:string};
}>;
const name=(p:string)=>p+" "+randomUUID().slice(0,9);
async function context(call:Tool){
  const wp=await call("ccp_v1_workplaces_create",{
    name:name("Session workplace"),timezone:"UTC",currency:"USD",locale:"en",
    policy:{},idempotencyKey:randomUUID(),
  });
  expect(wp.error).toBeUndefined();
  const workplaceId=wp.data.entityId as string;
  const studentIds:string[]=[];
  for(let i=0;i<2;i++){
    const s=await call("ccp_v1_students_create",{
      name:name("Session learner"),idempotencyKey:randomUUID(),
    });
    expect(s.error).toBeUndefined();
    const id=s.data.entityId as string;studentIds.push(id);
    expect((await call("ccp_v1_workplaces_enroll",{
      workplaceId,studentId:id,idempotencyKey:randomUUID(),
    })).error).toBeUndefined();
  }
  const group=await call("ccp_v1_groups_create",{
    workplaceId,name:name("Training class"),idempotencyKey:randomUUID(),
  });
  expect(group.error).toBeUndefined();
  const groupId=group.data.entityId as string;
  for(const studentId of studentIds){
    expect((await call("ccp_v1_groups_enroll",{
      groupId,studentId,idempotencyKey:randomUUID(),
    })).error).toBeUndefined();
  }
  return {workplaceId,groupId,studentIds};
}
async function browserSession(page:Page,sessionId:string){
  const res=await page.request.post("/api/agent/v1",{data:{action:"sessions.list"}});
  expect(res.status(),await res.text()).toBe(200);
  const rows=(await res.json()).data as Array<{
    id:string;group_id:string|null;student_id:string|null;
    starts_at:string;status:string;title:string;duration_minutes:number;
  }>;
  const found=rows.find(row=>row.id===sessionId);
  expect(found).toBeDefined();
  return found!;
}
const day=(d:number)=>"2049-06-"+String(d).padStart(2,"0")+"T10:00:00Z";

test("PARITY:PARITY-sessions-standard-creation covers private and frozen group sessions on both transports",async({page,request})=>{
  const call=await delegatedTool(page,request),ctx=await context(call);
  const group=await call("ccp_v1_sessions_create",{
    workplaceId:ctx.workplaceId,groupId:ctx.groupId,
    title:name("Group fundamentals"),startsAt:day(2),durationMinutes:60,
    lessonNote:"Two learners one teacher",idempotencyKey:randomUUID(),
  });
  expect(group.error).toBeUndefined();
  const groupId=group.data.entityId as string;
  const siteGroup=await browserSession(page,groupId);
  expect(siteGroup.group_id).toBe(ctx.groupId);
  expect(siteGroup.student_id).toBeNull();
  const frozen=await call("ccp_v1_sessions_participants",{sessionId:groupId});
  expect(frozen.error).toBeUndefined();
  expect((frozen.data as Array<{student_id:string}>).map(x=>x.student_id).sort())
    .toEqual([...ctx.studentIds].sort());
  const direct=await page.request.post("/api/agent/v1",{data:{
    action:"sessions.create",workplaceId:ctx.workplaceId,
    studentId:ctx.studentIds[0],title:name("Individual development"),
    startsAt:day(3),durationMinutes:50,
    lessonNote:"One student",requestId:randomUUID(),
  }});
  expect(direct.status(),await direct.text()).toBe(201);
  const directId=(await direct.json()).data.id as string;
  const mcp=await call("ccp_v1_sessions_details",{sessionId:directId});
  expect(mcp.error).toBeUndefined();
  expect(mcp.data.student_id).toBe(ctx.studentIds[0]);
  expect(mcp.data.participants.map((x:{student_id:string})=>x.student_id))
    .toEqual([ctx.studentIds[0]]);
});

test("PARITY:PARITY-sessions-reschedule-cancel keeps conflict-safe status and history across clients",async({page,request})=>{
  const call=await delegatedTool(page,request),ctx=await context(call);
  const made=await call("ccp_v1_sessions_create",{
    workplaceId:ctx.workplaceId,studentId:ctx.studentIds[0],
    title:name("Reschedule and cancel"),startsAt:day(5),
    durationMinutes:45,lessonNote:"Retain history",idempotencyKey:randomUUID(),
  });
  expect(made.error).toBeUndefined();
  const sessionId=made.data.entityId as string;
  const initial=(await call("ccp_v1_sessions_details",{sessionId})).data;
  const updated=await call("ccp_v1_sessions_reschedule",{
    sessionId,startsAt:day(6),durationMinutes:60,
    expectedUpdatedAt:initial.updated_at,idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(updated.error).toBeUndefined();
  const web=await browserSession(page,sessionId);
  expect(new Date(web.starts_at).toISOString()).toBe(day(6).replace("Z",".000Z"));
  expect(web.duration_minutes).toBe(60);
  const revision=(await call("ccp_v1_sessions_details",{sessionId})).data.updated_at as string;
  const cancelled=await call("ccp_v1_sessions_cancel",{
    sessionId,expectedUpdatedAt:revision,idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(cancelled.error).toBeUndefined();
  expect((await browserSession(page,sessionId)).status).toBe("cancelled");
  expect((await call("ccp_v1_sessions_participants",{sessionId})).data)
    .toHaveLength(1);
  const another=await page.request.post("/api/agent/v1",{data:{
    action:"sessions.create",workplaceId:ctx.workplaceId,
    studentId:ctx.studentIds[1],title:name("Browser reschedule"),
    startsAt:day(8),durationMinutes:45,lessonNote:"",requestId:randomUUID(),
  }});
  expect(another.status(),await another.text()).toBe(201);
  const anotherId=(await another.json()).data.id as string;
  const browserEdit=await page.request.post("/api/agent/v1",{data:{
    action:"sessions.update",sessionId:anotherId,startsAt:day(9),durationMinutes:50,
  }});
  expect(browserEdit.status(),await browserEdit.text()).toBe(200);
  const final=(await call("ccp_v1_sessions_details",{sessionId:anotherId})).data;
  expect(final.duration_minutes).toBe(50);
  expect(new Date(final.starts_at).toISOString()).toBe(day(9).replace("Z",".000Z"));
});

test("PARITY:PARITY-attendance-individual records frozen participant status through both interfaces",async({page,request})=>{
  const call=await delegatedTool(page,request),ctx=await context(call);
  const group=await call("ccp_v1_sessions_create",{
    workplaceId:ctx.workplaceId,groupId:ctx.groupId,
    title:name("Attendance class"),startsAt:day(11),durationMinutes:45,
    lessonNote:"Attendance on two students",idempotencyKey:randomUUID(),
  });
  expect(group.error).toBeUndefined();
  const sessionId=group.data.entityId as string;
  const preview=await call("ccp_v1_attendance_preview",{sessionId});
  expect(preview.error).toBeUndefined();
  const register=preview.data.attendance as Array<{
    student_id:string;status:string;updated_at:string;note:string;
  }>;
  expect(register).toHaveLength(2);
  expect(register.every(x=>x.status==="unmarked")).toBe(true);
  const first=register.find(x=>x.student_id===ctx.studentIds[0])!;
  const changed=await call("ccp_v1_attendance_record",{
    sessionId,studentId:first.student_id,status:"late",note:"Arrived late",
    expectedUpdatedAt:first.updated_at,idempotencyKey:randomUUID(),
  });
  expect(changed.error).toBeUndefined();
  const website=await page.request.post("/api/agent/v1",{data:{
    action:"attendance.list",sessionId,
  }});
  expect(website.status(),await website.text()).toBe(200);
  const after=(await website.json()).data as Array<{student_id:string;status:string}>;
  expect(after.find(x=>x.student_id===first.student_id)?.status).toBe("late");
  const second=await page.request.post("/api/agent/v1",{data:{
    action:"attendance.record",sessionId,studentId:ctx.studentIds[1],
    status:"present",note:"Focused study",
  }});
  expect(second.status(),await second.text()).toBe(200);
  const mcp=await call("ccp_v1_attendance_preview",{sessionId});
  expect(mcp.error).toBeUndefined();
  const current=mcp.data.attendance as Array<{student_id:string;status:string}>;
  expect(current.find(x=>x.student_id===ctx.studentIds[1])?.status).toBe("present");
  expect(current.find(x=>x.student_id===first.student_id)?.status).toBe("late");
});
