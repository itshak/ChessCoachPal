import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {isolatedTeacherTest} from "./helpers/isolated-teacher";

isolatedTeacherTest("PARITY: Hebrew and Russian historical files only commit reviewed canonical attendance",async({
 page,request,isolatedTeacher,
})=>{
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const tag=randomUUID().slice(0,8),name="שושנה לוי "+tag,alias="Шошана "+tag,school="מועדון "+tag;
 const workplace=await call("ccp_workplaces_create",{
  name:school,timezone:"Asia/Jerusalem",currency:"ILS",locale:"he",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 const learner=await call("ccp_students_create",{name,idempotencyKey:randomUUID()});
 expect(learner.error).toBeUndefined();
 const studentId=learner.data.entityId as string;
 expect((await page.request.put("/api/students/"+studentId,{data:{nameAliases:[alias]}})).status()).toBe(200);
 const report=async()=>{
  const path="/api/import/historical/report?"+new URLSearchParams({studentId,workplaceId});
  const web=await page.request.get(path);
  expect(web.status()).toBe(200);
  const json=await web.json();
  const typed=await call("ccp_historical_attendance_report",{studentId,workplaceId});
  expect(typed.error).toBeUndefined();
  expect(typed.data).toEqual(json);
  return json;
 };
 const range={schoolYearStart:"2024-09-01",schoolYearEnd:"2025-08-31",timezone:"Asia/Jerusalem"};
 const previewPath="/api/import/historical/preview",commitPath="/api/import/historical/commit";
 const preview=async(data:Record<string,unknown>)=>{
  const web=await page.request.post(previewPath,{data});
  expect(web.status(),await web.text()).toBe(200);
  const result=await web.json();
  const mcp=await call("ccp_historical_attendance_preview",data);
  expect(mcp.error).toBeUndefined();
  expect(mcp.data).toEqual(result);
  return result;
 };
 const stagedPath="/api/import/historical/stage";
 const csv=["שם תלמיד,בית ספר,תאריך שיעור,נוכחות",name+","+school+",2024-11-05,איחרה"].join("\n");
 const staged=await page.request.post(stagedPath,{multipart:{file:{
  name:"he-historical-attendance.csv",mimeType:"text/csv",buffer:Buffer.from("\uFEFF"+csv),
 }}});
 expect(staged.status(),await staged.text()).toBe(200);
 const {stageId}=await staged.json();
 try{
  const heInput={...range,stageId};
  const he=await preview(heInput);
  expect(he).toMatchObject({canCommit:true,issueCount:0,previewRows:[{
   studentId,workplaceId,mode:"dated",attendedOn:"2024-11-05",attendanceStatus:"late",
   lessonCount:1,sourceTimezone:"Asia/Jerusalem",
  }]});
  const russian={"Имя ученика":alias,"Школа":school,"Начало периода":"2025-01-01",
    "Конец периода":"2025-05-30","Посещаемость":"ПРИСУТСТВОВАЛА","Количество занятий":"6",
    "Тип записи":"За период","Метка источника":"Архив",Attendance:"absent"};
  const raw={...range,rows:[russian]};
  const ambiguous=await page.request.post(previewPath,{data:raw});
  expect(ambiguous.status()).toBe(400);
  expect(await ambiguous.json()).toMatchObject({code:"INVALID_MAPPING",error:expect.stringContaining("mapping.attendanceStatus")});
  expect((await call("ccp_historical_attendance_preview",raw)).error).toMatchObject({
   code:"INVALID_MAPPING",message:expect.stringContaining("mapping.attendanceStatus"),
  });
  const badInput={...raw,mapping:{attendanceStatus:"Посещаемость"},
   rows:[{...russian,"Посещаемость":"да"}]};
  const bad=await preview(badInput);
  expect(bad).toMatchObject({canCommit:false,issues:[{code:"UNKNOWN_ATTENDANCE"}]});
  expect((await report()).records).toEqual([]);
  const reviewed={...raw,mapping:{attendanceStatus:"Посещаемость"}};
  const ru=await preview(reviewed);
  expect(ru).toMatchObject({canCommit:true,mapping:{attendanceStatus:"Посещаемость"},previewRows:[{
   studentId,workplaceId,mode:"aggregate",attendedOn:null,periodStart:"2025-01-01",
   periodEnd:"2025-05-30",attendanceStatus:"present",lessonCount:6,sourceLabel:"Архив",
  }]});
  const heCommit={...heInput,previewDigest:he.previewDigest,idempotencyKey:randomUUID(),confirmed:true};
  expect((await call("ccp_historical_attendance_commit",heCommit)).error).toBeUndefined();
  const heReplay=await page.request.post(commitPath,{data:heCommit});
  expect(heReplay.status()).toBe(200);
  expect(await heReplay.json()).toMatchObject({replayed:true,count:1});
  const ruCommit={...reviewed,previewDigest:ru.previewDigest,idempotencyKey:randomUUID(),confirmed:true};
  const ruWrite=await page.request.post(commitPath,{data:ruCommit});
  expect(ruWrite.status(),await ruWrite.text()).toBe(200);
  expect((await call("ccp_historical_attendance_commit",ruCommit)).data).toMatchObject({replayed:true,count:1});
 } finally {
  expect((await page.request.delete(stagedPath,{data:{stageId}})).status()).toBe(200);
 }
 const result=await report();
 expect(result.records).toHaveLength(2);
 expect(result.records).toEqual(expect.arrayContaining([
  expect.objectContaining({student_id:studentId,workplace_id:workplaceId,mode:"dated",attendance_status:"late"}),
  expect.objectContaining({student_id:studentId,workplace_id:workplaceId,mode:"aggregate",attendance_status:"present",lesson_count:6}),
 ]));
 expect((await call("ccp_sessions_list",{workplaceId})).data).toEqual([]);
 expect((await page.request.get("/api/students/"+studentId).then(r=>r.json())).name).toBe(name);
});
