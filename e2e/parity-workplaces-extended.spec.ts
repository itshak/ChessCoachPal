import {randomUUID} from "node:crypto";
import {expect,test,type Page} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

type Tool=(name:string,args:Record<string,unknown>)=>Promise<{
  data?:any;error?:{code:string;message:string};
}>;
const unique=(prefix:string)=>prefix+" "+randomUUID().slice(0,9);
async function workplace(callTool:Tool) {
  const result=await callTool("ccp_v1_workplaces_create",{
    name:unique("Parity workplace"),timezone:"UTC",currency:"USD",
    locale:"en",policy:{},idempotencyKey:randomUUID(),
  });
  expect(result.error).toBeUndefined();
  const id=result.data.entityId as string;
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return id;
}
async function student(callTool:Tool) {
  const result=await callTool("ccp_v1_students_create",{
    name:unique("Parity learner"),idempotencyKey:randomUUID(),
  });
  expect(result.error).toBeUndefined();
  return result.data.entityId as string;
}
async function websiteWorkplace(page:Page,id:string) {
  const response=await page.request.post("/api/agent/v1",{data:{action:"workplaces.list"}});
  expect(response.status(),await response.text()).toBe(200);
  const row=((await response.json()).data as Array<{
    id:string;name:string;timezone:string;currency:string;locale:string;
    policy:Record<string,unknown>;updated_at:string;
  }>).find(r=>r.id===id);
  expect(row).toBeDefined();
  return row!;
}

