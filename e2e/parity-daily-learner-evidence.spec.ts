import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-daily-learner-evidence separates completed and imported evidence after archive",async({page,request,browser})=>{
 test.setTimeout(150_000);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 expect(["localhost","127.0.0.1","[::1]"]).toContain(new URL(url).hostname);
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const users:string[]=[];
 const password="SyntheticLearnerEvidence4!";
 async function tenant(){
  const email="learner-evidence-"+randomUUID()+"@example.invalid";
  const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(identity.error).toBeNull();
  const id=identity.data.user!.id;
  users.push(id);
  expect((await admin.from("teachers").insert({id,email,display_name:"Learner evidence fixture",
   preferred_locale:"en",onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,id,8,4);
  return {id,email};
 }
 async function row(table:string,value:Record<string,unknown>){
  const r=await admin.from(table).insert(value).select("id").single();
  expect(r.error,table).toBeNull();
  return r.data!.id as string;
 }
 try{
  const owner=await tenant(),foreign=await tenant(),teacher_id=owner.id;
  const name="Exact learner with collision";
  const studentId=await row("students",{teacher_id,name});
  const aliasTwin=await row("students",{teacher_id,name,name_aliases:["shared chess alias"]});
  const foreignId=await row("students",{teacher_id:foreign.id,name});
  const place=(name:string,timezone:string)=>row("workplaces",{teacher_id,name,timezone,locale:"en",currency:"USD",
   kind:"professional",policy:{}});
  const school=await place("Recorded chess school","Asia/Jerusalem");
  const personal=await place("Recorded private lessons","UTC");
  const day=(n:number)=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
  expect((await admin.from("teacher_settings").upsert({teacher_id,timezone:"UTC"})).error).toBeNull();
  expect((await admin.from("workplace_enrollments").insert([
   {teacher_id,workplace_id:school,student_id:studentId,starts_on:day(20),source:"manual"},
   {teacher_id,workplace_id:school,student_id:aliasTwin,starts_on:day(20),source:"manual"},
   {teacher_id,workplace_id:personal,student_id:studentId,starts_on:day(20),source:"manual"},
  ])).error).toBeNull();
  const call=await delegatedTool(page,request,undefined,{email:owner.email,password});
  async function lesson(workplaceId:string,startsAt:string,students:string[],complete:boolean){
   let sessionId:string;
   if(workplaceId===school&&complete){
    // Synthetic historical fixture: preserve the attested timezone at
    // creation. The guard rightfully disallows editing it after lesson start.
    sessionId=await row("teaching_sessions",{teacher_id,workplace_id:workplaceId,roster_mode:"ad_hoc",
     local_timezone:"Asia/Jerusalem",starts_at:startsAt,duration_minutes:30,title:"Fixture canonical lesson",
     request_id:randomUUID()});
    expect((await admin.from("session_participants").insert(students.map(student_id=>({
     teacher_id,session_id:sessionId,student_id,
    })))).error).toBeNull();
   }else{
    const made=await call(students.length===1?"ccp_sessions_create":"ccp_sessions_ad_hoc_create",{
     workplaceId,...(students.length===1?{studentId:students[0]}:{studentIds:students,confirmed:true}),title:"Fixture canonical lesson",
     startsAt,durationMinutes:30,idempotencyKey:randomUUID()});
    expect(made.error).toBeUndefined();
    sessionId=(students.length===1?made.data.entityId:made.data.id) as string;
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
   }
   if(complete){
    const roster=await call("ccp_sessions_roster_preview",{sessionId});
    expect(roster.error).toBeUndefined();
    const saved=await call("ccp_sessions_complete",{sessionId,expectedUpdatedAt:roster.data.updatedAt,
     attendance:students.map(studentId=>({studentId,status:studentId===aliasTwin?"absent":workplaceId===school?"late":"present",
      note:"private note must never be returned",expectedUpdatedAt:null})),confirmed:true,idempotencyKey:randomUUID()});
    expect(saved.error).toBeUndefined();
   }
   return sessionId;
  }
  const schoolSession=await lesson(school,day(4)+"T23:00:00Z",[studentId,aliasTwin],true);
  const privateSession=await lesson(personal,day(2)+"T08:00:00Z",[studentId],true);
  const unclosed=await lesson(school,day(3)+"T09:00:00Z",[studentId],false);
  const input={schoolYearStart:"2023-09-01",schoolYearEnd:"2024-08-31",timezone:"Asia/Jerusalem",
   rows:[
    {"Student ID":studentId,"Workplace ID":school,Date:"2024-01-11",Attendance:"absent",Source:"private source label must never be returned"},
    {"Student ID":studentId,"Workplace ID":personal,Attendance:"present","Period Start":"2024-02-01","Period End":"2024-03-01","Lesson Count":"7"},
    {"Student ID":aliasTwin,"Workplace ID":school,Date:"2024-01-12",Attendance:"present"},
   ],mapping:{studentId:"Student ID",workplaceId:"Workplace ID",attendedOn:"Date",attendanceStatus:"Attendance",
    periodStart:"Period Start",periodEnd:"Period End",lessonCount:"Lesson Count",sourceLabel:"Source"}};
  const preview=await call("ccp_historical_attendance_preview",input);
  expect(preview.error).toBeUndefined();
  expect(preview.data).toMatchObject({canCommit:true,previewTotal:3});
  const imported=await call("ccp_historical_attendance_commit",{...input,previewDigest:preview.data.previewDigest,
   confirmed:true,idempotencyKey:randomUUID()});
  expect(imported.error).toBeUndefined();
  const nameOfTool="ccp_learner_evidence_get";
  const active=await call(nameOfTool,{studentId});
  expect(active.error).toBeUndefined();
  expect(active.data.archived).toBe(false);
  const lifecycle=await call("ccp_students_lifecycle_preview",{studentId});
  expect(lifecycle.error).toBeUndefined();
  const archived=await call("ccp_students_lifecycle_commit",{studentId,mode:"archive",
   expectedUpdatedAt:lifecycle.data.expectedUpdatedAt,selectedWorkplaceIds:[],requestId:randomUUID(),confirmed:true,
   reason:"Verify existing lesson and import evidence remains available"});
  expect(archived.error).toBeUndefined();
  expect(archived.data).toMatchObject({archived:true,closedPeriods:2});
  async function snapshot(){
   const tables=["students","workplace_enrollments","teaching_sessions","session_participants",
    "session_attendance","ccp_historical_attendance_evidence"];
   const reads=await Promise.all(tables.map(table=>admin.from(table).select("*").eq("teacher_id",teacher_id)));
   for(const r of reads)expect(r.error).toBeNull();
   return reads.map(r=>r.data!.map(x=>JSON.stringify(x)).sort());
  }
  const before=await snapshot();
  const path=(id:string)=>"/api/students/"+id+"/learning-evidence";
  const r=await page.request.get(path(studentId));
  expect(r.status(),await r.text()).toBe(200);
  const data=await r.json();
  expect(data).toEqual({...active.data,archived:true});
  expect(data.completed).toMatchObject({total:2,records:[
   {sessionId:privateSession,localDate:null,workplace:{id:personal},attendance:"present"},
   {sessionId:schoolSession,localDate:day(3),workplace:{id:school},attendance:"late"},
  ]});
  expect(data.imported).toMatchObject({totalRows:2,datedObservations:1,aggregateSourceRows:1,aggregateDeclaredLessons:7});
  expect(data.imported.records).toEqual(expect.arrayContaining([
   expect.objectContaining({kind:"dated",date:"2024-01-11",attendance:"absent",workplace:{id:school,name:"Recorded chess school"}}),
   expect.objectContaining({kind:"aggregate",periodStart:"2024-02-01",periodEnd:"2024-03-01",declaredLessons:7,
    workplace:{id:personal,name:"Recorded private lessons"}}),
  ]));
  const encoded=JSON.stringify(data);
  for(const banned of [unclosed,aliasTwin,foreignId,"private note","private source label","2024-01-12","durationMinutes","mastery"])
   expect(encoded).not.toContain(banned);
  const readPage=await browser.newPage();
  try{
   expect((await readPage.request.get(new URL(path(studentId),page.url()).toString())).status()).toBe(401);
   const read=await delegatedTool(readPage,request,"coach:read",{email:owner.email,password});
   expect((await read.listTools()).map(t=>t.name)).toContain(nameOfTool);
   expect((await read(nameOfTool,{studentId})).data).toEqual(data);
   expect((await read(nameOfTool,{studentId:foreignId})).error?.code).toBe("NOT_FOUND");
  }finally{await readPage.close();}
  expect((await page.request.get(path(foreignId))).status()).toBe(404);
  expect((await page.request.get(path("invalid"))).status()).toBe(400);
  expect(await snapshot()).toEqual(before);
  await page.goto("/students/"+studentId);
  const evidence=page.getByRole("region",{name:"Lesson and import evidence"});
  await expect(evidence).toContainText("Archived learner");
  await expect(evidence).toContainText("Recorded chess school");
  await expect(evidence).toContainText("Recorded private lessons");
  await expect(evidence).toContainText(day(2)+" 08:00 UTC");
  await expect(evidence).toContainText("2024-01-11: Absent");
  await expect(evidence).toContainText("7 lessons declared, dates not recorded");
  await expect(evidence.getByRole("link",{name:"Review historical imports"}))
   .toHaveAttribute("href","/account#historical-attendance-import");
  expect(await snapshot()).toEqual(before);
 }finally{
  for(const id of users)expect((await admin.auth.admin.deleteUser(id,true)).error).toBeNull();
 }
});
