import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-mcp-completed-group-capture one verified lesson and distinct student notes",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const tag=randomUUID().slice(0,8);
 const club=await call("ccp_workplaces_create",{
  name:"Completed workflow "+tag,timezone:"Asia/Jerusalem",currency:"ILS",locale:"he",
  policy:{},idempotencyKey:randomUUID(),
 });
 expect(club.error).toBeUndefined();
 const workplaceId=club.data.entityId as string;
 const names=["דניאל "+tag,"Michael "+tag];
 const studentIds:string[]=[];
 for(const name of names){
  const row=await call("ccp_students_create",{name,idempotencyKey:randomUUID()});
  expect(row.error).toBeUndefined();
  studentIds.push(row.data.entityId);
  const enrollment=await call("ccp_workplaces_enroll",{
   workplaceId,studentId:row.data.entityId,idempotencyKey:randomUUID(),
  });
  expect(enrollment.error).toBeUndefined();
 }
 const title="Lucena completed "+tag;
 // Prior E2E sessions are retained on the seeded teacher. Use a unique
 // verified instructor interval instead of colliding with the finance group
 // suites that exercise the same 2046-02-05 timestamp.
 const offset=Number.parseInt(randomUUID().slice(0,8),16)%1000;
 const localDate=new Date(Date.UTC(2095,0,1)+offset*86400000)
  .toISOString().slice(0,10);
 const startsAt=localDate+"T09:00:00+02:00";
 const previewRequest={names,workplaceId,title,startsAt,durationMinutes:90,
  lessonNote:"Group rook endings, explicit individual note below"};
 const webPreview=await page.request.post("/api/coaching/lesson-capture/preview",{data:previewRequest});
 expect(webPreview.status(),await webPreview.text()).toBe(200);
 const preview=await webPreview.json();
 expect(preview.canCommit).toBe(true);
 expect(preview.proposedSession).toMatchObject({workplaceId,studentIds,durationMinutes:90});
 const mcpPreview=await call("ccp_lessons_capture_preview",previewRequest);
 expect(mcpPreview.error).toBeUndefined();
 expect(mcpPreview.data).toEqual(preview);
 const payload={...preview.proposedSession,
  attendance:[
   {studentId:studentIds[0],status:"present",note:"Daniel needs more practice on Lucena"},
   {studentId:studentIds[1],status:"present",note:"Michael followed the worked example"},
  ],requestId:randomUUID(),confirmed:true};
 const website=await page.request.post("/api/coaching/lesson-capture/completed",{data:payload});
 expect(website.status(),await website.text()).toBe(200);
 const receipt=await website.json();
 expect(receipt).toMatchObject({status:"completed",rosterMode:"ad_hoc",
  participantCount:2,instructorMinutes:90,oneTransaction:true,inferredMastery:false,replayed:false});
 expect(receipt.attendance).toEqual([
  {studentId:studentIds[0],status:"present",hasNote:true},
  {studentId:studentIds[1],status:"present",hasNote:true},
 ]);
 const replay=await call("ccp_lessons_capture_completed",payload);
 expect(replay.error).toBeUndefined();
 expect(replay.data).toMatchObject({...receipt,replayed:true});
 const sessions=await call("ccp_sessions_list",{query:title,workplaceId});
 expect(sessions.error).toBeUndefined();
 expect(sessions.data.filter((s:{id:string})=>s.id===receipt.sessionId)).toHaveLength(1);
 const details=await call("ccp_sessions_details",{sessionId:receipt.sessionId});
 expect(details.error).toBeUndefined();
 expect(details.data.status).toBe("completed");
 expect(details.data.duration_minutes).toBe(90);
 const register=await call("ccp_attendance_preview",{sessionId:receipt.sessionId});
 expect(register.error).toBeUndefined();
 const rows=register.data.attendance as Array<{student_id:string;status:string;note:string}>;
 expect(rows).toHaveLength(2);
 expect(rows.find(r=>r.student_id===studentIds[0])).toMatchObject({
  status:"present",note:"Daniel needs more practice on Lucena"});
 expect(rows.find(r=>r.student_id===studentIds[1])).toMatchObject({
  status:"present",note:"Michael followed the worked example"});

 // The ordinary next-lesson briefing must now surface the teacher's
 // student-specific attendance note without exposing the other learner's note.
 const briefingInput={studentId:studentIds[0],from:localDate,to:localDate};
 const briefing=await call("ccp_coach_briefing_get",briefingInput);
 expect(briefing.error).toBeUndefined();
 expect(briefing.data.lessonHistory.participantNotes).toEqual([
  expect.objectContaining({sessionId:receipt.sessionId,status:"present",
   note:"Daniel needs more practice on Lucena"}),
 ]);
 expect(JSON.stringify(briefing.data)).not.toContain(
  "Michael followed the worked example");
 const webBriefing=await page.request.get("/api/coaching/briefing?"+
  new URLSearchParams(briefingInput));
 expect(webBriefing.status(),await webBriefing.text()).toBe(200);
 expect(await webBriefing.json()).toEqual(briefing.data);

 const changed=await call("ccp_lessons_capture_completed",{
  ...payload,lessonNote:"A changed payload for the same UUID",
 });
 expect(changed.error?.code).toBe("CONFLICT");
 const saved=await call("ccp_sessions_details",{sessionId:receipt.sessionId});
 expect(saved.data.lesson_note).toBe(payload.lessonNote);
 const materialHistory=await call("ccp_materials_history_list",{sessionId:receipt.sessionId});
 expect(materialHistory.error).toBeUndefined();
 expect(materialHistory.data.total).toBe(0);
});

