import {randomUUID} from "node:crypto";
import {expect,test,type Page} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

type Tool=(name:string,args:Record<string,unknown>)=>Promise<{
  data?:any;error?:{code:string;message:string};
}>;
const unique=(name:string)=>name+" "+randomUUID().slice(0,8);
async function student(callTool:Tool){
  const made=await callTool("ccp_v1_students_create",{
    name:unique("Chess learner"),idempotencyKey:randomUUID(),
  });
  expect(made.error).toBeUndefined();
  return made.data.entityId as string;
}
async function profile(page:Page,id:string) {
  const res=await page.request.get("/api/students/"+id);
  expect(res.status(),await res.text()).toBe(200);
  return await res.json() as {
    id:string;name:string;level:string|null;birthdate:string|null;
    practice_start_date:string|null;teacher_notes:string|null;
    default_rate_cents:number|null;travel_fee_cents:number|null;
    updated_at:string;
  };
}

test("PARITY:PARITY-students-rename preserves identity and historical lesson roster",async({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const id=await student(callTool);
  const workplace=(await callTool("ccp_v1_workplaces_create",{
    name:unique("History workplace"),timezone:"UTC",currency:"USD",locale:"en",
    policy:{},idempotencyKey:randomUUID(),
  })).data.entityId as string;
  expect((await callTool("ccp_v1_workplaces_enroll",{
    workplaceId:workplace,studentId:id,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
  const made=await callTool("ccp_v1_sessions_create",{
    workplaceId:workplace,studentId:id,title:"Student name history",
    startsAt:new Date(Date.UTC(2045,0,1)+Math.floor(Math.random()*31536000000)).toISOString(),
    durationMinutes:45,lessonNote:"Teaching identity must not duplicate",
    idempotencyKey:randomUUID(),
  });
  expect(made.error).toBeUndefined();
  const sessionId=made.data.entityId as string;
  const before=await callTool("ccp_v1_sessions_participants",{sessionId});
  expect(before.error).toBeUndefined();
  expect((before.data as Array<{student_id:string}>).map(x=>x.student_id)).toEqual([id]);
  const browserName=unique("Renamed website student");
  const webEdit=await page.request.put("/api/students/"+id,{
    data:{name:browserName},
  });
  expect(webEdit.status(),await webEdit.text()).toBe(200);
  expect((await callTool("ccp_v1_students_profile",{studentId:id})).data.name)
    .toBe(browserName);
  const current=await profile(page,id);
  const mcpName=unique("Renamed MCP student");
  const corrected=await callTool("ccp_v1_students_profile_edit",{
    studentId:id,changes:{name:mcpName},
    expectedUpdatedAt:current.updated_at,confirmed:true,
  });
  expect(corrected.error).toBeUndefined();
  expect((await profile(page,id))).toMatchObject({id,name:mcpName});
  const past=await page.request.post("/api/agent/v1",{data:{
    action:"sessions.participants",sessionId,
  }});
  expect(past.status(),await past.text()).toBe(200);
  expect((await past.json()).data.map((x:{student_id:string})=>x.student_id))
    .toEqual([id]);
});

test("PARITY:PARITY-students-level supports website edit and MCP cleared-level correction",async({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const id=await student(callTool);
  const edited=await page.request.put("/api/students/"+id,{
    data:{level:"Rook endings"},
  });
  expect(edited.status(),await edited.text()).toBe(200);
  const model=await callTool("ccp_v1_students_profile",{studentId:id});
  expect(model.error).toBeUndefined();
  expect(model.data.level).toBe("Rook endings");
  const before=await profile(page,id);
  const cleared=await callTool("ccp_v1_students_profile_edit",{
    studentId:id,expectedUpdatedAt:before.updated_at,
    changes:{level:null},confirmed:true,
  });
  expect(cleared.error).toBeUndefined();
  expect((await profile(page,id)).level).toBeNull();
});

test("PARITY:PARITY-students-dates edits and clears optional birthdate and practice-start date",async({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const id=await student(callTool),initial=await profile(page,id);
  const changed=await callTool("ccp_v1_students_profile_edit",{
    studentId:id,expectedUpdatedAt:initial.updated_at,confirmed:true,
    changes:{birthdate:"2011-09-16",practiceStartDate:"2025-01-11"},
  });
  expect(changed.error).toBeUndefined();
  expect((await profile(page,id))).toMatchObject({
    birthdate:"2011-09-16",practice_start_date:"2025-01-11",
  });
  const cleared=await page.request.put("/api/students/"+id,{
    data:{birthdate:null,practiceStartDate:null},
  });
  expect(cleared.status(),await cleared.text()).toBe(200);
  const model=await callTool("ccp_v1_students_profile",{
    studentId:id,includePrivate:true,confirmed:true,
  });
  expect(model.error).toBeUndefined();
  expect(model.data.birthdate).toBeNull();
  expect(model.data.practice_start_date).toBeNull();
});

test("PARITY:PARITY-students-private-notes redacts default MCP read and permits confirmed corrections",async({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const id=await student(callTool),initial=await profile(page,id);
  const note="Private synthetic endgame coaching note "+randomUUID();
  const changed=await callTool("ccp_v1_students_profile_edit",{
    studentId:id,expectedUpdatedAt:initial.updated_at,confirmed:true,
    changes:{teacherNotes:note},
  });
  expect(changed.error).toBeUndefined();
  expect((await profile(page,id)).teacher_notes).toBe(note);
  const defaultRead=await callTool("ccp_v1_students_profile",{studentId:id});
  expect(defaultRead.error).toBeUndefined();
  expect(defaultRead.data.teacher_notes).toBeUndefined();
  const approved=await callTool("ccp_v1_students_profile",{
    studentId:id,includePrivate:true,confirmed:true,
  });
  expect(approved.data.teacher_notes).toBe(note);
  const browserClear=await page.request.put("/api/students/"+id,{
    data:{teacherNotes:null},
  });
  expect(browserClear.status(),await browserClear.text()).toBe(200);
  const after=await callTool("ccp_v1_students_profile",{
    studentId:id,includePrivate:true,confirmed:true,
  });
  expect(after.data.teacher_notes).toBeNull();
});

test("PARITY:PARITY-students-rate-fee corrects money fields bidirectionally with scoped access",async({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const id=await student(callTool),initial=await profile(page,id);
  const mcp=await callTool("ccp_v1_students_profile_edit",{
    studentId:id,expectedUpdatedAt:initial.updated_at,confirmed:true,
    changes:{defaultRateCents:4800,travelFeeCents:900},
  });
  expect(mcp.error).toBeUndefined();
  expect((await profile(page,id))).toMatchObject({
    default_rate_cents:4800,travel_fee_cents:900,
  });
  const browser=await page.request.put("/api/students/"+id,{
    data:{defaultRateCents:4200,travelFeeCents:0},
  });
  expect(browser.status(),await browser.text()).toBe(200);
  const normal=await callTool("ccp_v1_students_profile",{studentId:id});
  expect(normal.data.default_rate_cents).toBeUndefined();
  const privateRead=await callTool("ccp_v1_students_profile",{
    studentId:id,includePrivate:true,confirmed:true,
  });
  expect(privateRead.error).toBeUndefined();
  expect(privateRead.data.default_rate_cents).toBe(4200);
  expect(privateRead.data.travel_fee_cents).toBe(0);
});
