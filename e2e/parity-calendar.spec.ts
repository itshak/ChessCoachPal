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
