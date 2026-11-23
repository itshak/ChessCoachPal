import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY: dated workplace roster follows a moved and archived learner without reassigning history",async({page,request})=>{
 test.setTimeout(90000);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="scoped-roster-"+randomUUID()+"@example.com",password="SyntheticRosterScope-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const teacherId=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({id:teacherId,email,display_name:"Synthetic roster coach",
   onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,teacherId,10,2);
  const call=await delegatedTool(page,request,"coach:read coach:write",{email,password});
  const school=await call("ccp_workplaces_create",{name:"Roster School "+randomUUID(),timezone:"Asia/Jerusalem",currency:"ILS",
   locale:"he",policy:{},idempotencyKey:randomUUID()});
  expect(school.error).toBeUndefined();
  const personal=await admin.from("workplaces").select("id").eq("teacher_id",teacherId).eq("kind","personal").single();
  expect(personal.error).toBeNull();
  const schoolId=school.data.entityId as string,privateId=personal.data!.id;
  const learner=async(label:string)=>{
   const name="Synthetic "+label+" "+randomUUID();
   const a=await call("ccp_students_create",{name,idempotencyKey:randomUUID()});
   expect(a.error).toBeUndefined();
   return {name,id:a.data.entityId as string};
  };
  const moved=await learner("moved"),shared=await learner("shared"),privateFormer=await learner("private former"),
   future=await learner("future"),cancelledFuture=await learner("cancelled future");
  const membership=(student_id:string,workplace_id:string,starts_on="2020-01-01")=>({teacher_id:teacherId,student_id,workplace_id,starts_on,source:"manual"});
  expect((await admin.from("workplace_enrollments").insert([
   membership(moved.id,schoolId),membership(shared.id,schoolId),membership(shared.id,privateId),
   membership(privateFormer.id,privateId),membership(future.id,schoolId,"2088-01-01"),
   membership(cancelledFuture.id,schoolId,"2088-01-01"),
  ])).error).toBeNull();
  const session=await call("ccp_sessions_create",{workplaceId:schoolId,studentId:moved.id,title:"Synthetic historical school lesson",
   startsAt:"2022-02-01T13:00:00Z",durationMinutes:45,idempotencyKey:randomUUID()});
  expect(session.error).toBeUndefined();
  const sessionId=session.data.entityId as string;
  const flags=(archivedOnly=false,includeArchived=false)=>({archivedOnly,includeArchived,limit:5,offset:0});
  const idList=(rows:{id:string}[])=>rows.map(x=>x.id).sort();
  const parity=async(workplaceId:string|null,archivedOnly=false,includeArchived=false)=>{
   const args={workplaceId,...flags(archivedOnly,includeArchived)};
   const mcp=await call("ccp_students_roster",args);
   expect(mcp.error).toBeUndefined();
   const q=new URLSearchParams({workplaceId:workplaceId??"all",limit:"5",offset:"0",archivedOnly:String(archivedOnly),includeArchived:String(includeArchived)});
   const http=await page.request.get("/api/students?"+q);
   expect(http.status(),await http.text()).toBe(200);
   const body=await http.json();
   expect(idList(body.students)).toEqual(idList(mcp.data.students));
   expect(body.nextOffset).toBe(mcp.data.nextOffset);
   return idList(body.students);
  };
  async function select(selectedWorkplaceId:string|null,expectedSelectedWorkplaceId:string|null){
   const result=await call("ccp_workplace_context_set",{selectedWorkplaceId,expectedSelectedWorkplaceId,confirmed:true});
   expect(result.error).toBeUndefined();
  }
  async function archive(studentId:string){
   const preview=await call("ccp_students_lifecycle_preview",{studentId});
   expect(preview.error).toBeUndefined();
   const archived=await call("ccp_students_lifecycle_commit",{studentId,mode:"archive",confirmed:true,
    expectedUpdatedAt:preview.data.expectedUpdatedAt,selectedWorkplaceIds:[],requestId:randomUUID(),
    reason:"Teacher reviewed the synthetic archive and its historical membership"});
   expect(archived.error).toBeUndefined();
  }

  await select(schoolId,null);
  expect(await parity("context")).toEqual([moved.id,shared.id].sort());
  await page.goto("/students");
  await expect(page.getByText(moved.name,{exact:true})).toBeVisible();
  await expect(page.getByText(future.name,{exact:true})).toHaveCount(0);
  const ending=await call("ccp_workplaces_unenroll_preview",{workplaceId:schoolId,studentId:moved.id});
  expect(ending.error).toBeUndefined();
  expect(ending.data.canEnd).toBe(true);
  const ended=await call("ccp_workplaces_unenroll",{workplaceId:schoolId,studentId:moved.id,confirmed:true,
   expectedRevision:ending.data.revision,idempotencyKey:randomUUID(),reason:"Teacher reviewed this move between workplaces"});
  expect(ended.error).toBeUndefined();
  expect((await call("ccp_workplaces_enroll",{workplaceId:privateId,studentId:moved.id,idempotencyKey:randomUUID()})).error)
   .toBeUndefined();
  expect(await parity("context")).toEqual([shared.id]);
  expect(await parity(privateId)).toEqual([moved.id,shared.id,privateFormer.id].sort());
  await page.goto("/students");
  await expect(page.getByText(moved.name,{exact:true})).toHaveCount(0);
  await select(null,schoolId);
  await page.goto("/students");
  await expect(page.getByText(moved.name,{exact:true})).toHaveCount(1);
  await expect(page.getByText(shared.name,{exact:true})).toHaveCount(1);
  const all=await parity(null);
  expect(all).toEqual([moved.id,shared.id,privateFormer.id,future.id,cancelledFuture.id].sort());

  await archive(moved.id);
  await archive(privateFormer.id);
  await archive(cancelledFuture.id);
  await select(schoolId,null);
  expect(await parity("context",true)).toEqual([moved.id]);
  expect(await parity("context",false,true)).toEqual([moved.id,shared.id].sort());
  const cancelledDestination=await admin.from("workplace_enrollments").select("cancelled_at")
   .eq("teacher_id",teacherId).eq("workplace_id",privateId).eq("student_id",moved.id).single();
  expect(cancelledDestination.error).toBeNull();
  expect(cancelledDestination.data?.cancelled_at).toBeTruthy();
  expect(await parity(privateId,true)).toEqual([privateFormer.id]);
  expect(await parity(null,true)).toEqual([moved.id,privateFormer.id,cancelledFuture.id].sort());
  await page.goto("/students?show=archived");
  await expect(page.getByText(moved.name,{exact:true})).toHaveCount(1);
  await expect(page.getByText(privateFormer.name,{exact:true})).toHaveCount(0);
  await expect(page.getByText(cancelledFuture.name,{exact:true})).toHaveCount(0);
  expect((await call("ccp_students_roster",{workplaceId:randomUUID(),...flags(true)})).error?.code).toBe("NOT_FOUND");
  const history=await call("ccp_lessons_history_unified",{studentId:moved.id,from:"2022-02-01",to:"2022-02-01"});
  expect(history.error).toBeUndefined();
  expect(history.data.entries).toEqual([expect.objectContaining({id:sessionId,workplaceId:schoolId,studentIds:[moved.id]})]);
  const otherHistory=await call("ccp_lessons_history_unified",{workplaceId:privateId,studentId:moved.id,from:"2022-02-01",to:"2022-02-01"});
  expect(otherHistory.error).toBeUndefined();
  expect(otherHistory.data.entries).toEqual([]);
  // Existing import/contact identity choosers still get All without an explicit context filter.
  const omitted=await call("ccp_students_roster",{...flags(true)});
  expect(omitted.error).toBeUndefined();
  expect(idList(omitted.data.students)).toEqual([moved.id,privateFormer.id,cancelledFuture.id].sort());
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});

