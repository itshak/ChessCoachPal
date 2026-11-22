import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

const unique=(s:string)=>s+" "+randomUUID();
const teacherStudent=async(page:import("@playwright/test").Page,name:string)=>{
 const response=await page.request.post("/api/students",{data:{name}});
 expect(response.status(),await response.text()).toBe(201);
 return (await response.json()).id as string;
};
const profile=async(page:import("@playwright/test").Page,id:string)=>{
 const r=await page.request.get("/api/students/"+id);
 expect(r.status(),await r.text()).toBe(200);
 return await r.json() as {id:string;updated_at:string;archived_at:string|null};
};
type Tool=Awaited<ReturnType<typeof delegatedTool>>;
const makeWorkplace=async(call:Tool,zone="Asia/Jerusalem")=>{
 const result=await call("ccp_workplaces_create",{
  name:unique("Historic chess school"),timezone:zone,currency:"ILS",
  locale:"he",policy:{},idempotencyKey:randomUUID(),
 });
 expect(result.error).toBeUndefined();
 return (result.data as {entityId:string}).entityId;
};

test("PARITY:PARITY-history-bulk-atomic exact website/MCP preview, atomic receipt, reactivation",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const a=await teacherStudent(page,unique("Former archive A"));
 const b=await teacherStudent(page,unique("Former archive B"));
 const pa=await profile(page,a),pb=await profile(page,b);
 const rows=[{studentId:a,archived:true,expectedUpdatedAt:pa.updated_at},
  {studentId:b,archived:true,expectedUpdatedAt:pb.updated_at}];
 const sitePreview=await page.request.post("/api/students/bulk-lifecycle",{data:{rows}});
 expect(sitePreview.status(),await sitePreview.text()).toBe(200);
 const preview=await sitePreview.json();
 expect(preview.canCommit).toBe(true);
 expect(preview.activeStudentCountAfter).toBe(preview.activeStudentCountBefore-2);
 const model=await call("ccp_students_bulk_lifecycle_preview",{rows});
 expect(model.error).toBeUndefined();
 expect(model.data).toEqual(preview);
 const key=randomUUID();
 const applied=await call("ccp_students_bulk_lifecycle_commit",{
  rows,previewDigest:preview.previewDigest,idempotencyKey:key,confirmed:true,
 });
 expect(applied.error).toBeUndefined();
 expect((applied.data as {count:number}).count).toBe(2);
 expect((await profile(page,a)).archived_at).toBeTruthy();
 expect((await profile(page,b)).archived_at).toBeTruthy();
 const replay=await page.request.put("/api/students/bulk-lifecycle",{
  data:{rows,previewDigest:preview.previewDigest,idempotencyKey:key,confirmed:true},
 });
 expect(replay.status(),await replay.text()).toBe(200);
 expect((await replay.json()).replayed).toBe(true);
 const changed=await call("ccp_students_bulk_lifecycle_commit",{
  rows:[{...rows[0],archived:false},rows[1]],
  previewDigest:preview.previewDigest,idempotencyKey:key,confirmed:true,
 });
 expect(changed.error).toBeDefined();
 const newest=await profile(page,a);
 const activate=[{studentId:a,archived:false,expectedUpdatedAt:newest.updated_at}];
 const reactivatePreview=(await call("ccp_students_bulk_lifecycle_preview",{
  rows:activate,
 })).data as {canCommit:boolean;previewDigest:string};
 expect(reactivatePreview.canCommit).toBe(true);
 const reactivated=await page.request.put("/api/students/bulk-lifecycle",{
  data:{rows:activate,previewDigest:reactivatePreview.previewDigest,
    idempotencyKey:randomUUID(),confirmed:true},
 });
 expect(reactivated.status(),await reactivated.text()).toBe(200);
 expect((await profile(page,a)).archived_at).toBeNull();
 expect((await profile(page,b)).archived_at).toBeTruthy();
});

