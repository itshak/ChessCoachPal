import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: canonical attendance, cancellation provenance and teacher-private notes survive reviewed portable restore",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_v1_students_create",{
  name:"Backup attendance learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const workplace=await call("ccp_v1_workplaces_create",{
  name:"Backup canonical workplace "+randomUUID(),timezone:"UTC",
  currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 expect((await call("ccp_v1_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const date=new Date(Date.UTC(2094,0,1)+
  (Number.parseInt(randomUUID().slice(0,8),16)%730)*86400000)
   .toISOString().slice(0,10);
 const created=await call("ccp_v1_sessions_create",{
  workplaceId,studentId,title:"Recoverable private chess lesson",
  startsAt:date+"T10:00:00Z",durationMinutes:60,
  lessonNote:"",idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const sessionId=created.data.entityId as string;
 const original=await call("ccp_v1_session_attendance_set",{
  sessionId,studentId,status:"present",note:"Original decision",
  noticeAt:null,cancelReason:"",expectedUpdatedAt:null,
  notifyFamily:false,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(original.error).toBeUndefined();
 const noteKey=randomUUID(),privateText="Teacher-only strategy "+randomUUID();
 const note=await call("ccp_v1_session_notes_save",{
  sessionId,studentId,body:"Guardian-facing endgame advice",
  privateBody:privateText,sharedWithGuardian:false,
  sendEmail:false,expectedUpdatedAt:null,
  idempotencyKey:noteKey,confirmed:true,
 });
 expect(note.error).toBeUndefined();
 const exportReply=await page.request.get("/api/settings/export");
 expect(exportReply.status(),await exportReply.text()).toBe(200);
 const exported=await exportReply.json();
 const snapAttendance=(exported.tables.session_attendance as Array<Record<string,unknown>>)
   .filter(x=>x.session_id===sessionId&&x.student_id===studentId);
 const snapNotes=(exported.tables.session_notes as Array<Record<string,unknown>>)
   .filter(x=>x.session_id===sessionId&&x.student_id===studentId);
 expect(snapAttendance).toHaveLength(1);
 expect(snapAttendance[0].status).toBe("present");
 expect(snapNotes).toHaveLength(1);
 expect(snapNotes[0].private_body).toBe(privateText);
 expect(exported.tables).not.toHaveProperty("lessons");
 expect(exported.tables).not.toHaveProperty("attendance");
 expect(exported.tables).not.toHaveProperty("lesson_notes");
 const corrected=await call("ccp_v1_session_attendance_set",{
  sessionId,studentId,status:"late",note:"Temporary correction",
  noticeAt:null,cancelReason:"",
  expectedUpdatedAt:original.data.revision,
  notifyFamily:false,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(corrected.error).toBeUndefined();
 const noteChanged=await call("ccp_v1_session_notes_save",{
  sessionId,studentId,body:"Temporary overwrite",
  privateBody:"Replaceable temporary note",sharedWithGuardian:false,
  sendEmail:false,expectedUpdatedAt:note.data.revision,
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(noteChanged.error).toBeUndefined();
 const payload={
  teacherId:exported.teacherId,exportedAt:new Date().toISOString(),
  tables:{session_attendance:snapAttendance,session_notes:snapNotes},
 };
 const preview=await page.request.put("/api/settings/import",{data:{payload}});
 expect(preview.status(),await preview.text()).toBe(200);
 const digest=(await preview.json()).sha256 as string;
 const restored=await call("ccp_v1_settings_import_apply",{
  payload,expectedSha256:digest,confirmed:true,
 });
 expect(restored.error).toBeUndefined();
 expect(restored.data.counts).toMatchObject({session_attendance:1,session_notes:1});
 const website=await page.request.get(
  "/api/coaching/sessions/"+sessionId+"/attendance");
 expect(website.status(),await website.text()).toBe(200);
 expect((await website.json()).find((x:{studentId:string})=>
   x.studentId===studentId).status).toBe("present");
 const noteRead=await call("ccp_v1_session_notes_list",{
  sessionId,includePrivate:true,confirmed:true,
 });
 expect(noteRead.error).toBeUndefined();
 expect(noteRead.data.find((x:{student_id:string})=>
  x.student_id===studentId)).toMatchObject({
  body:"Guardian-facing endgame advice",private_body:privateText,
 });
 const denied=await call("ccp_v1_settings_import_apply",{
  payload:{...payload,exportedAt:new Date().toISOString(),
   tables:{session_notes:[{...snapNotes[0],session_id:randomUUID()}]}},
  expectedSha256:digest,confirmed:true,
 });
 expect(denied.error).toBeDefined();
 const direct=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 expect((await direct.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const bypass=await direct.rpc("ccp_backup_upsert_protected",{
  p_table:"session_attendance",p_source:snapAttendance[0],
 });
 expect(bypass.error).not.toBeNull();
});
