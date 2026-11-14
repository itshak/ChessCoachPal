import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { delegatedTool } from "./helpers/delegated-mcp";

const suffix = () => randomUUID().slice(0, 8);
type Call = (name:string,args:Record<string,unknown>)=>Promise<any>;

async function teacherFixture(call:Call) {
  const tag=suffix();
  const workplace=await call("ccp_v1_workplaces_create",{
    name:"Preview club "+tag,timezone:"Asia/Jerusalem",currency:"ILS",locale:"he",
    policy:{},idempotencyKey:randomUUID(),
  });
  expect(workplace.error).toBeUndefined();
  const workplaceId=workplace.data.entityId as string;
  const names=["שושנה לוי "+tag,"David synthetic "+tag,"Leah synthetic "+tag];
  const ids:string[]=[];
  for(const name of names){
    const result=await call("ccp_v1_students_create",{name,idempotencyKey:randomUUID()});
    expect(result.error).toBeUndefined();
    const id=result.data.entityId as string;
    ids.push(id);
    const enrolled=await call("ccp_v1_workplaces_enroll",{
      workplaceId,studentId:id,idempotencyKey:randomUUID(),
    });
    expect(enrolled.error).toBeUndefined();
  }
  return {tag,names,ids,workplaceId};
}

test("PARITY:PARITY-conversational-preview-exact-hebrew-alias-and-confirmed-session",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const {tag,names,ids,workplaceId}=await teacherFixture(call);
  const alias="Shoshi "+tag;
  const patched=await page.request.put("/api/students/"+ids[0],{
    data:{nameAliases:[alias]},
  });
  expect(patched.status(),await patched.text()).toBe(200);

  const day=new Date(Date.UTC(2058,1,1)+(parseInt(tag,16)%(365*24*60))*60_000)
    .toISOString();
  const payload={names:[alias,names[1],names[2]],workplaceId,
    title:"Chess endgames "+tag,startsAt:day,durationMinutes:90,
    lessonNote:"Lucena chapter — comprehension unknown"};
  const fromWeb=await page.request.post("/api/coaching/lesson-capture/preview",{
    data:payload,
  });
  expect(fromWeb.status(),await fromWeb.text()).toBe(200);
  const preview=await fromWeb.json();
  expect(preview.canCommit).toBe(true);
  expect(preview.issues).toEqual([]);
  expect(preview.resolutions.map((r:{studentId:string})=>r.studentId))
    .toEqual(ids);
  expect(preview.proposedSession).toMatchObject({
    workplaceId,studentIds:ids,durationMinutes:90,
    lessonNote:payload.lessonNote,
  });
  expect(preview.review.writesPerformed).toBe(false);
  expect(preview.review.attendance).toBe("unmarked");
  const fromMcp=await call("ccp_v1_lessons_capture_preview",payload);
  expect(fromMcp.error).toBeUndefined();
  expect(fromMcp.data).toEqual(preview);
  // The agent may omit a workplace only when the same three learners have
  // exactly one common current enrollment; both adapters must agree.
  const {workplaceId:omitted,...withoutWorkplace}=payload;
  void omitted;
  const inferredWeb=await page.request.post("/api/coaching/lesson-capture/preview",{
    data:withoutWorkplace,
  });
  expect(inferredWeb.status(),await inferredWeb.text()).toBe(200);
  const inferredMcp=await call("ccp_v1_lessons_capture_preview",withoutWorkplace);
  expect(inferredMcp.error).toBeUndefined();
  expect(inferredMcp.data).toEqual(await inferredWeb.json());
  expect(inferredMcp.data.canCommit).toBe(true);
  expect(inferredMcp.data.workplace.id).toBe(workplaceId);
  const beforeCommit=await call("ccp_v1_sessions_list",{query:payload.title,workplaceId});
  expect(beforeCommit.error).toBeUndefined();
  expect((beforeCommit.data as Array<{title:string}>)
    .filter(row=>row.title===payload.title)).toHaveLength(0);

  // Preview did not persist anything. Confirm through the existing one-session
  // transaction and read the frozen roster using the other transport.
  const idempotencyKey=randomUUID();
  const confirmed=await call("ccp_v1_sessions_ad_hoc_create",{
    ...preview.proposedSession,idempotencyKey,confirmed:true,
  });
  expect(confirmed.error).toBeUndefined();
  const sessionId=confirmed.data.id as string;
  expect(sessionId).toBeTruthy();
  expect(confirmed.data.duration_minutes).toBe(90);
  expect(confirmed.data.status).toBe("scheduled");

  const roster=await page.request.post("/api/agent/v1",{
    data:{action:"sessions.participants",sessionId},
  });
  expect(roster.status(),await roster.text()).toBe(200);
  expect((await roster.json()).data.map((r:{student_id:string})=>r.student_id).sort())
    .toEqual([...ids].sort());

  const attendance=await call("ccp_v1_attendance_preview",{sessionId});
  expect(attendance.error).toBeUndefined();
  expect(attendance.data.attendance).toHaveLength(3);
  expect(attendance.data.attendance.every((r:{status:string})=>r.status==="unmarked"))
    .toBe(true);

  const replay=await page.request.post("/api/agent/v1",{
    data:{action:"sessions.createAdHoc",
      ...preview.proposedSession,requestId:idempotencyKey},
  });
  expect(replay.status(),await replay.text()).toBe(200);
  expect((await replay.json()).data.id).toBe(sessionId);
  const afterReplay=await call("ccp_v1_sessions_details",{sessionId});
  expect(afterReplay.error).toBeUndefined();
  expect(afterReplay.data.id).toBe(sessionId);
  expect(afterReplay.data.duration_minutes).toBe(90);
  const changedReplay=await call("ccp_v1_sessions_ad_hoc_create",{
    ...preview.proposedSession,title:"Different lesson",idempotencyKey,confirmed:true,
  });
  expect(changedReplay.error?.code).toBe("CONFLICT");
});