test("PARITY:PARITY-history-bulk-denials rejects current workplace, duplicates, stale revision, foreign ID",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const studentId=await teacherStudent(page,unique("Multi-school learner"));
 const workplaceId=await makeWorkplace(call);
 const enrolled=await call("ccp_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:randomUUID(),
 });
 expect(enrolled.error).toBeUndefined();
 const before=await profile(page,studentId);
 const rows=[{studentId,archived:true,expectedUpdatedAt:before.updated_at}];
 const preview=await page.request.post("/api/students/bulk-lifecycle",{data:{rows}});
 expect(preview.status(),await preview.text()).toBe(200);
 const check=await preview.json();
 expect(check.canCommit).toBe(false);
 expect(check.rows[0].blockers.currentWorkplaceEnrollments).toBeGreaterThan(0);
 const blocked=await call("ccp_students_bulk_lifecycle_commit",{
  rows,previewDigest:check.previewDigest,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(blocked.error?.code).toBe("BLOCKED");
 expect((await profile(page,studentId)).archived_at).toBeNull();
 const duplicate=await page.request.post("/api/students/bulk-lifecycle",{
  data:{rows:[...rows,...rows]},
 });
 expect(duplicate.status()).toBe(400);
 const foreign=await call("ccp_students_bulk_lifecycle_preview",{
  rows:[{studentId:randomUUID(),archived:true,
    expectedUpdatedAt:before.updated_at}],
 });
 expect(foreign.error?.code).toBe("NOT_FOUND");
 const noMembership=await call("ccp_workplaces_unenroll",{
  workplaceId,studentId,confirmed:true,
 });
 expect(noMembership.error).toBeUndefined();
 const ready=(await page.request.post("/api/students/bulk-lifecycle",{
  data:{rows},
 })).json();
 const prepared=await ready as {canCommit:boolean;previewDigest:string};
 expect(prepared.canCommit).toBe(true);
 const edited=await page.request.put("/api/students/"+studentId,{
  data:{level:"Synthetic revision"},
 });
 expect(edited.status(),await edited.text()).toBe(200);
 const stale=await page.request.put("/api/students/bulk-lifecycle",{
  data:{rows,previewDigest:prepared.previewDigest,
   idempotencyKey:randomUUID(),confirmed:true},
 });
 expect(stale.status()).toBe(409);
 expect((await profile(page,studentId)).archived_at).toBeNull();
});