test("PARITY:PARITY-mcp-completed-group-validation rejects missing or duplicated attendance without writing",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const a=randomUUID(),b=randomUUID(),workplaceId=randomUUID();
 const base={workplaceId,studentIds:[a,b],title:"Invalid completed group",
  startsAt:"2046-02-06T09:00:00+02:00",durationMinutes:90,lessonNote:"",
  requestId:randomUUID(),confirmed:true};
 const bad={...base,attendance:[{studentId:a,status:"present"}]};
 const website=await page.request.post("/api/coaching/lesson-capture/completed",{data:bad});
 expect(website.status()).toBe(400);
 const mcp=await call("ccp_lessons_capture_completed",bad);
 expect(mcp.error?.code).toBe("VALIDATION_ERROR");
 const duplicate=await call("ccp_lessons_capture_completed",{
  ...base,studentIds:[a,a],
  attendance:[{studentId:a,status:"present"},{studentId:a,status:"present"}],
 });
 expect(duplicate.error?.code).toBe("VALIDATION_ERROR");
 const foreign=await call("ccp_lessons_capture_completed",{
  ...base,attendance:[{studentId:a,status:"present"},{studentId:b,status:"present"}],
 });
 expect(foreign.error?.code).toBe("NOT_FOUND");
});

test("PARITY:PARITY-mcp-tool-scope-discovery read-scoped external preview retains listing",async({page,request})=>{
 const tool=await delegatedTool(page,request,"coach:read");
 const browser=await page.request.get("/api/students?limit=1");
 expect(browser.status(),await browser.text()).toBe(200);
 const listed=await tool.listTools();
 const names=listed.map((t:{name:string})=>t.name);
 expect(names).toContain("ccp_student_ratings_refresh_preview");
 expect(names).toContain("ccp_lichess_image_fen_propose");
 expect(names).toContain("ccp_lessons_capture_preview");
 expect(names).toContain("ccp_materials_lesson_use_preview");
 expect(names).not.toContain("ccp_lessons_capture_completed");
 expect(names).not.toContain("ccp_materials_lesson_use_commit");
 const denied=await tool("ccp_lessons_capture_completed",{
  workplaceId:randomUUID(),studentIds:[randomUUID(),randomUUID()],
  title:"Unauthorized write",startsAt:"2046-02-05T09:00:00+02:00",
  durationMinutes:90,lessonNote:"",
  attendance:[],requestId:randomUUID(),confirmed:true,
 });
 // A guessed write remains denied even if the input is invalid.
 expect(denied.error?.code).toBe("FORBIDDEN");
});
