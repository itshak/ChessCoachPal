import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-students-teaching-memory reads both lesson models, private notes, attendance and skills",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_v1_students_create",{
   name:"Two-model teaching memory "+randomUUID(),
   idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const legacy=await call("ccp_v1_calendar_lessons_create",{
   studentId,date:"2042-07-10",time:"10:00",durationMinutes:45,
   confirmed:true,
 });
 expect(legacy.error).toBeUndefined();
 const lessonId=legacy.data.id as string;
 const websiteNote=await page.request.put(
   "/api/schedule/lessons/"+lessonId+"/note",{
     data:{body:"Practiced knight forks",
       privateBody:"Coach: review calculation discipline",sendEmail:false},
   });
 expect(websiteNote.status(),await websiteNote.text()).toBe(200);
 const browserAttendance=await page.request.post("/api/schedule/attendance/bulk",{
   data:{ids:[lessonId],status:"attended",notifyFamily:false},
 });
 expect(browserAttendance.status(),await browserAttendance.text()).toBe(200);
 expect((await browserAttendance.json()).succeeded).toBe(1);
 const mcpAttendance=await call("ccp_v1_calendar_attendance_read",{lessonId});
 expect(mcpAttendance.error).toBeUndefined();
 const siteAttendance=await page.request.get("/api/schedule/lessons/"+lessonId+"/attendance");
 expect(siteAttendance.status(),await siteAttendance.text()).toBe(200);
 expect(mcpAttendance.data).toEqual(await siteAttendance.json());
 expect(mcpAttendance.data.status).toBe("attended");
 const ordinary=await call("ccp_v1_calendar_lesson_note_read",{lessonId});
 expect(ordinary.error).toBeUndefined();
 expect(ordinary.data.body).toBe("Practiced knight forks");
 expect(ordinary.data.private_body).toBeUndefined();
 const privateRead=await call("ccp_v1_calendar_lesson_note_read",{
   lessonId,includePrivate:true,confirmed:true,
 });
 expect(privateRead.error).toBeUndefined();
 const siteNote=await page.request.get("/api/schedule/lessons/"+lessonId+"/note");
 expect(siteNote.status(),await siteNote.text()).toBe(200);
 expect(privateRead.data).toEqual(await siteNote.json());
 expect(privateRead.data.private_body).toContain("calculation discipline");
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
 expect(site.summary.coachingSessionCount).toBe(1);
 expect(site.summary.unattributedLegacyLessonCount).toBe(1);
 expect(site.total).toBe(2);
});