test("PARITY:PARITY-history-staged-aggregate staged two-year multi-workplace dated and aggregate evidence",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const name=unique("History pupil");
 const studentId=await teacherStudent(page,name);
 const workplaceA=await makeWorkplace(call),workplaceB=await makeWorkplace(call);
 const known=(await call("ccp_workplaces_list",{})).data as Array<{id:string;name:string}>;
 const aName=known.find(x=>x.id===workplaceA)!.name;
 const bName=known.find(x=>x.id===workplaceB)!.name;
 const csv=[
  "Student Name,Workplace,Date,Attendance,Period Start,Period End,Lesson Count",
  [name,aName,"2024-10-12","present","","",""].join(","),
  [name,aName,"","present","2025-01-01","2025-06-20","12"].join(","),
  [name,bName,"2026-02-14","late","","",""].join(","),
 ].join("\n")+"\n";
 const stage=await page.request.post("/api/import/historical/stage",{
  multipart:{file:{name:"two-years-chess-history.csv",mimeType:"text/csv",
    buffer:Buffer.from(csv)}},
 });
 expect(stage.status(),await stage.text()).toBe(200);
 const staged=await stage.json() as {stageId:string;rowCount:number;sha256:string};
 expect(staged.rowCount).toBe(3);
 const info=await call("ccp_historical_import_stage_info",{stageId:staged.stageId});
 expect(info.error).toBeUndefined();
 expect((info.data as {sha256:string}).sha256).toBe(staged.sha256);
 const input={stageId:staged.stageId,schoolYearStart:"2024-09-01",
  schoolYearEnd:"2026-08-31",timezone:"Asia/Jerusalem"};
 const site=await page.request.post("/api/import/historical/preview",{data:input});
 expect(site.status(),await site.text()).toBe(200);
 const preview=await site.json();
 expect(preview.canCommit).toBe(true);
 expect(preview.previewTotal).toBe(3);
 expect(preview.previewRows.map((r:{mode:string})=>r.mode))
  .toEqual(["dated","aggregate","dated"]);
 const model=await call("ccp_historical_attendance_preview",input);
 expect(model.error).toBeUndefined();
 expect(model.data).toEqual(preview);
 const key=randomUUID();
 const committed=await call("ccp_historical_attendance_commit",{
  ...input,previewDigest:preview.previewDigest,idempotencyKey:key,confirmed:true,
 });
 expect(committed.error).toBeUndefined();
 expect((committed.data as {count:number}).count).toBe(3);
 const replay=await page.request.post("/api/import/historical/commit",{
  data:{...input,previewDigest:preview.previewDigest,idempotencyKey:key,confirmed:true},
 });
 expect(replay.status(),await replay.text()).toBe(200);
 expect((await replay.json()).replayed).toBe(true);
 // The second source row duplicates saved evidence. The first source row
 // is new but MUST roll back too; the batch never commits halfway.
 const atomicRollback={
  schoolYearStart:"2024-09-01",schoolYearEnd:"2026-08-31",
  timezone:"Asia/Jerusalem",
  rows:[
   {"Student Name":name,Workplace:aName,Date:"2024-11-20",Attendance:"present"},
   {"Student Name":name,Workplace:aName,Date:"2024-10-12",Attendance:"present"},
  ],
 };
 const rollbackPreviewResponse=await page.request.post(
  "/api/import/historical/preview",{data:atomicRollback});
 expect(rollbackPreviewResponse.status(),await rollbackPreviewResponse.text()).toBe(200);
 const rollbackPreview=await rollbackPreviewResponse.json();
 expect(rollbackPreview.canCommit).toBe(true);
 const rejected=await call("ccp_historical_attendance_commit",{
  ...atomicRollback,previewDigest:rollbackPreview.previewDigest,
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(rejected.error?.code).toBe("CONFLICT");
 const webReport=await page.request.get("/api/import/historical/report?studentId="+studentId);
 expect(webReport.status(),await webReport.text()).toBe(200);
 const report=await webReport.json();
 expect(report.totalRows).toBe(3);
 const toolReport=await call("ccp_historical_attendance_report",{studentId});
 expect(toolReport.error).toBeUndefined();
 expect(toolReport.data).toEqual(report);
 const totals=await page.request.get(
  "/api/import/historical/report?summary=true&studentId="+studentId);
 expect(totals.status()).toBe(200);
 const summary=await totals.json();
 expect(summary).toMatchObject({datedObservations:2,aggregateSourceRows:1,
  aggregateDeclaredLessons:12,workplacesRepresented:2,notCalendarSessions:true});
 expect((await call("ccp_historical_attendance_summary",{studentId})).data)
  .toEqual(summary);
 const progress=await call("ccp_reports_student_progress",{studentId});
 expect(progress.error).toBeUndefined();
 expect((progress.data as {historicalAttendance:unknown}).historicalAttendance).toEqual(summary);
 // Portable backups must carry the source-precise rows and only allow
 // immutable, same-owner restore. Browser apply and MCP replay share receipt.
 const exportResponse=await page.request.get("/api/settings/export");
 expect(exportResponse.status(),await exportResponse.text()).toBe(200);
 const exported=await exportResponse.json();
 const exportedHistory=(exported.tables.ccp_historical_attendance_evidence as
  Array<{id:string;student_id:string}>)
  .filter(r=>r.student_id===studentId);
 expect(exportedHistory).toHaveLength(3);
 const historyPayload={teacherId:exported.teacherId,
  exportedAt:new Date().toISOString(),
  tables:{ccp_historical_attendance_evidence:exportedHistory}};
 const backupPreviewResponse=await page.request.put("/api/settings/import",{
  data:{payload:historyPayload},
 });
 expect(backupPreviewResponse.status(),await backupPreviewResponse.text()).toBe(200);
 const backupDigest=(await backupPreviewResponse.json()).sha256 as string;
 const restored=await page.request.post("/api/settings/import",{
  data:{payload:historyPayload,expectedSha256:backupDigest,confirmed:true},
 });
 expect(restored.status(),await restored.text()).toBe(200);
 expect((await restored.json()).counts.ccp_historical_attendance_evidence).toBe(3);
 const restoredReplay=await call("ccp_settings_import_apply",{
  payload:historyPayload,expectedSha256:backupDigest,confirmed:true,
 });
 expect(restoredReplay.error).toBeUndefined();
 expect((restoredReplay.data as {counts:Record<string,number>}).counts
  .ccp_historical_attendance_evidence).toBe(3);
 expect(report.records.map((r:{mode:string})=>r.mode).sort())
  .toEqual(["aggregate","dated","dated"]);
 const removed=await call("ccp_historical_import_stage_delete",{
  stageId:staged.stageId,confirmed:true,
 });
 expect(removed.error).toBeUndefined();
 const after=await page.request.get("/api/import/historical/stage?stageId="+staged.stageId);
 expect(after.status()).toBe(404);
 expect((await page.request.get(
  "/api/import/historical/report?summary=true&studentId="+studentId)).status()).toBe(200);
 // Private staging metadata is only valid for its two-hour lifetime.
 const reupload=await page.request.post("/api/import/historical/stage",{
  multipart:{file:{name:"expired-historical-source.csv",mimeType:"text/csv",
    buffer:Buffer.from(csv)}},
 });
 expect(reupload.status(),await reupload.text()).toBe(200);
 const expiredStage=(await reupload.json()).stageId as string;
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.SUPABASE_SERVICE_ROLE_KEY!,
   {auth:{persistSession:false,autoRefreshToken:false}});
 const now=Date.now();
 const {error:expireError}=await admin.from("ccp_historical_import_stages")
  .update({created_at:new Date(now-4*60*60_000).toISOString(),
   expires_at:new Date(now-3*60*60_000).toISOString()})
  .eq("id",expiredStage);
 expect(expireError).toBeNull();
 const expiredModel=await call("ccp_historical_import_stage_info",{
  stageId:expiredStage,
 });
 expect(expiredModel.error?.code).toBe("STAGE_EXPIRED");
 const expiredWebsite=await page.request.get(
  "/api/import/historical/stage?stageId="+expiredStage);
 expect(expiredWebsite.status()).toBe(410);
 const expiredRemoved=await call("ccp_historical_import_stage_delete",{
  stageId:expiredStage,confirmed:true,
 });
 expect(expiredRemoved.error).toBeUndefined();
});

