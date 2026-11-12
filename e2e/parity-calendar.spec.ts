import {randomUUID} from "node:crypto";
import {expect,test,type Page} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
type Tool=(name:string,args:Record<string,unknown>)=>Promise<{
 data?:any;error?:{code:string;message:string};
}>;
async function student(call:Tool){
 const r=await call("ccp_v1_students_create",{
   name:"Calendar learner "+randomUUID().slice(0,9),idempotencyKey:randomUUID(),
 });
 expect(r.error).toBeUndefined();
 return r.data.entityId as string;
}
async function lesson(call:Tool,studentId:string,date:string,time:string){
 const r=await call("ccp_v1_calendar_lessons_create",{
   studentId,date,time,durationMinutes:45,confirmed:true,
 });
 expect(r.error).toBeUndefined();
 return r.data.id as string;
}
async function websiteDetail(page:Page,id:string){
 const res=await page.request.get("/api/schedule/lessons/"+id);
 expect(res.status(),await res.text()).toBe(200);
 return await res.json();
}

test("PARITY:PARITY-calendar-dst-gap-safety rejects missing wall times and matches real fold instants",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const settings=await page.request.get("/api/settings/policy");
 expect(settings.status(),await settings.text()).toBe(200);
 const original=(await settings.json()).timezone as string;
 const timezone=await page.request.put("/api/settings/policy",{data:{timezone:"America/Chicago"}});
 expect(timezone.status(),await timezone.text()).toBe(200);
 try{
   const studentId=await student(call);
   const invalid=await page.request.post("/api/schedule/lessons",{data:{
     studentId,date:"2026-03-08",time:"02:30",durationMinutes:45,
   }});
   expect(invalid.status(),await invalid.text()).toBe(400);
   expect((await invalid.json()).code).toBe("VALIDATION_ERROR");
   const invalidMcp=await call("ccp_v1_calendar_lessons_create",{
     studentId,date:"2026-03-08",time:"02:30",durationMinutes:45,confirmed:true,
   });
   expect(invalidMcp.error?.code).toBe("VALIDATION_ERROR");

   // Repeat the earlier 01:30 during fall-back consistently in both clients.
   const valid=await page.request.post("/api/schedule/lessons",{data:{
     studentId,date:"2026-11-01",time:"01:30",durationMinutes:45,
   }});
   expect(valid.status(),await valid.text()).toBe(200);
   const id=(await valid.json()).id as string;
   const mcp=await call("ccp_v1_calendar_lessons_detail",{lessonId:id});
   expect(mcp.error).toBeUndefined();
   expect(new Date(mcp.data.starts_at).toISOString()).toBe("2026-11-01T06:30:00.000Z");
   const badMove=await page.request.put("/api/schedule/lessons/"+id,{data:{
     date:"2026-03-08",time:"02:30",
   }});
   expect(badMove.status(),await badMove.text()).toBe(400);
   const mcpBadMove=await call("ccp_v1_calendar_lessons_update",{
     lessonId:id,changes:{date:"2026-03-08",time:"02:30"},confirmed:true,
   });
   expect(mcpBadMove.error?.code).toBe("VALIDATION_ERROR");
   expect(new Date((await websiteDetail(page,id)).starts_at).toISOString()).toBe("2026-11-01T06:30:00.000Z");
 }finally{
   const restore=await page.request.put("/api/settings/policy",{data:{timezone:original}});
   expect(restore.status(),await restore.text()).toBe(200);
 }
});

