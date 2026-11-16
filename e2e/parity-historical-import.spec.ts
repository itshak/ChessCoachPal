import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";

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

test("PARITY:PARITY-students-bulk-lifecycle exact website/MCP preview, atomic receipt, reactivation",async({page,request})=>{
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

test("PARITY:PARITY-students-bulk-lifecycle rejects current workplace, duplicates, stale revision, foreign ID",async({page,request})=>{
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

test("PARITY:PARITY-historical-import staged two-year multi-workplace dated and aggregate evidence",async({page,request})=>{
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
});

test("PARITY:PARITY-historical-import rejects unknown dates, aliases and duplicate source",async({page,request})=>{
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

test("PARITY:PARITY-historical-evidence denies foreign tenant student in reviewed import",async({page,request})=>{
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
