import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

type Call=Awaited<ReturnType<typeof delegatedTool>>;
const unique=(name:string)=>name+" "+randomUUID().slice(0,10);
const localDate="2060-01-06";
const dayOfWeek=new Date(localDate+"T00:00:00Z").getUTCDay();

async function setup(call:Call,timezone="Asia/Jerusalem"){
 const workplace=await call("ccp_v1_workplaces_create",{
  name:unique("Weekly capture club"),timezone,currency:"ILS",locale:"he",
  policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 const students:string[]=[];
 const names:string[]=[];
 for(let i=0;i<3;i++){
  const name=unique("Weekly learner "+i);
  const student=await call("ccp_v1_students_create",{name,idempotencyKey:randomUUID()});
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  expect((await call("ccp_v1_workplaces_enroll",{
    workplaceId,studentId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
  students.push(studentId);names.push(name);
 }
 return {workplaceId,students,names,timezone};
}
async function createSlot(call:Call,workplaceId:string,studentId:string,
 startTime:string,date=localDate,durationMinutes=90,endDate:string|null=null){
 const result=await call("ccp_v1_recurring_slots_create",{
  studentId,workplaceId,dayOfWeek:new Date(date+"T00:00:00Z").getUTCDay(),
  startTime,durationMinutes,startDate:date,endDate,
  rateCents:null,isHomeVisit:false,confirmed:true,idempotencyKey:randomUUID(),
 });
 expect(result.error).toBeUndefined();
 return result.data.id as string;
}
async function previewWebsite(page:import("@playwright/test").Page,payload:Record<string,unknown>){
 const response=await page.request.post("/api/coaching/lesson-capture/preview",{data:payload});
 expect(response.status(),await response.text()).toBe(200);
 return await response.json();
}

test("PARITY:PARITY-weekly-slot-unique-time-and-existing-session-denial",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const {workplaceId,students,names}=await setup(call);
 const slotIds:string[]=[];
 for(const studentId of students)
  slotIds.push(await createSlot(call,workplaceId,studentId,"13:00"));
 const payload={names,workplaceId,localDate,
  title:unique("Inferred endgames lesson"),lessonNote:"Unverified understanding"};
 const web=await previewWebsite(page,payload);
 const mcp=await call("ccp_v1_lessons_capture_preview",payload);
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(web);
 expect(web.canCommit).toBe(true);
 expect(web.review.timeSource).toBe("weekly_slot");
 expect(web.review.slotIds).toEqual(slotIds.sort());
 expect(web.review.instructorMinutes).toBe(90);
 expect(web.proposedSession).toMatchObject({
  workplaceId,studentIds:students,durationMinutes:90,lessonNote:payload.lessonNote,
 });
 expect(web.proposedSession.startsAt).toBe("2060-01-06T11:00:00.000Z");
 const before=await call("ccp_v1_sessions_list",{
  query:payload.title,workplaceId,
 });
 expect(before.error).toBeUndefined();
 expect(before.data.filter((x:{title:string})=>x.title===payload.title)).toEqual([]);
 const requestId=randomUUID();
 const created=await page.request.post("/api/agent/v1",{
  data:{action:"sessions.createAdHoc",...web.proposedSession,requestId},
 });
 expect(created.status(),await created.text()).toBe(200);
 const sessionId=(await created.json()).data.id as string;
 const audit=await call("ccp_v1_sessions_details",{sessionId});
 expect(audit.error).toBeUndefined();
 expect(audit.data.participants.map((x:{student_id:string})=>x.student_id).sort())
  .toEqual([...students].sort());
 const nowWeb=await previewWebsite(page,payload);
 const nowMcp=await call("ccp_v1_lessons_capture_preview",payload);
 expect(nowMcp.error).toBeUndefined();
 expect(nowMcp.data).toEqual(nowWeb);
 expect(nowWeb.canCommit).toBe(false);
 expect(nowWeb.proposedSession).toBeNull();
 expect(nowWeb.issues.some((x:{code:string})=>x.code==="SCHEDULE_CONFLICT"))
  .toBe(true);
 expect(nowWeb.issues.find((x:{code:string})=>x.code==="SCHEDULE_CONFLICT").candidates)
  .toEqual(expect.arrayContaining([expect.objectContaining({id:sessionId})]));
 const retry=await call("ccp_v1_sessions_ad_hoc_create",{
  ...web.proposedSession,idempotencyKey:requestId,confirmed:true,
 });
 expect(retry.error).toBeUndefined();
 expect(retry.data.id).toBe(sessionId);
});

test("PARITY:PARITY-weekly-slot-missing-conflicting-and-ambiguous-time-denial",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const {workplaceId,students,names}=await setup(call);
 // Different local calendar date from the preceding test's committed
 // teacher-wide session: canonical scheduling intentionally blocks overlaps
 // even when the learners and workplace belong to different fixtures.
 const date="2060-01-13";
 for(const studentId of students.slice(0,2))
  await createSlot(call,workplaceId,studentId,"13:00",date);
 const input={names,workplaceId,localDate:date,title:unique("Uncertain weekday"),lessonNote:""};
 const missing=await previewWebsite(page,input);
 expect(missing.canCommit).toBe(false);
 expect(missing.issues.map((x:{code:string})=>x.code)).toContain("MISSING_SCHEDULE");
 const missingMcp=await call("ccp_v1_lessons_capture_preview",input);
 expect(missingMcp.data).toEqual(missing);
 await createSlot(call,workplaceId,students[2],"15:00",date);
 const conflicting=await previewWebsite(page,input);
 expect(conflicting.canCommit).toBe(false);
 expect(conflicting.issues.map((x:{code:string})=>x.code)).toContain("TIME_AMBIGUOUS");
 const conflictingMcp=await call("ccp_v1_lessons_capture_preview",input);
 expect(conflictingMcp.data).toEqual(conflicting);
 // Adding a common 13:00 slot resolves one exact candidate, while a second
 // matching time on every learner must become ambiguous again.
 await createSlot(call,workplaceId,students[2],"13:00",date);
 const uniqueWeb=await previewWebsite(page,input);
 expect(uniqueWeb.canCommit).toBe(true);
 const uniqueMcp=await call("ccp_v1_lessons_capture_preview",input);
 expect(uniqueMcp.data).toEqual(uniqueWeb);
 for(const studentId of students.slice(0,2))
  await createSlot(call,workplaceId,studentId,"15:00",date);
 const ambiguous=await previewWebsite(page,input);
 const ambiguousMcp=await call("ccp_v1_lessons_capture_preview",input);
 expect(ambiguousMcp.data).toEqual(ambiguous);
 expect(ambiguous.canCommit).toBe(false);
 expect(ambiguous.issues.map((x:{code:string})=>x.code)).toContain("TIME_AMBIGUOUS");
 // Date-only and explicit clock cannot be combined or partially supplied.
 const malformed=await page.request.post("/api/coaching/lesson-capture/preview",{
  data:{...input,startsAt:"2060-01-13T11:00:00Z",durationMinutes:90},
 });
 expect(malformed.status()).toBe(400);
 const invalidMcp=await call("ccp_v1_lessons_capture_preview",{
  ...input,startsAt:"2060-01-13T11:00:00Z",durationMinutes:90,
 });
 expect(invalidMcp.error).toBeDefined();
});

test("PARITY:PARITY-weekly-slot-DST-gap-and-fold-rejected",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const {workplaceId,students,names}=await setup(call,"America/New_York");
 for(const studentId of students)
  await createSlot(call,workplaceId,studentId,"02:30","2027-03-14",90,"2027-03-14");
 const spring={names,workplaceId,localDate:"2027-03-14",
  title:unique("DST spring"),lessonNote:""};
 const webSpring=await previewWebsite(page,spring);
 const mcpSpring=await call("ccp_v1_lessons_capture_preview",spring);
 expect(mcpSpring.data).toEqual(webSpring);
 expect(webSpring.canCommit).toBe(false);
 expect(webSpring.issues.map((x:{code:string})=>x.code)).toContain("DST_UNRESOLVED");
 for(const studentId of students)
  await createSlot(call,workplaceId,studentId,"01:30","2027-11-07",90,"2027-11-07");
 const fall={...spring,localDate:"2027-11-07",title:unique("DST fall")};
 const webFall=await previewWebsite(page,fall);
 const mcpFall=await call("ccp_v1_lessons_capture_preview",fall);
 expect(mcpFall.data).toEqual(webFall);
 expect(webFall.canCommit).toBe(false);
 expect(webFall.issues.map((x:{code:string})=>x.code)).toContain("DST_UNRESOLVED");
});