test("PARITY:PARITY-calendar-recurring-slots supports list create edit disable and delete",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const studentId=await student(call);
 const made=await call("ccp_v1_calendar_slots_create",{
   studentId,dayOfWeek:0,startTime:"13:00",durationMinutes:40,
   startDate:"2026-11-29",endDate:"2026-12-13",confirmed:true,
 });
 expect(made.error).toBeUndefined();
 const slotId=made.data.id as string;
 const site=await page.request.get("/api/schedule/slots?studentId="+studentId);
 expect(site.status(),await site.text()).toBe(200);
 const created=(await site.json()) as Array<{id:string;active:boolean}>;
 expect(created.some(x=>x.id===slotId)).toBe(true);
 const edit=await page.request.put("/api/schedule/slots/"+slotId,{
   data:{rateCents:3800},
 });
 expect(edit.status(),await edit.text()).toBe(200);
 const mcp=await call("ccp_v1_calendar_slots_list",{studentId});
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(await (await page.request.get(
   "/api/schedule/slots?studentId="+studentId)).json());
 expect((mcp.data as Array<{id:string;rate_cents:number}>)
   .find(x=>x.id===slotId)?.rate_cents).toBe(3800);
 const disabled=await call("ccp_v1_calendar_slots_update",{
   slotId,changes:{active:false},confirmed:true,
 });
 expect(disabled.error).toBeUndefined();
 const active=await page.request.get("/api/schedule/slots?studentId="+studentId+"&activeOnly=true");
 expect(active.status()).toBe(200);
 expect((await active.json() as Array<{id:string}>).some(x=>x.id===slotId)).toBe(false);
 const deleted=await call("ccp_v1_calendar_slots_delete",{slotId,confirmed:true});
 expect(deleted.error).toBeUndefined();
 const after=await page.request.get("/api/schedule/slots?studentId="+studentId);
 expect(after.status()).toBe(200);
 expect((await after.json() as Array<{id:string}>).some(x=>x.id===slotId)).toBe(false);
});

test("PARITY:PARITY-calendar-one-off-lesson-creation synchronizes real browser and MCP calendars",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const id=await student(call);
 const made=await page.request.post("/api/schedule/lessons",{data:{
   studentId:id,date:"2026-12-16",time:"11:00",durationMinutes:45,
 }});
 expect(made.status(),await made.text()).toBe(200);
 const browserId=(await made.json()).id as string;
 const mcpRead=await call("ccp_v1_calendar_lessons_detail",{lessonId:browserId});
 expect(mcpRead.error).toBeUndefined();
 expect(mcpRead.data.student_id).toBe(id);
 const mcpId=await lesson(call,id,"2026-12-17","13:00");
 const browser=await websiteDetail(page,mcpId);
 expect(browser.student_id).toBe(id);
 const list=await call("ccp_v1_calendar_lessons_list",{studentId:id,limit:50,offset:0});
 expect(list.error).toBeUndefined();
 expect(list.data.lessons.some((x:{id:string})=>x.id===mcpId)).toBe(true);
 expect(list.data.lessons.some((x:{id:string})=>x.id===browserId)).toBe(true);
});

test("PARITY:PARITY-calendar-lesson-edit corrects private time duration and home visits",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const studentId=await student(call);
 const id=await lesson(call,studentId,"2026-12-18","10:00");
 const website=await page.request.put("/api/schedule/lessons/"+id,{data:{
   time:"11:00",durationMinutes:60,
 }});
 expect(website.status(),await website.text()).toBe(200);
 const detail=await call("ccp_v1_calendar_lessons_detail",{lessonId:id});
 expect(detail.error).toBeUndefined();
 expect(detail.data.duration_minutes).toBe(60);
 const mcp=await call("ccp_v1_calendar_lessons_update",{
   lessonId:id,changes:{isHomeVisit:true},confirmed:true,
 });
 expect(mcp.error).toBeUndefined();
 const final=await websiteDetail(page,id);
 expect(final.duration_minutes).toBe(60);
 expect(final.is_home_visit).toBe(true);
});

test("PARITY:PARITY-calendar-attendance-bulk reports exact success and failures without notifications",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const studentId=await student(call);
 const first=await lesson(call,studentId,"2026-12-19","11:00");
 const second=await lesson(call,studentId,"2026-12-20","12:00");
 const report=await call("ccp_v1_calendar_attendance_bulk",{
   ids:[first,second,randomUUID()],status:"no_show",notifyFamily:false,
   confirmed:true,
 });
 expect(report.error).toBeUndefined();
 expect(report.data.succeeded).toBe(2);
 expect(report.data.failed).toHaveLength(1);
 for(const id of [first,second]){
   const website=await page.request.get("/api/schedule/lessons/"+id+"/attendance");
   expect(website.status(),await website.text()).toBe(200);
   expect((await website.json()).status).toBe("no_show");
 }
 const siteBulk=await page.request.post("/api/schedule/attendance/bulk",{data:{
   ids:[first,second],status:"attended",notifyFamily:false,
 }});
 expect(siteBulk.status(),await siteBulk.text()).toBe(200);
 expect((await siteBulk.json()).succeeded).toBe(2);
 for(const id of [first,second]){
   const mcp=await call("ccp_v1_calendar_attendance_read",{lessonId:id});
   expect(mcp.error).toBeUndefined();
   expect(mcp.data.status).toBe("attended");
 }
});

