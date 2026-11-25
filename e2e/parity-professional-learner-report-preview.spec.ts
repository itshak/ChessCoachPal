import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-professional-learner-report-preview shows only verified attendance for one learner and workplace",async({page,request,browser})=>{
 test.setTimeout(180_000);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 expect(["localhost","127.0.0.1","[::1]"]).toContain(new URL(url).hostname);
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const users:string[]=[];
 const password="SyntheticLearnerReport8!";
 async function tenant(){
  const email="learner-report-"+randomUUID()+"@example.invalid";
  const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(identity.error).toBeNull();
  const id=identity.data.user!.id;
  users.push(id);
  expect((await admin.from("teachers").insert({id,email,display_name:"Learner report fixture",
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
  const studentId=await row("students",{teacher_id,name:"Synthetic report learner"});
  const otherStudent=await row("students",{teacher_id,name:"Other learner private identity"});
  const foreignStudent=await row("students",{teacher_id:foreign.id,name:"Foreign private identity"});
  const place=(id:string,name:string)=>row("workplaces",{teacher_id:id,name,timezone:"Asia/Jerusalem",
    locale:"en",currency:"ILS",kind:"professional",policy:{}});
  const workplaceId=await place(teacher_id,"Synthetic chess school");
  const otherWorkplace=await place(teacher_id,"Separate private workplace");
  const foreignWorkplace=await place(foreign.id,"Foreign private workplace");
  const day=(n:number)=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
  expect((await admin.from("workplace_enrollments").insert([
   {teacher_id,workplace_id:workplaceId,student_id:studentId,starts_on:day(30),source:"manual"},
   {teacher_id,workplace_id:workplaceId,student_id:otherStudent,starts_on:day(30),source:"manual"},
   {teacher_id,workplace_id:otherWorkplace,student_id:studentId,starts_on:day(30),source:"manual"},
  ])).error).toBeNull();
  const call=await delegatedTool(page,request,undefined,{email:owner.email,password});
  async function lesson(venue:string,startsAt:string,timezone:string|null,students:string[],
     mode:"attested"|"unmarked"|"scheduled"){
   const sessionId=await row("teaching_sessions",{teacher_id,workplace_id:venue,roster_mode:"ad_hoc",
    local_timezone:timezone,starts_at:startsAt,duration_minutes:30,title:"Private lesson title",
    request_id:randomUUID()});
   expect((await admin.from("session_participants").insert(students.map(student_id=>({
     teacher_id,session_id:sessionId,student_id,
   })))).error).toBeNull();
   if(mode==="unmarked"){
    // Trusted disposable compatibility fixture: old completion without an attendance decision.
    expect((await admin.from("teaching_sessions").update({status:"completed"})
      .eq("id",sessionId).eq("teacher_id",teacher_id)).error).toBeNull();
   }
   if(mode==="attested"){
    const roster=await call("ccp_sessions_roster_preview",{sessionId});
    expect(roster.error).toBeUndefined();
    const saved=await call("ccp_sessions_complete",{sessionId,expectedUpdatedAt:roster.data.updatedAt,
     attendance:students.map(studentId=>({studentId,status:studentId===otherStudent?"absent":"present",
      note:"Private attendance text",expectedUpdatedAt:null})),confirmed:true,idempotencyKey:randomUUID()});
    expect(saved.error).toBeUndefined();
   }
   return sessionId;
  }
  const group=await lesson(workplaceId,day(8)+"T23:00:00Z","Asia/Jerusalem",[studentId,otherStudent],"attested");
  const unknown=await lesson(workplaceId,day(6)+"T08:00:00Z","Asia/Jerusalem",[studentId],"unmarked");
  const otherVenueSession=await lesson(otherWorkplace,day(5)+"T08:00:00Z","Asia/Jerusalem",[studentId],"attested");
  const notDated=await lesson(workplaceId,day(4)+"T08:00:00Z",null,[studentId],"attested");
  const notCompleted=await lesson(workplaceId,day(3)+"T08:00:00Z","Asia/Jerusalem",[studentId],"scheduled");
  const otherLearner=await lesson(workplaceId,day(2)+"T08:00:00Z","Asia/Jerusalem",[otherStudent],"attested");
  const outOfRange=await lesson(workplaceId,day(10)+"T08:00:00Z","Asia/Jerusalem",[studentId],"attested");
  await row("session_notes",{teacher_id,session_id:group,student_id:studentId,
    body:"Previously shared narrative is not automatically report evidence",
    private_body:"Private coach narrative",shared_with_contacts:false});
  await row("ccp_historical_attendance_evidence",{teacher_id,student_id:studentId,workplace_id:workplaceId,
   mode:"aggregate",period_start:day(6),period_end:day(4),attendance_status:"absent",lesson_count:17,
   source_row:2,source_label:"Private source label",source_timezone:"Asia/Jerusalem",school_year_start:day(20),
   school_year_end:day(1),source_sha256:"a".repeat(64),batch_id:randomUUID()});
  async function snapshot(){
   const tables=["students","teaching_sessions","session_participants","session_attendance","session_notes",
     "ccp_historical_attendance_evidence","report_publications","report_publication_audiences",
     "financial_obligations","received_payments","payment_allocations","credit_redemptions","invoices"];
   const reads=await Promise.all(tables.map(table=>admin.from(table).select("*").eq("teacher_id",teacher_id)));
   for(const [i,r] of reads.entries())expect(r.error,tables[i]).toBeNull();
   return reads.map(r=>r.data!.map(x=>JSON.stringify(x)).sort());
  }
  const before=await snapshot();
  const args={studentId,workplaceId,from:day(7),to:day(2),outputLocale:"he"};
  const tool="ccp_learner_report_preview";
  const path=(id:string,overrides:Record<string,string>={})=>"/api/students/"+id+"/report-preview?"+
    new URLSearchParams({workplaceId,from:args.from,to:args.to,outputLocale:"he",...overrides});
  const r=await page.request.get(path(studentId));
  expect(r.status(),await r.text()).toBe(200);
  expect(r.headers()["cache-control"]).toBe("private, no-store");
  const data=await r.json();
  expect(data).toEqual({status:"teacher_preview_only",writesPerformed:false,
   candidate:{from:args.from,to:args.to,outputLocale:"he",dateBasis:"recorded_session_local_date",records:[
    {localDate:day(7),attendance:"present"},{localDate:day(6),attendance:"unknown"},
   ]}});
  const encoded=JSON.stringify(data);
  for(const banned of [studentId,otherStudent,group,unknown,otherVenueSession,notDated,notCompleted,
    otherLearner,outOfRange,"Private","Separate",workplaceId,otherWorkplace,"mastery","payer","recipient"])
   expect(encoded).not.toContain(banned);
  const readPage=await browser.newPage();
  try{
   expect((await readPage.request.get(new URL(path(studentId),page.url()).toString())).status()).toBe(401);
   const read=await delegatedTool(readPage,request,"coach:read",{email:owner.email,password});
   expect((await read.listTools()).map(t=>t.name)).toContain(tool);
   expect((await read(tool,args)).data).toEqual(data);
   expect((await read(tool,{...args,studentId:otherStudent})).data.candidate.records).toEqual([
    {localDate:day(7),attendance:"absent"},{localDate:day(2),attendance:"absent"},
   ]);
   expect((await read(tool,{...args,workplaceId:foreignWorkplace})).error?.code).toBe("NOT_FOUND");
   expect((await read(tool,{...args,from:"2026-02-30"})).error?.code).toBe("VALIDATION_ERROR");
  }finally{await readPage.close();}
  expect((await page.request.get(path(foreignStudent))).status()).toBe(404);
  expect((await page.request.get(path(studentId,{workplaceId:"all"}))).status()).toBe(400);
  expect((await page.request.get(path(studentId,{outputLocale:"es"}))).status()).toBe(400);
  expect((await page.request.get(path(studentId,{from:day(1)}))).status()).toBe(400);
  const foreignPage=await browser.newPage();
  try{
   const outsider=await delegatedTool(foreignPage,request,"coach:read",{email:foreign.email,password});
   expect((await outsider(tool,args)).error?.code).toBe("NOT_FOUND");
   expect((await foreignPage.request.get(new URL(path(studentId),page.url()).toString())).status()).toBe(404);
  }finally{await foreignPage.close();}
  expect(await snapshot()).toEqual(before);

  await page.setViewportSize({width:320,height:820});
  await page.goto("/students/"+studentId);
  await page.getByText("Learner report preview",{exact:true}).click();
  const panel=page.locator("details").filter({hasText:"Learner report preview"});
  await expect(panel).toContainText("Private to you. This preview does not save, publish, or share anything.");
  await expect(panel.getByLabel("Workplace")).toHaveValue("");
  await expect(panel.getByLabel("Workplace")).toBeEnabled();
  await panel.getByLabel("Workplace").selectOption(workplaceId);
  await panel.getByLabel("From date").fill(args.from);
  await panel.getByLabel("Through date").fill(args.to);
  await panel.getByLabel("Output language").selectOption("he");
  const [browserFetch]=await Promise.all([
   page.waitForResponse(res=>new URL(res.url()).pathname.endsWith("/report-preview")&&
     res.request().resourceType()==="fetch"&&res.request().method()==="GET"),
   panel.getByRole("button",{name:"Preview report"}).click(),
  ]);
  expect(browserFetch.ok(),await browserFetch.text()).toBe(true);
  expect(await browserFetch.json()).toEqual(data);
  const report=panel.getByRole("region",{name:"נוכחות מתועדת בשיעורים"});
  await expect(report).toHaveAttribute("dir","rtl");
  await expect(report).toHaveAttribute("lang","he");
  await expect(report.getByRole("listitem")).toHaveCount(2);
  await expect(report.getByRole("listitem").nth(1)).toContainText("לא תועד");
  expect(await panel.evaluate(el=>el.scrollWidth)).toBeLessThanOrEqual(await panel.evaluate(el=>el.clientWidth)+1);
  await panel.getByLabel("Workplace").selectOption(otherWorkplace);
  await expect(report).toHaveCount(0);
  expect(await snapshot()).toEqual(before);
 }finally{
  for(const id of users)expect((await admin.auth.admin.deleteUser(id,true)).error).toBeNull();
 }
});