test("PARITY:PARITY-history-ambiguous-source rejects unknown dates, aliases and duplicate source",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const name=unique("Historical duplicate name");
 const student=await teacherStudent(page,name);
 const second=await teacherStudent(page,unique("Another historic child"));
 const alias=unique("Ambiguous alias");
 for(const id of [student,second]){
  const updated=await page.request.put("/api/students/"+id,{
   data:{nameAliases:[alias]},
  });
  expect(updated.status(),await updated.text()).toBe(200);
 }
 const workplaceId=await makeWorkplace(call);
 const own=(await call("ccp_workplaces_list",{})).data as Array<{id:string;name:string}>;
 const workplace=own.find(x=>x.id===workplaceId)!.name;
 const range={schoolYearStart:"2024-09-01",schoolYearEnd:"2026-08-31",
  timezone:"Asia/Jerusalem"};
 const direct={
  ...range,
  rows:[{"Student Name":alias,Workplace:workplace,
   Date:"2025-10-13",Attendance:"present"}],
 };
 const ambiguous=await page.request.post("/api/import/historical/preview",{data:direct});
 expect(ambiguous.status(),await ambiguous.text()).toBe(200);
 const result=await ambiguous.json();
 expect(result.canCommit).toBe(false);
 expect(result.issues.some((i:{code:string})=>i.code==="AMBIGUOUS_STUDENT")).toBe(true);
 const mcp=await call("ccp_historical_attendance_preview",direct);
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(result);
 const noDate={...range,rows:[{"Student Name":name,Workplace:workplace,
  Date:"",Attendance:"present"}]};
 const incomplete=await page.request.post("/api/import/historical/preview",{data:noDate});
 expect(incomplete.status()).toBe(200);
 expect((await incomplete.json()).issues.some((i:{code:string})=>
  i.code==="MISSING_DATE_PRECISION")).toBe(true);
 const duplicated={...range,rows:[
  {"Student Name":name,Workplace:workplace,Date:"2025-11-11",Attendance:"present"},
  {"Student Name":name,Workplace:workplace,Date:"2025-11-11",Attendance:"present"},
 ]};
 const dupe=await page.request.post("/api/import/historical/preview",{data:duplicated});
 expect(dupe.status()).toBe(200);
 expect((await dupe.json()).issues.some((i:{code:string})=>
  i.code==="DUPLICATE_EVIDENCE")).toBe(true);
 const handoff=await call("ccp_historical_import_upload_handoff",{});
 expect(handoff.error).toBeUndefined();
 expect((handoff.data as {uploadUrl:string}).uploadUrl).toContain("/account");
});