test("PARITY:PARITY-calendar-private-shared-notes preserve teacher privacy and never email by default",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const studentId=await student(call);
 const id=await lesson(call,studentId,"2026-12-21","14:00");
 const updated=await call("ccp_v1_calendar_lesson_note_update",{
   lessonId:id,body:"Studied basic checkmate patterns",
   privateBody:"Teacher-only: more visualization",sendEmail:false,confirmed:true,
 });
 expect(updated.error).toBeUndefined();
 expect(updated.data.emailed).toBe(false);
 const website=await page.request.get("/api/schedule/lessons/"+id+"/note");
 expect(website.status(),await website.text()).toBe(200);
 expect((await website.json()).private_body).toBe("Teacher-only: more visualization");
 const ordinary=await call("ccp_v1_calendar_lesson_note_read",{lessonId:id});
 expect(ordinary.error).toBeUndefined();
 expect(ordinary.data.private_body).toBeUndefined();
 const privateRead=await call("ccp_v1_calendar_lesson_note_read",{
   lessonId:id,includePrivate:true,confirmed:true,
 });
 expect(privateRead.data.private_body).toBe("Teacher-only: more visualization");
 const browserChange=await page.request.put("/api/schedule/lessons/"+id+"/note",{data:{
   body:"Website corrected lesson summary",privateBody:"Updated private feedback",sendEmail:false,
 }});
 expect(browserChange.status(),await browserChange.text()).toBe(200);
 const latest=await call("ccp_v1_calendar_lesson_note_read",{
   lessonId:id,includePrivate:true,confirmed:true,
 });
 expect(latest.data.body).toBe("Website corrected lesson summary");
 expect(latest.data.private_body).toBe("Updated private feedback");
});


test("PARITY:PARITY-calendar-single-attendance supports review, correction and explicit clearing without email",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const studentId=await student(call);
 const id=await lesson(call,studentId,"2044-12-14","11:00");
 const marked=await call("ccp_v1_calendar_attendance_record",{
   lessonId:id,status:"attended",confirmed:true,
 });
 expect(marked.error).toBeUndefined();
 const browser=await page.request.get("/api/schedule/lessons/"+id+"/attendance");
 expect(browser.status(),await browser.text()).toBe(200);
 expect((await browser.json()).status).toBe("attended");
 const corrected=await page.request.put("/api/schedule/lessons/"+id+"/attendance",{
   data:{status:"no_show",notifyFamily:false},
 });
 expect(corrected.status(),await corrected.text()).toBe(200);
 const fromMcp=await call("ccp_v1_calendar_attendance_read",{lessonId:id});
 expect(fromMcp.error).toBeUndefined();
 expect(fromMcp.data.status).toBe("no_show");
 const cleared=await call("ccp_v1_calendar_attendance_record",{
   lessonId:id,status:null,confirmed:true,
 });
 expect(cleared.error).toBeUndefined();
 const empty=await page.request.get("/api/schedule/lessons/"+id+"/attendance");
 expect(empty.status()).toBe(200);
 expect(await empty.json()).toBeNull();
});

test("PARITY:PARITY-calendar-ad-hoc-lesson-delete matches website and MCP without removing recurring history",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const studentId=await student(call);
 const first=await lesson(call,studentId,"2044-12-15","10:00");
 const deleted=await call("ccp_v1_calendar_lessons_delete",{
   lessonId:first,confirmed:true,
 });
 expect(deleted.error).toBeUndefined();
 expect((await page.request.get("/api/schedule/lessons/"+first)).status()).toBe(404);
 const second=await lesson(call,studentId,"2044-12-16","10:00");
 const browser=await page.request.delete("/api/schedule/lessons/"+second);
 expect(browser.status(),await browser.text()).toBe(200);
 expect((await call("ccp_v1_calendar_lessons_detail",{lessonId:second})).error?.code)
   .toBe("NOT_FOUND");
});

