import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {isolatedTeacherTest} from "./helpers/isolated-teacher";

isolatedTeacherTest("PARITY: multilingual lesson capture preserves the private original and counts one completed group lesson",async({
 page,request,browser,isolatedTeacher,
})=>{
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const tag=randomUUID().slice(0,8);
 const workplace=await call("ccp_workplaces_create",{
  name:"מועדון "+tag,timezone:"Asia/Jerusalem",currency:"ILS",locale:"he",policy:{},
  idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 const names=["שושנה לוי "+tag,"דוד כהן "+tag,"לאה רז "+tag];
 const ids:string[]=[];
 for(const name of names){
  const learner=await call("ccp_students_create",{name,idempotencyKey:randomUUID()});
  expect(learner.error).toBeUndefined();
  const studentId=learner.data.entityId as string;
  ids.push(studentId);
  expect((await call("ccp_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
 }
 const first="Шошана "+tag,shared="Общее имя "+tag;
 for(const [index,nameAliases] of [[0,[first,shared]],[1,[shared]]] as const){
  expect((await page.request.put("/api/students/"+ids[index],{data:{nameAliases}})).status()).toBe(200);
 }
 const day="2046-03-04",title="Пешечные окончания "+tag;
 const lessonNote="Разобрали оппозицию. Уровень понимания пока не установлен.";
 const payload={workplaceId,title,lessonNote,startsAt:day+"T17:30:00+02:00",durationMinutes:75,
  names:[first,names[1],names[2]]};
 const previewUrl="/api/coaching/lesson-capture/preview";
 const ambiguous={...payload,names:[shared,names[2]]};
 const ambiguousWeb=await page.request.post(previewUrl,{data:ambiguous});
 expect(ambiguousWeb.status()).toBe(200);
 const blocked=await ambiguousWeb.json();
 expect(blocked).toMatchObject({canCommit:false,proposedSession:null,review:{writesPerformed:false}});
 expect(blocked.issues).toEqual(expect.arrayContaining([expect.objectContaining({code:"AMBIGUOUS_STUDENT"})]));
 expect((await call("ccp_lessons_capture_preview",ambiguous)).data).toEqual(blocked);
 const fromSite=await page.request.post(previewUrl,{data:payload});
 expect(fromSite.status()).toBe(200);
 const preview=await fromSite.json();
 expect(preview).toMatchObject({
  canCommit:true,proposedSession:{workplaceId,studentIds:ids,title,lessonNote,durationMinutes:75},
  review:{writesPerformed:false,attendance:"unmarked"},
 });
 expect((await call("ccp_lessons_capture_preview",payload)).data).toEqual(preview);
 const list=async()=>{
  const sessions=await call("ccp_sessions_list",{workplaceId,query:title});
  expect(sessions.error).toBeUndefined();
  return sessions.data.filter((r:{title:string})=>r.title===title);
 };
 expect(await list()).toHaveLength(0);
 const create=await call("ccp_sessions_ad_hoc_create",{
  ...preview.proposedSession,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(create.error).toBeUndefined();
 const sessionId=create.data.id as string;
 const before=await call("ccp_sessions_details",{sessionId});
 expect(before.data).toMatchObject({status:"scheduled",lesson_note:lessonNote});
 const review=await call("ccp_attendance_preview",{sessionId});
 expect(review.error).toBeUndefined();
 const original=review.data.attendance as Array<{student_id:string;status:string;updated_at:string|null}>;
 expect(original.map(r=>r.student_id).sort()).toEqual([...ids].sort());
 expect(original.every(r=>r.status==="unmarked"&&r.updated_at===null)).toBe(true);
 const attendance=original.map(r=>({
  studentId:r.student_id,status:r.student_id===ids[0]?"present":r.student_id===ids[1]?"late":"absent",
  note:"",expectedUpdatedAt:r.updated_at,
 }));
 const completion={sessionId,expectedUpdatedAt:before.data.updated_at,
  confirmed:true,idempotencyKey:randomUUID(),lessonNote,attendance};
 const unconfirmed=await page.request.post("/api/agent/v1",{data:{
  action:"sessions.complete",...completion,confirmed:false,
 }});
 expect(unconfirmed.status()).toBe(400);
 expect((await call("ccp_sessions_complete",{...completion,confirmed:false})).error?.code).toBe("VALIDATION_ERROR");
 const readContext=await browser.newContext({baseURL:process.env.PLAYWRIGHT_BASE_URL??"http://localhost:3000"});
 try {
  const readOnly=await delegatedTool(await readContext.newPage(),request,"coach:read",isolatedTeacher);
  expect((await readOnly("ccp_sessions_details",{sessionId})).data).toEqual(before.data);
  expect((await readOnly.listTools()).some(t=>t.name==="ccp_sessions_complete")).toBe(false);
  expect((await readOnly("ccp_sessions_complete",completion)).error?.code).toBe("FORBIDDEN");
 } finally {await readContext.close();}
 expect((await call("ccp_sessions_details",{sessionId})).data).toEqual(before.data);
 expect((await call("ccp_attendance_preview",{sessionId})).data.attendance).toEqual(original);
 const accepted=await page.request.post("/api/agent/v1",{data:{action:"sessions.complete",...completion}});
 expect(accepted.status(),await accepted.text()).toBe(200);
 const receipt=(await accepted.json()).data;
 const replay=await call("ccp_sessions_complete",completion);
 expect(replay.error).toBeUndefined();
 expect(replay.data).toEqual(receipt);
 expect(await list()).toHaveLength(1);
 const finished=await call("ccp_sessions_details",{sessionId});
 expect(finished.data).toMatchObject({status:"completed",lesson_note:lessonNote,duration_minutes:75});
 const reportArgs={workplaceId,from:day,to:day,outputLocale:"en"};
 const reportUrl="/api/coaching/report?"+new URLSearchParams(reportArgs);
 const reportWeb=await page.request.get(reportUrl);
 expect(reportWeb.status()).toBe(200);
 const report=await reportWeb.json();
 expect(report).toMatchObject({
  report:{locale:"he",sessions:1,teachingMinutes:75,participants:3},
  presentation:{outputLocale:"en",direction:"ltr"},
 });
 expect(JSON.stringify(report)).not.toContain(lessonNote);
 expect((await call("ccp_reports_workplace_summary",{...reportArgs,format:"json"})).data).toEqual(report);
 const foreignContext=await browser.newContext({baseURL:process.env.PLAYWRIGHT_BASE_URL??"http://localhost:3000"});
 try {
  const otherPage=await foreignContext.newPage();
  const other=await delegatedTool(otherPage,request);
  expect((await other("ccp_sessions_details",{sessionId})).error?.code).toBe("NOT_FOUND");
  expect((await otherPage.request.get("/api/coaching/sessions/"+sessionId+"/roster")).status()).toBe(404);
 } finally {await foreignContext.close();}
 expect((await call("ccp_sessions_details",{sessionId})).data).toEqual(finished.data);
 expect((await call("ccp_attendance_preview",{sessionId})).data.attendance
  .map((r:{student_id:string;status:string})=>[r.student_id,r.status]).sort())
  .toEqual(attendance.map(r=>[r.studentId,r.status]).sort());
});