test("PARITY:PARITY-history-foreign-owner denies foreign tenant student in reviewed import",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const workplaceId=await makeWorkplace(call);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {auth:{persistSession:false,autoRefreshToken:false}});
 const email="history-foreign-"+randomUUID()+"@example.com";
 const {data:user,error:authError}=await admin.auth.admin.createUser({
  email,password:"SyntheticPassword-123!",email_confirm:true,
 });
 expect(authError).toBeNull();
 const {error:teacherError}=await admin.from("teachers").insert({
  id:user.user!.id,email,display_name:"Foreign history owner",
 });
 expect(teacherError).toBeNull();
 const {data:foreign,error:studentError}=await admin.from("students").insert({
  teacher_id:user.user!.id,name:unique("Other teacher pupil"),
 }).select("id").single();
 expect(studentError).toBeNull();
 const body={schoolYearStart:"2025-09-01",schoolYearEnd:"2026-06-01",
  timezone:"Asia/Jerusalem",rows:[{
   "Student ID":foreign!.id,"Workplace ID":workplaceId,
   "Date":"2025-10-15","Attendance":"present",
  }]};
 const web=await page.request.post("/api/import/historical/preview",{data:body});
 expect(web.status(),await web.text()).toBe(200);
 expect((await web.json()).canCommit).toBe(false);
 const tool=await call("ccp_historical_attendance_preview",body);
 expect(tool.error).toBeUndefined();
 expect((tool.data as {canCommit:boolean}).canCommit).toBe(false);
 const {error:cleanupError}=await admin.auth.admin.deleteUser(user.user!.id);
 expect(cleanupError).toBeNull();
});

test("PARITY:PARITY-history-hosted-cap archived former students do not consume cap; batch reactivation fails atomically",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const ids:string[]=[];
 for(let i=0;i<2;i++){
  const res=await page.request.post("/api/students",{
   data:{name:unique("Quota-exempt former student"),archived:true},
  });
  expect(res.status(),await res.text()).toBe(201);
  const row=await res.json();
  expect(row.archived_at).toBeTruthy();
  ids.push(row.id as string);
 }
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.SUPABASE_SERVICE_ROLE_KEY!,
   {auth:{persistSession:false,autoRefreshToken:false}});
 const {data:pupil,error:pupilError}=await admin.from("students")
   .select("teacher_id").eq("id",ids[0]).single();
 expect(pupilError).toBeNull();
 const teacherId=pupil!.teacher_id as string;
 const {data:original,error:profileError}=await admin.from("teacher_entitlement_state")
  .select("active_student_count").eq("teacher_id",teacherId).single();
 expect(profileError).toBeNull();
 const limit=Math.max(1,original!.active_student_count as number);
 const capped=await configureSyntheticStudentCapacity(admin,teacherId,limit);
 try{
  // Creating another already archived former pupil when the active roster
  // is exactly at capacity must not be denied or count as an active pupil.
  const extraArchived=await page.request.post("/api/students",{
   data:{name:unique("Imported former pupil while already at cap"),
    archived:true},
  });
  expect(extraArchived.status(),await extraArchived.text()).toBe(201);
  expect((await extraArchived.json()).archived_at).toBeTruthy();
  const {data:afterCreate,error:afterCreateError}=await admin.from("teacher_entitlement_state")
   .select("active_student_count").eq("teacher_id",teacherId).single();
  expect(afterCreateError).toBeNull();
  expect(afterCreate!.active_student_count).toBe(original!.active_student_count);
  const rows=await Promise.all(ids.map(async studentId=>({
   studentId,archived:false,expectedUpdatedAt:(await profile(page,studentId)).updated_at,
  })));
  const previewRes=await page.request.post("/api/students/bulk-lifecycle",{data:{rows}});
  expect(previewRes.status(),await previewRes.text()).toBe(200);
  const preview=await previewRes.json();
  expect(preview.canCommit).toBe(false);
  expect(preview.quotaBlocked).toBe(true);
  const toolPreview=await call("ccp_students_bulk_lifecycle_preview",{rows});
  expect(toolPreview.error).toBeUndefined();
  expect(toolPreview.data).toEqual(preview);
  const denied=await call("ccp_students_bulk_lifecycle_commit",{
   rows,previewDigest:preview.previewDigest,idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(denied.error?.code).toBe("CAPACITY_EXCEEDED");
  for(const id of ids)expect((await profile(page,id)).archived_at).toBeTruthy();
 }finally{
  await capped.restore();
 }
});