test("PARITY:PARITY-calendar-tenant-isolation refuses foreign lessons, slots, notes and attendance through both transports",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const {createClient}=await import("@supabase/supabase-js");
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const email="foreign-calendar-"+randomUUID()+"@example.com";
 const made=await admin.auth.admin.createUser({
  email,password:"SyntheticCalendarTenant-123!",email_confirm:true,
 });
 expect(made.error).toBeNull();
 const teacherId=made.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id:teacherId,email,display_name:"Foreign teacher",hosted_enforced:false,
  })).error).toBeNull();
  const pupil=await admin.from("students").insert({
   teacher_id:teacherId,name:"Foreign learner",
  }).select("id").single();
  expect(pupil.error).toBeNull();
  const studentId=pupil.data!.id as string;
  const recurring=await admin.from("lesson_slots").insert({
   teacher_id:teacherId,student_id:studentId,day_of_week:1,
   start_time:"13:00",duration_minutes:45,start_date:"2049-01-04",
   end_date:"2049-01-25",
  }).select("id").single();
  expect(recurring.error).toBeNull();
  const slotId=recurring.data!.id as string;
  const madeLesson=await admin.from("lessons").insert({
   teacher_id:teacherId,student_id:studentId,slot_id:null,
   lesson_date:"2049-01-04",starts_at:"2049-01-04T13:00:00Z",
   duration_minutes:45,
  }).select("id").single();
  expect(madeLesson.error).toBeNull();
  const lessonId=madeLesson.data!.id as string;

  const paths=[
   "/api/schedule/lessons/"+lessonId,
   "/api/schedule/lessons/"+lessonId+"/attendance",
   "/api/schedule/lessons/"+lessonId+"/note",
  ];
  for(const path of paths){
   const response=await page.request.get(path);
   expect([403,404]).toContain(response.status());
  }
  const forbiddenLesson=await call("ccp_v1_calendar_lessons_detail",{lessonId});
  expect(forbiddenLesson.error).toBeDefined();
  const forbiddenNotes=await call("ccp_v1_calendar_lesson_note_read",{lessonId});
  expect(forbiddenNotes.error).toBeDefined();
  const forbiddenAttendance=await call("ccp_v1_calendar_attendance_read",{lessonId});
  expect(forbiddenAttendance.error).toBeDefined();
  const browserEdit=await page.request.put("/api/schedule/lessons/"+lessonId,{
   data:{durationMinutes:75},
  });
  expect([403,404]).toContain(browserEdit.status());
  const modelEdit=await call("ccp_v1_calendar_lessons_update",{
   lessonId,changes:{durationMinutes:75},confirmed:true,
  });
  expect(modelEdit.error).toBeDefined();

  const slotList=await call("ccp_v1_calendar_slots_list",{studentId});
  expect(slotList.error).toBeUndefined();
  expect((slotList.data as Array<{id:string}>).some(x=>x.id===slotId)).toBe(false);
  const siteSlotList=await page.request.get("/api/schedule/slots?studentId="+studentId);
  expect(siteSlotList.status(),await siteSlotList.text()).toBe(200);
  expect((await siteSlotList.json() as Array<{id:string}>)
   .some(x=>x.id===slotId)).toBe(false);
  const slotEdit=await call("ccp_v1_calendar_slots_update",{
   slotId,changes:{active:false},confirmed:true,
  });
  expect(slotEdit.error).toBeDefined();
  const slotDelete=await page.request.delete("/api/schedule/slots/"+slotId);
  expect([403,404]).toContain(slotDelete.status());

  const untouchedLesson=await admin.from("lessons").select("duration_minutes")
   .eq("id",lessonId).single();
  expect(untouchedLesson.error).toBeNull();
  expect(untouchedLesson.data!.duration_minutes).toBe(45);
  const untouchedSlot=await admin.from("lesson_slots").select("active")
   .eq("id",slotId).single();
  expect(untouchedSlot.error).toBeNull();
  expect(untouchedSlot.data!.active).toBe(true);
 }finally{
  await admin.auth.admin.deleteUser(teacherId);
 }
});


