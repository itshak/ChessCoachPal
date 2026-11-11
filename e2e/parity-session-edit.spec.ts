import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

const at=(base:number)=>new Date(Date.UTC(2048,0,1)+base*86400000).toISOString();

test("PARITY:PARITY-sessions-title-completion shares web and MCP revisioned lesson edits",async({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const workplace=(await callTool("ccp_v1_workplaces_create",{
    name:"Session edit "+randomUUID(),timezone:"UTC",currency:"USD",
    locale:"en",policy:{},idempotencyKey:randomUUID(),
  })).data as {entityId:string};
  const pupil=(await callTool("ccp_v1_students_create",{
    name:"Session edit learner "+randomUUID(),idempotencyKey:randomUUID(),
  })).data as {entityId:string};
  const joined=await page.request.post("/api/agent/v1",{data:{
    action:"workplaces.enroll",workplaceId:workplace.entityId,studentId:pupil.entityId,
  }});
  expect(joined.status(),await joined.text()).toBe(200);
  const created=await page.request.post("/api/agent/v1",{data:{
    action:"sessions.create",workplaceId:workplace.entityId,studentId:pupil.entityId,
    title:"Original chess topic",startsAt:at(120),durationMinutes:45,
    lessonNote:"Original coach note",requestId:randomUUID(),
  }});
  expect(created.status(),await created.text()).toBe(201);
  const sessionId=(await created.json()).data.id as string;
  const before=await callTool("ccp_v1_sessions_details",{sessionId});
  expect(before.error).toBeUndefined();
  const key=randomUUID();
  const mcp=await callTool("ccp_v1_sessions_edit",{
    sessionId,expectedUpdatedAt:before.data.updated_at,
    idempotencyKey:key,confirmed:true,
    changes:{title:"Revised chess topic",status:"completed",lessonNote:"Teacher confirmed progress"},
  });
  expect(mcp.error).toBeUndefined();
  const website=await page.request.post("/api/agent/v1",{
    data:{action:"sessions.list"},
  });
  expect(website.status(),await website.text()).toBe(200);
  const record=((await website.json()).data as Array<{
    id:string;title:string;status:string;lesson_note:string;
  }>).find(s=>s.id===sessionId);
  expect(record).toMatchObject({
    title:"Revised chess topic",status:"completed",lesson_note:"Teacher confirmed progress",
  });
  const browserEdit=await page.request.post("/api/agent/v1",{data:{
    action:"sessions.update",sessionId,title:"Website title correction",
    lessonNote:"Website corrected progress",
  }});
  expect(browserEdit.status(),await browserEdit.text()).toBe(200);
  const detail=await callTool("ccp_v1_sessions_details",{sessionId});
  expect(detail.data).toMatchObject({
    title:"Website title correction",status:"completed",lesson_note:"Website corrected progress",
  });
});

test("PARITY:PARITY-sessions-edit-stale-replay denies stale and conflicting signed edits",async({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const workplace=(await callTool("ccp_v1_workplaces_create",{
    name:"Session replay "+randomUUID(),timezone:"UTC",currency:"USD",
    locale:"en",policy:{},idempotencyKey:randomUUID(),
  })).data as {entityId:string};
  const pupil=(await callTool("ccp_v1_students_create",{
    name:"Revision learner "+randomUUID(),idempotencyKey:randomUUID(),
  })).data as {entityId:string};
  expect((await callTool("ccp_v1_workplaces_enroll",{
    workplaceId:workplace.entityId,studentId:pupil.entityId,
    idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
  const lesson=await callTool("ccp_v1_sessions_create",{
    workplaceId:workplace.entityId,studentId:pupil.entityId,
    title:"Replay test",startsAt:at(140),durationMinutes:40,
    lessonNote:"",idempotencyKey:randomUUID(),
  });
  expect(lesson.error).toBeUndefined();
  const sessionId=lesson.data.entityId as string;
  const before=(await callTool("ccp_v1_sessions_details",{sessionId})).data;
  const payload={
    sessionId,changes:{title:"Revision-checked title"},
    expectedUpdatedAt:before.updated_at as string,idempotencyKey:randomUUID(),
    confirmed:true,
  };
  const first=await callTool("ccp_v1_sessions_edit",payload);
  expect(first.error).toBeUndefined();
  const replay=await callTool("ccp_v1_sessions_edit",payload);
  expect(replay.error).toBeUndefined();
  expect(replay.data).toEqual(first.data);
  const different=await callTool("ccp_v1_sessions_edit",{
    ...payload,changes:{title:"Modified request with old key"},
  });
  expect(different.error?.code).toBe("CONFLICT");
  const stale=await callTool("ccp_v1_sessions_edit",{
    ...payload,idempotencyKey:randomUUID(),changes:{title:"Stale overwrite"},
  });
  expect(stale.error?.code).toBe("CONFLICT");
  const after=await page.request.post("/api/agent/v1",{data:{
    action:"sessions.list",
  }});
  expect(after.status(),await after.text()).toBe(200);
  const record=((await after.json()).data as Array<{id:string;title:string}>)
    .find(row=>row.id===sessionId);
  expect(record?.title).toBe("Revision-checked title");
});