test("PARITY:PARITY-history-dates-cross-client exact student/date import for archived learner, preview and receipt",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const studentName=unique("Archived dated source learner");
 const studentId=await teacherStudent(page,studentName);
 const workplaceId=await makeWorkplace(call);
 // Historical records may refer to pupils no longer counted as active.
 const current=await profile(page,studentId);
 const archiveRows=[{studentId,archived:true,expectedUpdatedAt:current.updated_at}];
 const archPreview=(await call("ccp_students_bulk_lifecycle_preview",{rows:archiveRows})).data as
   {canCommit:boolean;previewDigest:string};
 expect(archPreview.canCommit).toBe(true);
 const archived=await call("ccp_students_bulk_lifecycle_commit",{
   rows:archiveRows,previewDigest:archPreview.previewDigest,
   idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(archived.error).toBeUndefined();
 expect((await profile(page,studentId)).archived_at).toBeTruthy();
 const dates={workplaceId,schoolYearStart:"2025-09-01",schoolYearEnd:"2026-08-31",
  timezone:"Asia/Jerusalem",sourceLabel:"Verified dated lesson register",
  students:[{studentName,studentId,attendanceDates:["2025-11-03","2026-01-05"]}]};
 const sitePreview=await page.request.post("/api/import/historical/dates",{data:dates});
 expect(sitePreview.status(),await sitePreview.text()).toBe(200);
 const preview=await sitePreview.json();
 expect(preview).toMatchObject({format:"student-date-lists",sourceRows:2,
  previewTotal:2,issueCount:0,canCommit:true});
 expect(preview.previewRows.map((r:{attendedOn:string})=>r.attendedOn))
   .toEqual(["2025-11-03","2026-01-05"]);
 const mcp=await call("ccp_historical_attendance_dates_preview",dates);
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(preview);
 const key=randomUUID();
 const commit=await call("ccp_historical_attendance_dates_commit",{
  ...dates,previewDigest:preview.previewDigest,idempotencyKey:key,confirmed:true,
 });
 expect(commit.error).toBeUndefined();
 expect(commit.data).toMatchObject({count:2,replayed:false});
 const replay=await page.request.put("/api/import/historical/dates",{
  data:{...dates,previewDigest:preview.previewDigest,idempotencyKey:key,confirmed:true},
 });
 expect(replay.status(),await replay.text()).toBe(200);
 expect((await replay.json()).replayed).toBe(true);
 const summary=(await call("ccp_historical_attendance_summary",{studentId,workplaceId})).data;
 expect(summary).toMatchObject({datedObservations:2,aggregateDeclaredLessons:0});
 const duplicate=await call("ccp_historical_attendance_dates_preview",{
  ...dates,students:[{studentName,studentId,attendanceDates:["2026-01-05","2026-01-05"]}],
 });
 expect(duplicate.error).toBeUndefined();
 expect(duplicate.data.canCommit).toBe(false);
 expect(duplicate.data.issues).toEqual(expect.arrayContaining([
  expect.objectContaining({code:"DUPLICATE_EVIDENCE"})]));
 const noGuess=await call("ccp_historical_attendance_dates_preview",{
  ...dates,students:[{studentName,attendanceDates:["05.01.2026"]}],
 });
 expect(noGuess.error?.code).toBe("VALIDATION_ERROR");
});

test("PARITY:PARITY-history-large-mcp-request accepts bounded >32KiB dated observations",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const workplaceId=await makeWorkplace(call);
 // The old RPC body cap (32 KiB) silently contradicted the historical
 // tool's advertised 250 rows/256 KiB. Validate actual OAuth MCP transport.
 const students=Array.from({length:200},(_,i)=>({
  studentName:`Unknown test pupil ${i} `+"x".repeat(190),
  attendanceDates:["2026-01-05"],
 }));
 const payload={workplaceId,schoolYearStart:"2025-09-01",
  schoolYearEnd:"2026-08-31",timezone:"Asia/Jerusalem",students};
 expect(Buffer.byteLength(JSON.stringify({jsonrpc:"2.0",method:"tools/call",
  params:{name:"ccp_historical_attendance_dates_preview",arguments:payload}})))
   .toBeGreaterThan(32_768);
 const result=await call("ccp_historical_attendance_dates_preview",payload);
 expect(result.error).toBeUndefined();
 expect(result.data).toMatchObject({sourceRows:200,previewTotal:0,canCommit:false});
 expect(result.data.issueCount).toBe(200);
 const website=await page.request.post("/api/import/historical/dates",{data:payload});
 expect(website.status(),await website.text()).toBe(200);
 expect(await website.json()).toEqual(result.data);
});