test("PARITY:PARITY-calendar-slot-delete-atomic-history preserves notes and attendance across website/MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const studentId=await student(call);
 // Future Sundays well within the local 56-day materialization window.
 const d=new Date();
 const utc=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
 const offset=(7-utc.getUTCDay())%7+7;
 const start=new Date(utc.getTime()+offset*86400000);
 const last=new Date(start.getTime()+14*86400000);
 const date=(x:Date)=>x.toISOString().slice(0,10);
 const created=await call("ccp_v1_calendar_slots_create",{
  studentId,dayOfWeek:0,startTime:"09:00",durationMinutes:45,
  startDate:date(start),endDate:date(last),confirmed:true,
 });
 expect(created.error).toBeUndefined();
 const slotId=created.data.id as string;
 const before=await page.request.get("/api/schedule/lessons?studentId="+studentId+"&limit=50");
 expect(before.status(),await before.text()).toBe(200);
 const scheduled=((await before.json()).lessons as Array<{id:string;slot_id:string|null}>)
  .filter(row=>row.slot_id===slotId);
 expect(scheduled.length).toBeGreaterThanOrEqual(3);
 const [withNote,withAttendance,unused]=scheduled;
 const note=await page.request.put("/api/schedule/lessons/"+withNote.id+"/note",{
  data:{body:"Preserve this training summary",privateBody:"Teacher revision",sendEmail:false},
 });
 expect(note.status(),await note.text()).toBe(200);
 const marked=await call("ccp_v1_calendar_attendance_record",{
  lessonId:withAttendance.id,status:"no_show",confirmed:true,
 });
 expect(marked.error).toBeUndefined();
 const removed=await page.request.delete("/api/schedule/slots/"+slotId);
 expect(removed.status(),await removed.text()).toBe(200);
 expect(await removed.json()).toMatchObject({ok:true});
 const slot=await call("ccp_v1_calendar_slots_list",{studentId});
 expect(slot.error).toBeUndefined();
 expect(slot.data.some((row:{id:string})=>row.id===slotId)).toBe(false);
 for(const id of [withNote.id,withAttendance.id]){
  const detail=await call("ccp_v1_calendar_lessons_detail",{lessonId:id});
  expect(detail.error).toBeUndefined();
  expect(detail.data.slot_id).toBeNull();
 }
 const noteAfter=await call("ccp_v1_calendar_lesson_note_read",{
  lessonId:withNote.id,includePrivate:true,confirmed:true,
 });
 expect(noteAfter.error).toBeUndefined();
 expect(noteAfter.data.private_body).toBe("Teacher revision");
 const attendanceAfter=await page.request.get(
  "/api/schedule/lessons/"+withAttendance.id+"/attendance");
 expect(attendanceAfter.status(),await attendanceAfter.text()).toBe(200);
 expect((await attendanceAfter.json()).status).toBe("no_show");
 const deleted=await call("ccp_v1_calendar_lessons_detail",{lessonId:unused.id});
 expect(deleted.error?.code).toBe("NOT_FOUND");

 const second=await call("ccp_v1_calendar_slots_create",{
  studentId,dayOfWeek:1,startTime:"10:00",durationMinutes:30,
  startDate:date(start),endDate:date(last),confirmed:true,
 });
 expect(second.error).toBeUndefined();
 const secondId=second.data.id as string;
 const viaMcp=await call("ccp_v1_calendar_slots_delete",{
  slotId:secondId,confirmed:true,
 });
 expect(viaMcp.error).toBeUndefined();
 expect(viaMcp.data.ok).toBe(true);
 const browser=await page.request.get("/api/schedule/slots?studentId="+studentId);
 expect(browser.status(),await browser.text()).toBe(200);
 expect((await browser.json() as Array<{id:string}>).some(x=>x.id===secondId)).toBe(false);
});
