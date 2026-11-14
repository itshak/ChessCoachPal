import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";

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

test("PARITY:PARITY-bulk-exact-student-alias-resolution-web-MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const {students,names}=await setup(call);
 const alias=unique("English nickname");
 const updated=await page.request.put("/api/students/"+students[0],{
  data:{nameAliases:[alias]},
 });
 expect(updated.status(),await updated.text()).toBe(200);
 const input={names:[alias,names[1],"Not a real enrolled learner"]};
 const web=await page.request.post("/api/students/resolve",{data:input});
 expect(web.status(),await web.text()).toBe(200);
 const result=await web.json();
 const mcp=await call("ccp_v1_students_resolve",input);
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(result);
 expect(result.allResolved).toBe(false);
 expect(result.studentIds).toEqual([]);
 expect(result.resolutions.map((x:{status:string})=>x.status))
  .toEqual(["resolved","resolved","not_found"]);
 expect(result.resolutions[0].studentId).toBe(students[0]);
 expect(result.issues.map((x:{code:string})=>x.code)).toContain("NOT_FOUND");
 const duplicate={names:[alias,names[0]]};
 const dupWeb=await page.request.post("/api/students/resolve",{data:duplicate});
 expect(dupWeb.status()).toBe(200);
 const dupResult=await dupWeb.json();
 expect(dupResult.issues.map((x:{code:string})=>x.code)).toContain("DUPLICATE_STUDENT");
 expect((await call("ccp_v1_students_resolve",duplicate)).data).toEqual(dupResult);
});

test("PARITY:PARITY-standalone-day-lookup-uses-identical-tenant-scoped-schedule",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const {workplaceId,students}=await setup(call);
 const date="2062-01-06";
 const payload={localDate:date,workplaceId,studentIds:students};
 for(const studentId of students)
  await createSlot(call,workplaceId,studentId,"11:00",date,45);
 const web=await page.request.post("/api/coaching/lesson-capture/day",{data:payload});
 expect(web.status(),await web.text()).toBe(200);
 const result=await web.json();
 const mcp=await call("ccp_v1_schedule_day_preview",payload);
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(result);
 expect(result.canUse).toBe(true);
 expect(result.timing).toMatchObject({
  startsAt:"2062-01-06T09:00:00.000Z",durationMinutes:45,
  timeSource:"weekly_slot",
 });
 expect(result.timing.slotIds).toHaveLength(3);
 expect(result.writesPerformed).toBe(false);
 const unauthorized={...payload,workplaceId:randomUUID()};
 const negative=await page.request.post("/api/coaching/lesson-capture/day",{
  data:unauthorized,
 });
 expect(negative.status()).toBe(503);
 expect((await negative.json()).code).toBe("NOT_FOUND");
 const mcpDenied=await call("ccp_v1_schedule_day_preview",unauthorized);
 expect(mcpDenied.error?.code).toBe("NOT_FOUND");
});

test("PARITY:PARITY-exact-chapter-selection-rejects-unknown-ordinal-without-fiction",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const {workplaceId,names}=await setup(call);
 const payload={
  names,workplaceId,title:unique("Indexed classic game"),
  lessonNote:"Comprehension not assessed",
  startsAt:"2064-01-20T12:00:00+02:00",durationMinutes:90,
  chapterSelection:{studyId:"ab12CD34",chapterNumber:32,expectedPlayers:"Steinitz Chigorin"},
 };
 const browser=await page.request.post("/api/coaching/lesson-capture/preview",{
  data:payload,
 });
 expect(browser.status(),await browser.text()).toBe(200);
 const web=await browser.json();
 const mcp=await call("ccp_v1_lessons_capture_preview",payload);
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(web);
 expect(web.canCommit).toBe(false);
 expect(web.selectedChapter).toBeNull();
 expect(web.proposedSession).toBeNull();
 expect(web.issues.map((x:{code:string})=>x.code)).toContain("CHAPTER_NOT_FOUND");
 // No convenient "32nd classic game" fallback: an index needs authentic
 // provider study and chapter IDs before any coaching evidence can be linked.
 const plain={...payload};
 delete (plain as {chapterSelection?:unknown}).chapterSelection;
 const noChapter=await page.request.post("/api/coaching/lesson-capture/preview",{
  data:plain,
 });
 expect(noChapter.status(),await noChapter.text()).toBe(200);
 const withoutChapter=await noChapter.json();
 expect(withoutChapter.canCommit).toBe(true);
 expect(withoutChapter.selectedChapter).toBeNull();
 expect(withoutChapter.review.materialAssociation).toBe("not_written");
});