test("PARITY:PARITY-history-import-form shows actual workplace choices and recovers independently from roster failures",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const studentId=await teacherStudent(page,unique("Historic import UI student"));
 const workplaceId=await makeWorkplace(call);
 const panel=page.locator("#historical-attendance-import");
 const quick=panel.locator("section[aria-label]");
 const workplace=quick.locator("select").first();
 const student=quick.locator("select").nth(1);
 const retry=panel.getByTestId("history-import-retry-choices");

 // Regression: the same-origin website POST must work with an explicit Origin
 // while cross-origin cookie requests remain forbidden. Coolify publishes
 // NEXT_PUBLIC_SITE_URL, which the server must prefer to its internal URL.
 await page.goto("/account");
 const origin=new URL(page.url()).origin;
 const allowed=await page.request.post("/api/agent/v1",{
  headers:{Origin:origin},data:{action:"workplaces.list"},
 });
 expect(allowed.status(),await allowed.text()).toBe(200);
 expect((await allowed.json()).data).toEqual(
  expect.arrayContaining([expect.objectContaining({id:workplaceId})]));
 const crossSite=await page.request.post("/api/agent/v1",{
  headers:{Origin:"https://malicious.example"},data:{action:"workplaces.list"},
 });
 expect(crossSite.status()).toBe(403);

 // A student roster outage must NOT empty the already valid workplace list.
 const studentsRoute="**/api/students?includeArchived=true&limit=1000";
 await page.route(studentsRoute,route=>route.fulfill({
  status:503,contentType:"application/json",
  body:JSON.stringify({error:"Synthetic student roster outage"}),
 }));
 await page.goto("/account");
 await expect(workplace.locator(`option[value="${workplaceId}"]`)).toHaveCount(1);
 await expect(student.locator(`option[value="${studentId}"]`)).toHaveCount(0);
 await expect(panel.getByRole("alert")).toHaveCount(1);
 await page.unroute(studentsRoute);
 await retry.click();
 await expect(student.locator(`option[value="${studentId}"]`)).toHaveCount(1);
 await expect(panel.getByRole("alert")).toHaveCount(0);

 // A workplace roster outage must show an error and keep student choices.
 const workplacesRoute="**/api/agent/v1";
 await page.route(workplacesRoute,async route=>{
  const body=route.request().postDataJSON() as {action?:string}|null;
  if(route.request().method()==="POST"&&body?.action==="workplaces.list"){
   await route.fulfill({status:503,contentType:"application/json",
    body:JSON.stringify({error:{code:"DATABASE_ERROR",message:"Synthetic workplace outage"}})});
  }else await route.continue();
 });
 await page.reload();
 await expect(student.locator(`option[value="${studentId}"]`)).toHaveCount(1);
 await expect(workplace.locator(`option[value="${workplaceId}"]`)).toHaveCount(0);
 await expect(panel.getByRole("alert")).toHaveCount(1);
 await page.unroute(workplacesRoute);
 await retry.click();
 await expect(workplace.locator(`option[value="${workplaceId}"]`)).toHaveCount(1);
 await expect(panel.getByRole("alert")).toHaveCount(0);
 await workplace.selectOption(workplaceId);
 await expect(workplace).toHaveValue(workplaceId);
});