test("PARITY:PARITY-workplaces-rename preserves same ID and session-report history",async({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const id=await workplace(callTool);
  const learner=await student(callTool);
  expect((await callTool("ccp_v1_workplaces_enroll",{
    workplaceId:id,studentId:learner,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
  const start=new Date(Date.UTC(2046,0,1)+Math.floor(Math.random()*31536000000));
  const day=start.toISOString().slice(0,10);
  const session=await callTool("ccp_v1_sessions_create",{
    workplaceId:id,studentId:learner,title:unique("Original workplace history"),
    startsAt:start.toISOString(),durationMinutes:45,lessonNote:"Audit-safe synthetic lesson",
    idempotencyKey:randomUUID(),
  });
  expect(session.error).toBeUndefined();
  const params=new URLSearchParams({workplaceId:id,from:day,to:day});
  const original=await page.request.get("/api/coaching/report?"+params.toString());
  expect(original.status(),await original.text()).toBe(200);
  const before=await original.json();
  expect(before.report.sessions).toBeGreaterThan(0);
  const old=await websiteWorkplace(page,id);
  const name=unique("Renamed workplace");
  const rename=await callTool("ccp_v1_workplaces_update",{
    workplaceId:id,name,expectedUpdatedAt:old.updated_at,idempotencyKey:randomUUID(),
  });
  expect(rename.error).toBeUndefined();
  const changed=await websiteWorkplace(page,id);
  expect(changed.name).toBe(name);
  expect(changed.id).toBe(id);
  const newReport=await page.request.get("/api/coaching/report?"+params.toString());
  expect(newReport.status(),await newReport.text()).toBe(200);
  const after=await newReport.json();
  expect(after.report.sessions).toBe(before.report.sessions);
  expect(after.report.teachingMinutes).toBe(before.report.teachingMinutes);
  expect(after.report.attendance).toEqual(before.report.attendance);
  expect(((await callTool("ccp_v1_workplaces_list",{})).data as Array<{id:string;name:string}>)
    .find(x=>x.id===id)?.name).toBe(name);
});

test("PARITY:PARITY-workplaces-policy edits timezone locale currency and policy with revision",async({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const id=await workplace(callTool);
  const before=await websiteWorkplace(page,id);
  const browserEdit=await page.request.post("/api/agent/v1",{data:{
    action:"workplaces.update",workplaceId:id,
    timezone:"Asia/Jerusalem",currency:"ILS",locale:"he",
    policy:{cancellationHours:24},
    expectedUpdatedAt:before.updated_at,idempotencyKey:randomUUID(),
  }});
  expect(browserEdit.status(),await browserEdit.text()).toBe(200);
  const browserRow=await websiteWorkplace(page,id);
  expect(browserRow).toMatchObject({
    timezone:"Asia/Jerusalem",currency:"ILS",locale:"he",policy:{cancellationHours:24},
  });
  const toolRows=(await callTool("ccp_v1_workplaces_list",{})).data as Array<{
    id:string;timezone:string;currency:string;locale:string;policy:Record<string,unknown>;
  }>;
  expect(toolRows.find(x=>x.id===id)).toMatchObject({
    timezone:browserRow.timezone,currency:browserRow.currency,
    locale:browserRow.locale,policy:browserRow.policy,
  });
  const stale=await callTool("ccp_v1_workplaces_update",{
    workplaceId:id,expectedUpdatedAt:before.updated_at,name:"Stale overwrite",
    idempotencyKey:randomUUID(),
  });
  expect(stale.error?.code).toBe("CONFLICT");
  const revised=await callTool("ccp_v1_workplaces_update",{
    workplaceId:id,name:unique("MCP policy rename"),
    expectedUpdatedAt:browserRow.updated_at,idempotencyKey:randomUUID(),
  });
  expect(revised.error).toBeUndefined();
  expect((await websiteWorkplace(page,id)).name).not.toBe(browserRow.name);
});

test("PARITY:PARITY-workplaces-enrollments compares complete current owned roster",async({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const id=await workplace(callTool);
  const learner=await student(callTool);
  const create=await page.request.post("/api/agent/v1",{data:{
    action:"workplaces.enroll",workplaceId:id,studentId:learner,
  }});
  expect(create.status(),await create.text()).toBe(200);
  const web=await page.request.post("/api/agent/v1",{data:{
    action:"workplaces.enrollments",workplaceId:id,
  }});
  expect(web.status(),await web.text()).toBe(200);
  const members=(await web.json()).data as Array<{student_id:string}>;
  expect(members.map(x=>x.student_id)).toContain(learner);
  const mcp=await callTool("ccp_v1_workplaces_enrollments",{workplaceId:id});
  expect(mcp.error).toBeUndefined();
  expect(mcp.data).toEqual(members);
  const unknown=await callTool("ccp_v1_workplaces_enrollments",{
    workplaceId:"00000000-0000-4000-8000-000000000001",
  });
  expect(unknown.error?.code).toBe("NOT_FOUND");
});

test("PARITY:PARITY-workplaces-unenroll-history preserves frozen lessons across MCP and website",async({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const id=await workplace(callTool),learner=await student(callTool);
  expect((await callTool("ccp_v1_workplaces_enroll",{
    workplaceId:id,studentId:learner,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
  const lesson=await callTool("ccp_v1_sessions_create",{
    workplaceId:id,studentId:learner,title:unique("Historical standalone lesson"),
    startsAt:new Date(Date.UTC(2019,0,1)+Math.floor(Math.random()*31536000000)).toISOString(),
    durationMinutes:45,lessonNote:"Preserve this teaching snapshot",
    idempotencyKey:randomUUID(),
  });
  expect(lesson.error).toBeUndefined();
  const sessionId=lesson.data.entityId as string;
  const before=await page.request.post("/api/agent/v1",{
    data:{action:"sessions.participants",sessionId},
  });
  expect(before.status(),await before.text()).toBe(200);
  const roster=(await before.json()).data as Array<{student_id:string}>;
  expect(roster.map(p=>p.student_id)).toEqual([learner]);
  const unenroll=await callTool("ccp_v1_workplaces_unenroll",{
    workplaceId:id,studentId:learner,confirmed:true,
  });
  expect(unenroll.error).toBeUndefined();
  expect(unenroll.data.removed).toBe(true);
  const browser=await page.request.post("/api/agent/v1",{data:{
    action:"workplaces.enrollments",workplaceId:id,
  }});
  expect(browser.status()).toBe(200);
  expect((await browser.json()).data).toEqual([]);
  const historical=await page.request.post("/api/agent/v1",{
    data:{action:"sessions.participants",sessionId},
  });
  expect(historical.status()).toBe(200);
  expect((await historical.json()).data).toEqual(roster);
  expect((await callTool("ccp_v1_sessions_participants",{sessionId})).data).toEqual(roster);
  const siteJoin=await page.request.post("/api/agent/v1",{data:{
    action:"workplaces.enroll",workplaceId:id,studentId:learner,
  }});
  expect(siteJoin.status(),await siteJoin.text()).toBe(200);
  const restoredMembers=(await callTool("ccp_v1_workplaces_enrollments",{workplaceId:id}))
    .data as Array<{student_id:string}>;
  expect(restoredMembers.some(x=>x.student_id===learner)).toBe(true);
});