test("PARITY:PARITY-conversational-preview-fails-closed-for-missing-duplicate-ambiguous-and-foreign-enrollment",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const {tag,names,ids,workplaceId}=await teacherFixture(call);
  const shared="Shared synthetic nickname "+tag;
  for(const id of ids.slice(0,2)){
    const response=await page.request.put("/api/students/"+id,{
      data:{nameAliases:[shared]},
    });
    expect(response.status(),await response.text()).toBe(200);
  }
  const common={
    workplaceId,title:"Identity review "+tag,
    startsAt:"2059-02-02T13:00:00+02:00",durationMinutes:75,lessonNote:"",
  };
  const invalidCases=[
    {names:[shared,names[2]],code:"AMBIGUOUS_STUDENT"},
    {names:[names[0],names[0]],code:"DUPLICATE_STUDENT"},
    {names:["Unknown synthetic "+tag,names[2]],code:"NOT_FOUND"},
  ];
  for(const testCase of invalidCases){
    const payload={...common,names:testCase.names};
    const web=await page.request.post("/api/coaching/lesson-capture/preview",{data:payload});
    expect(web.status(),await web.text()).toBe(200);
    const preview=await web.json();
    expect(preview.canCommit).toBe(false);
    expect(preview.proposedSession).toBeNull();
    expect(preview.issues.map((i:{code:string})=>i.code)).toContain(testCase.code);
    const mcp=await call("ccp_v1_lessons_capture_preview",payload);
    expect(mcp.error).toBeUndefined();
    expect(mcp.data).toEqual(preview);
  }
  const foreignWorkplace=await call("ccp_v1_lessons_capture_preview",{
    ...common,workplaceId:randomUUID(),names:[names[0],names[2]],
  });
  expect(foreignWorkplace.data.canCommit).toBe(false);
  expect(foreignWorkplace.data.issues.some((i:{code:string})=>
    i.code==="WORKPLACE_NOT_FOUND")).toBe(true);

  const second=await call("ccp_v1_workplaces_create",{
    name:"Second club "+tag,timezone:"UTC",currency:"USD",
    locale:"en",policy:{},idempotencyKey:randomUUID(),
  });
  expect(second.error).toBeUndefined();
  const secondId=second.data.entityId as string;
  for(const studentId of [ids[0],ids[2]]){
    expect((await call("ccp_v1_workplaces_enroll",{
      workplaceId:secondId,studentId,idempotencyKey:randomUUID(),
    })).error).toBeUndefined();
  }
  const ambiguous=await call("ccp_v1_lessons_capture_preview",{
    names:[names[0],names[2]],title:common.title,
    startsAt:common.startsAt,durationMinutes:common.durationMinutes,lessonNote:"",
  });
  expect(ambiguous.error).toBeUndefined();
  expect(ambiguous.data.canCommit).toBe(false);
  expect(ambiguous.data.issues.some((i:{code:string})=>i.code==="AMBIGUOUS_WORKPLACE"))
    .toBe(true);
  const incorrectEnrollment=await call("ccp_v1_lessons_capture_preview",{
    ...common,workplaceId:secondId,names:[names[0],names[1]],
  });
  expect(incorrectEnrollment.data.canCommit).toBe(false);
  expect(incorrectEnrollment.data.issues.some((i:{code:string})=>
    i.code==="STUDENT_NOT_ENROLLED")).toBe(true);
});