test("PARITY: named current enrollment uses venue day and excludes stale archived rows",async({page,request})=>{
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="named-venue-date-"+randomUUID()+"@example.com",password="SyntheticNamedVenueDate-123!";
 const account=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(account.error).toBeNull();
 const teacherId=account.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({id:teacherId,email,display_name:"Named venue-day fixture",
   onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  const dateParts=(zone:string)=>{
   const fields=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",hourCycle:"h23",minute:"2-digit"}).formatToParts(new Date());
   const get=(label:Intl.DateTimeFormatPartTypes)=>fields.find(x=>x.type===label)!.value;
   return {day:get("year")+"-"+get("month")+"-"+get("day"),minutes:Number(get("hour"))*60+Number(get("minute"))};
  };
  // The paired zones are exactly 24 hours apart. Choose one away from local midnight.
  const zones=[["Pacific/Kiritimati","Etc/GMT+10"],["Pacific/Apia","Etc/GMT+11"]].find(
   pair=>pair.map(dateParts).every(p=>p.minutes>5&&p.minutes<1434),
  )!;
  const [teacherZone,venueZone]=zones;
  const teacherDay=dateParts(teacherZone).day,venueDay=dateParts(venueZone).day;
  expect(teacherDay>venueDay).toBe(true);
  expect((await admin.from("teacher_settings").upsert({teacher_id:teacherId,timezone:teacherZone})).error).toBeNull();
  const venue=await admin.from("workplaces").insert({teacher_id:teacherId,name:"Behind teacher calendar",timezone:venueZone})
   .select("id").single();
  expect(venue.error).toBeNull();
  const workplaceId=venue.data!.id;
  const target=await admin.from("students").insert([
   {teacher_id:teacherId,name:"Starts only on teacher day"},
   {teacher_id:teacherId,name:"Ends on venue day"},
   {teacher_id:teacherId,name:"Archived stale membership"},
  ]).select("id,name");
  expect(target.error).toBeNull();
  const [starts,ends,archived]=target.data!;
  expect((await admin.from("workplace_enrollments").insert([
   {teacher_id:teacherId,workplace_id:workplaceId,student_id:starts.id,starts_on:teacherDay},
   {teacher_id:teacherId,workplace_id:workplaceId,student_id:ends.id,starts_on:"2020-01-01",ends_on:venueDay},
   {teacher_id:teacherId,workplace_id:workplaceId,student_id:archived.id,starts_on:"2020-01-01"},
  ])).error).toBeNull();
  // Normal archive closes on teacher day minus one: the inclusive end
  // is still today at this venue, so the learner's archived flag matters.
  const call=await delegatedTool(page,request,undefined,{email,password});
  const archivePreview=await call("ccp_students_lifecycle_preview",{studentId:archived.id});
  expect(archivePreview.error).toBeUndefined();
  const approved=await call("ccp_students_lifecycle_commit",{
   studentId:archived.id,mode:"archive",expectedUpdatedAt:archivePreview.data.expectedUpdatedAt,
   selectedWorkplaceIds:[],requestId:randomUUID(),reason:"Synthetic venue-calendar archive proof",confirmed:true,
  });
  expect(approved.error).toBeUndefined();
  const period=await admin.from("workplace_enrollments").select("ends_on,cancelled_at")
   .eq("teacher_id",teacherId).eq("workplace_id",workplaceId).eq("student_id",archived.id).single();
  expect(period.error).toBeNull();
  expect(period.data).toEqual({ends_on:venueDay,cancelled_at:null});
  const named=await call("ccp_workplaces_enrollments",{workplaceId});
  expect(named.error).toBeUndefined();
  expect(named.data).toEqual([expect.objectContaining({
   student_id:ends.id,student_name:ends.name,starts_on:"2020-01-01",ends_on:venueDay,
  })]);
  const browser=await page.request.post("/api/agent/v1",{data:{action:"workplaces.enrollments",workplaceId}});
  expect(browser.status(),await browser.text()).toBe(200);
  expect((await browser.json()).data).toEqual(named.data);
  const students=await call("ccp_students_roster",{workplaceId});
  expect(students.data.students.map((x:{id:string})=>x.id)).toEqual([ends.id]);
  const foreign=await admin.from("workplaces").select("id").neq("teacher_id",teacherId).limit(1).single();
  expect(foreign.error).toBeNull();
  expect((await call("ccp_workplaces_enrollments",{workplaceId:foreign.data!.id})).error?.code).toBe("NOT_FOUND");
  const denial=await page.request.post("/api/agent/v1",{data:{action:"workplaces.enrollments",workplaceId:foreign.data!.id}});
  expect(denial.status()).toBe(404);
  expect((await call("ccp_workplaces_enrollments",{workplaceId:null})).error?.code).toBe("VALIDATION_ERROR");
  const all=await page.request.post("/api/agent/v1",{data:{action:"workplaces.enrollments",workplaceId:null}});
  expect(all.status()).toBe(400);
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