test("PARITY:PARITY-classic-games-32-exact-study-title-and-PGN-names",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const {workplaceId,names}=await setup(call);
 // Synthetic teacher-index fixture. No private PGN is stored, and the
 // authenticated teacher-only RPC is the same atomic metadata-index writer
 // used by the real read-authorized Lichess sync.
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
   });
 const signed=await client.auth.signInWithPassword(SEED_TEACHER);
 expect(signed.error).toBeNull();
 const studyId="CLAS"+randomUUID().replace(/-/g,"").slice(0,4).toUpperCase();
 const chapters=Array.from({length:32},(_,i)=>({
  studyName:"Classic Games 2",
  chapterId:String(i+1).padStart(8,"0"),
  chapterNumber:i+1,
  chapterName:i===31?"Steinitz versus Chigorin":"Historical game "+(i+1),
  white:i===31?"Wilhelm Steinitz":"White Player",
  black:i===31?"Mikhail Chigorin":"Black Player",
  event:"Synthetic chess study",date:"1892.01.01",eco:"C50",
  opening:"Italian Game",fen:null,
 }));
 const indexed=await client.rpc("ccp_teacher_study_index_replace",{
  p_study_id:studyId,p_chapters:chapters,
 });
 expect(indexed.error,indexed.error?.message).toBeNull();
 const base={
  names,workplaceId,title:unique("Historical classics 32"),
  startsAt:"2065-02-01T14:00:00+02:00",durationMinutes:90,
  lessonNote:"Teaching note; no inferred comprehension",
 };
 const selection={studyName:"Classic Games 2",chapterNumber:32,
  expectedPlayers:"Steinitz–Chigorin"};
 const payload={...base,chapterSelection:selection};
 const webResp=await page.request.post("/api/coaching/lesson-capture/preview",{
  data:payload,
 });
 expect(webResp.status(),await webResp.text()).toBe(200);
 const web=await webResp.json();
 const fromMcp=await call("ccp_v1_lessons_capture_preview",payload);
 expect(fromMcp.error).toBeUndefined();
 expect(fromMcp.data).toEqual(web);
 expect(web.canCommit).toBe(true);
 expect(web.selectedChapter).toMatchObject({
  studyId,chapterId:"00000032",studyName:"Classic Games 2",
  chapterNumber:32,white:"Wilhelm Steinitz",black:"Mikhail Chigorin",
  attached:false,
 });
 expect(web.proposedSession.durationMinutes).toBe(90);
 expect(web.review.materialAssociation).toBe("not_written");
 const mismatched={...base,chapterSelection:{
  ...selection,expectedPlayers:"Steinitz–Kasparov",
 }};
 const mismatchWeb=await page.request.post("/api/coaching/lesson-capture/preview",{
  data:mismatched,
 });
 expect(mismatchWeb.status()).toBe(200);
 const mismatch=await mismatchWeb.json();
 expect((await call("ccp_v1_lessons_capture_preview",mismatched)).data)
  .toEqual(mismatch);
 expect(mismatch.canCommit).toBe(false);
 expect(mismatch.issues.map((x:{code:string})=>x.code))
  .toContain("CHAPTER_PLAYERS_MISMATCH");
 // No guessed material teaching evidence or automatic chapter attachment.
 const next=await call("ccp_v1_materials_chapters_get",{
  studyId,chapterId:"00000032",
 });
 expect(next.error).toBeUndefined();
 expect(next.data.chapter_number).toBe(32);
});
