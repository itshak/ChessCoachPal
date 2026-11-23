import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: reviewed sheet and ten exact attendance dates distinguish current and historical workplace relationships",async({page,request,browser,baseURL})=>{
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 async function teacher(label:string){
  const email="import-history-"+randomUUID()+"@example.com",password="SyntheticImportAndHistory-123!";
  const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(identity.error).toBeNull();
  const id=identity.data.user!.id;
  expect((await admin.from("teachers").insert({id,email,display_name:label,
   onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  return {id,email,password};
 }
 const owner=await teacher("Current and historical workplace fixture");
 let other:Awaited<ReturnType<typeof teacher>>|undefined;
 try{
  other=await teacher("Different workplace read tenant");
  const foreign=await admin.from("students").insert({teacher_id:other.id,name:"Other owned synthetic name"})
   .select("id").single();
  expect(foreign.error).toBeNull();
  const sites=await admin.from("workplaces").insert([
   {teacher_id:owner.id,name:"Current coaching roster"},
   {teacher_id:owner.id,name:"Historical source only"},
  ]).select("id,name").order("name");
  expect(sites.error).toBeNull();
  const [current,history]=sites.data!;
  const call=await delegatedTool(page,request,undefined,{email:owner.email,password:owner.password});
  expect((await call.listTools()).map(x=>x.name)).toContain("ccp_students_workplaces");
  const currentName="Current reviewed learner "+randomUUID(),archivedName="Historical archived learner "+randomUUID();
  const rows=[{"Student Name":currentName,Archived:"false"},{"Student Name":archivedName,Archived:"true"}];
  const sheet={rows,mapping:{student_name:"Student Name",archived:"Archived"},workplaceId:current.id};
  const preview=await call("ccp_import_spreadsheet_preview",sheet);
  expect(preview.error).toBeUndefined();
  expect(preview.data).toMatchObject({writesPerformed:false,identities:[
   expect.objectContaining({mode:"create",enrollmentRequested:true}),
   expect.objectContaining({mode:"createArchived",enrollmentRequested:false}),
  ]});
  const body={...sheet,reviewDigest:preview.data.reviewDigest,reviewedEnvelope:preview.data.reviewedEnvelope,
   confirmed:true,idempotencyKey:randomUUID()};
  const webCommit=await page.request.post("/api/import/spreadsheet/commit",{data:body});
  expect(webCommit.status(),await webCommit.text()).toBe(200);
  const receipt=await webCommit.json();
  expect(receipt).toMatchObject({studentsCreated:2,enrollmentsCreated:1});
  expect((await call("ccp_import_spreadsheet_commit",body)).data).toEqual(receipt);
  const active=(await call("ccp_students_roster",{query:currentName,workplaceId:current.id})).data.students;
  const archived=(await call("ccp_students_roster",{query:archivedName,archivedOnly:true})).data.students;
  expect(active).toHaveLength(1);expect(archived).toHaveLength(1);
  const dateList=Array.from({length:10},(_,i)=>"2025-10-"+String(i+1).padStart(2,"0"));
  const dated={workplaceId:history.id,schoolYearStart:"2025-09-01",schoolYearEnd:"2026-08-31",
   timezone:"UTC",sourceLabel:"Twenty approved attendance dates from register",
   students:[{studentId:active[0].id,studentName:currentName,attendanceDates:dateList},
    {studentId:archived[0].id,studentName:archivedName,attendanceDates:dateList}]};
  const historicalPreview=await page.request.post("/api/import/historical/dates",{data:dated});
  expect(historicalPreview.status(),await historicalPreview.text()).toBe(200);
  const reviewed=await historicalPreview.json();
  expect(reviewed).toMatchObject({format:"student-date-lists",sourceRows:20,previewTotal:20,canCommit:true,issueCount:0});
  expect((await call("ccp_historical_attendance_dates_preview",dated)).data).toEqual(reviewed);
  const historicalCommit={...dated,previewDigest:reviewed.previewDigest,idempotencyKey:randomUUID(),confirmed:true};
  const written=await call("ccp_historical_attendance_dates_commit",historicalCommit);
  expect(written.error).toBeUndefined();expect(written.data).toMatchObject({count:20,replayed:false});
  const replay=await page.request.put("/api/import/historical/dates",{data:historicalCommit});
  expect(replay.status(),await replay.text()).toBe(200);
  expect(await replay.json()).toMatchObject({count:20,replayed:true});
  for(const [studentId,isArchived] of [[active[0].id,false],[archived[0].id,true]] as [string,boolean][]){
   const reverse=await call("ccp_students_workplaces",{studentId});
   expect(reverse.error).toBeUndefined();
   const read=await page.request.get("/api/students/"+studentId+"/workplaces");
   expect(read.status(),await read.text()).toBe(200);
   expect(await read.json()).toEqual(reverse.data);
   const row=reverse.data;
   expect(row).toMatchObject({studentArchived:isArchived,currentWorkplaceIds:isArchived?[]:[current.id]});
   expect(row.workplaces).toHaveLength(isArchived?1:2);
   expect(row.workplaces).toContainEqual(expect.objectContaining({workplaceId:history.id,hasCurrentEnrollment:false,
    hasHistoricalEvidence:true,historicalWithoutCurrentEnrollment:true,currentPeriods:[]}));
   if(!isArchived)expect(row.workplaces).toContainEqual(expect.objectContaining({workplaceId:current.id,
    hasCurrentEnrollment:true,hasHistoricalEvidence:false,historicalWithoutCurrentEnrollment:false}));
   expect(JSON.stringify(row)).not.toMatch(/creditPackages|teacher_notes|source_label|guardian|contact|email|invoice/);
   const summary=(await call("ccp_historical_attendance_summary",{studentId,workplaceId:history.id})).data;
   expect(summary).toMatchObject({datedObservations:10,aggregateDeclaredLessons:0,notCalendarSessions:true});
  }
  const foreignSite=await page.request.get("/api/students/"+foreign.data!.id+"/workplaces");
  expect(foreignSite.status()).toBe(404);expect((await foreignSite.json()).code).toBe("NOT_FOUND");
  expect((await call("ccp_students_workplaces",{studentId:foreign.data!.id})).error?.code).toBe("NOT_FOUND");
  const anonymous=await browser.newContext({baseURL});
  try{expect((await anonymous.request.get("/api/students/"+active[0].id+"/workplaces")).status()).toBe(401);}
  finally{await anonymous.close();}
  for(const [table,count] of [["students",2],["workplace_enrollments",1],
   ["ccp_historical_attendance_evidence",20],["teaching_sessions",0],["session_attendance",0],["credit_packages",0]] as const){
   const actual=await admin.from(table).select("*",{head:true,count:"exact"}).eq("teacher_id",owner.id);
   expect(actual.error).toBeNull();expect(actual.count,table).toBe(count);
  }
 }finally{
  if(other)expect((await admin.auth.admin.deleteUser(other.id)).error).toBeNull();
  expect((await admin.auth.admin.deleteUser(owner.id)).error).toBeNull();
 }
});
