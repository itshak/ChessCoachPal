import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-students-teaching-memory reads canonical private notes, attendance and skills",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_v1_students_create",{
   name:"Canonical teaching memory "+randomUUID(),
   idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const workplace=await call("ccp_v1_workplaces_create",{
   name:"Teaching history "+randomUUID(),timezone:"UTC",
   currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 const enrolled=await call("ccp_v1_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:randomUUID(),
 });
 expect(enrolled.error).toBeUndefined();
 const modern=await call("ccp_v1_sessions_create",{
   workplaceId,studentId,title:"Endgame planning",
   startsAt:"2042-07-10T15:00:00.000Z",durationMinutes:45,
   lessonNote:"King opposition",idempotencyKey:randomUUID(),
 });
 expect(modern.error).toBeUndefined();
 const sessionId=modern.data.entityId as string;
 const noteInput={studentId,body:"Practiced knight forks",
   privateBody:"Coach: review calculation discipline",
   sharedWithGuardian:false,sendEmail:false,
   expectedUpdatedAt:null,idempotencyKey:randomUUID()};
 const siteNoteSave=await page.request.put(
   "/api/coaching/sessions/"+sessionId+"/notes",{data:noteInput});
 expect(siteNoteSave.status(),await siteNoteSave.text()).toBe(200);
 const plainNote=await call("ccp_v1_session_notes_list",{
   sessionId,includePrivate:false,
 });
 expect(plainNote.error).toBeUndefined();
 expect(plainNote.data[0].body).toBe(noteInput.body);
 expect(plainNote.data[0]).not.toHaveProperty("private_body");
 const privateNote=await call("ccp_v1_session_notes_list",{
   sessionId,includePrivate:true,confirmed:true,
 });
 expect(privateNote.error).toBeUndefined();
 expect(privateNote.data[0].private_body).toContain("calculation discipline");
 const privateSite=await page.request.get(
   "/api/coaching/sessions/"+sessionId+"/notes?includePrivate=true&confirmed=true");
 expect(privateSite.status(),await privateSite.text()).toBe(200);
 expect(privateNote.data).toEqual(await privateSite.json());
 const attendanceUrl="/api/coaching/sessions/"+sessionId+"/attendance";
 const markedCanonical=await page.request.put(attendanceUrl,{data:{
   studentId,status:"present",note:"Excellent preparation",
   noticeAt:null,cancelReason:"",expectedUpdatedAt:null,
   idempotencyKey:randomUUID(),notifyFamily:false,confirmed:true,
 }});
 expect(markedCanonical.status(),await markedCanonical.text()).toBe(200);
 const siteAttendance=await page.request.get(attendanceUrl);
 expect(siteAttendance.status(),await siteAttendance.text()).toBe(200);
 const mcpAttendance=await call("ccp_v1_session_attendance_list",{sessionId});
 expect(mcpAttendance.error).toBeUndefined();
 expect(mcpAttendance.data).toEqual(await siteAttendance.json());
 expect(mcpAttendance.data[0].status).toBe("present");
 const marked=await page.request.post("/api/agent/v1",{
   data:{action:"attendance.record",sessionId,studentId,
     status:"present",note:"Excellent preparation"},
 });
 expect(marked.status(),await marked.text()).toBe(200);
 const participants=await page.request.post("/api/agent/v1",{
   data:{action:"sessions.participants",sessionId},
 });
 expect(participants.status(),await participants.text()).toBe(200);
 const mcpParticipants=await call("ccp_v1_sessions_participants",{sessionId});
 expect(mcpParticipants.error).toBeUndefined();
 expect(mcpParticipants.data).toEqual((await participants.json()).data);
 const dimension=await call("ccp_v1_skill_dimensions_create",{
   name:"Calculation "+randomUUID(),confirmed:true,
 });
 expect(dimension.error).toBeUndefined();
 const dimensionId=dimension.data.id as string;
 const assessment=await call("ccp_v1_student_skill_assessments_record",{
   studentId,ratings:[{dimensionId,rating:4,note:"After two lessons"}],
   confirmed:true,
 });
 expect(assessment.error).toBeUndefined();
 const skillsSite=await page.request.get("/api/students/"+studentId+"/skills");
 expect(skillsSite.status(),await skillsSite.text()).toBe(200);
 const skillsMcp=await call("ccp_v1_student_skill_assessments_list",{studentId});
 expect(skillsMcp.error).toBeUndefined();
 expect(skillsMcp.data).toEqual(await skillsSite.json());
 expect(skillsMcp.data.some((x:{rating:number})=>x.rating===4)).toBe(true);
 const query={from:"2042-07-10",to:"2042-07-10",studentId};
 const browser=await page.request.get(
   "/api/coaching/unified-lessons?"+new URLSearchParams(query));
 expect(browser.status(),await browser.text()).toBe(200);
 const site=await browser.json();
 const history=await call("ccp_v1_lessons_history_unified",query);
 expect(history.error).toBeUndefined();
 expect(history.data).toEqual(site);
 expect(site.summary.canonicalSessionCount).toBe(1);
 expect(site.total).toBe(1);
});
