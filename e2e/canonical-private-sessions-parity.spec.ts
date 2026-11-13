import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-canonical-private-makeup canonical private lesson and verified make-up use one website/MCP SQL writer",
 async({page,request})=>{
 const call=await delegatedTool(page,request);
 const pupil=await call("ccp_v1_students_create",{
  name:"Make-up pupil "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(pupil.error).toBeUndefined();
 const studentId=pupil.data.entityId as string;
 const workplace=await call("ccp_v1_workplaces_create",{
  name:"Make-up school "+randomUUID(),timezone:"UTC",currency:"USD",
  locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 expect((await call("ccp_v1_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const key=randomUUID();
 const create={
  studentId,workplaceId,date:"2079-09-10",time:"09:15",
  durationMinutes:45,isHomeVisit:true,idempotencyKey:key,
 };
 const web=await page.request.post("/api/coaching/calendar/private-sessions",{
  data:create,
 });
 expect(web.status(),await web.text()).toBe(200);
 const first=await web.json();
 expect(first).toMatchObject({
  student_id:studentId,workplace_id:workplaceId,
  duration_minutes:45,is_home_visit:true,replayed:false,
 });
 const replay=await call("ccp_v1_private_sessions_create",{
  ...create,confirmed:true,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data.id).toBe(first.id);
 expect(replay.data.replayed).toBe(true);
 const changed=await call("ccp_v1_private_sessions_create",{
  ...create,date:"2079-09-11",confirmed:true,
 });
 expect(changed.error?.code).toBe("CONFLICT");
 const auth=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 expect((await auth.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const roster=await auth.from("session_participants").select("student_id")
  .eq("session_id",first.id);
 expect(roster.error).toBeNull();
 expect(roster.data).toEqual([{student_id:studentId}]);
 const cancel=await page.request.put(
  "/api/coaching/sessions/"+first.id+"/attendance",{
   data:{
    studentId,status:"teacher_cancelled",note:"",
    cancelReason:"Teacher unavailable",noticeAt:null,
    expectedUpdatedAt:null,idempotencyKey:randomUUID(),
    notifyFamily:false,
   },
  });
 expect(cancel.status(),await cancel.text()).toBe(200);
 const makeupRequest={
  studentId,workplaceId,date:"2079-09-18",time:"08:00",
  isHomeVisit:false,makeupForSessionId:first.id,idempotencyKey:randomUUID(),
 };
 const makeup=await call("ccp_v1_private_sessions_create",{
  ...makeupRequest,confirmed:true,
 });
 expect(makeup.error).toBeUndefined();
 expect(makeup.data).toMatchObject({
  makeup_for_session_id:first.id,makeup_for_student_id:studentId,
  duration_minutes:45,replayed:false,
 });
 const websiteReplay=await page.request.post(
  "/api/coaching/calendar/private-sessions",{data:makeupRequest});
 expect(websiteReplay.status(),await websiteReplay.text()).toBe(200);
 expect((await websiteReplay.json()).replayed).toBe(true);
 const double=await page.request.post("/api/coaching/calendar/private-sessions",{
  data:{...makeupRequest,idempotencyKey:randomUUID(),time:"10:00"},
 });
 expect(double.status()).toBe(409);
 const foreign=await call("ccp_v1_private_sessions_create",{
  ...create,studentId:randomUUID(),idempotencyKey:randomUUID(),
  confirmed:true,
 });
 expect(foreign.error?.code).toBe("NOT_FOUND");
 const ny=await call("ccp_v1_workplaces_create",{
  name:"DST workplace "+randomUUID(),timezone:"America/New_York",
  currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(ny.error).toBeUndefined();
 expect((await call("ccp_v1_workplaces_enroll",{
  workplaceId:ny.data.entityId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const invalidDST=await page.request.post(
  "/api/coaching/calendar/private-sessions",{data:{
   studentId,workplaceId:ny.data.entityId,
   date:"2027-03-14",time:"02:30",
   durationMinutes:45,idempotencyKey:randomUUID(),
  }});
 expect(invalidDST.status(),await invalidDST.text()).toBe(400);
});

test("PARITY:PARITY-canonical-personal-private-lesson accepts an unassigned student in implicit personal coaching",async({page,request})=>{
 const tool=await delegatedTool(page,request);
 const student=await tool("ccp_v1_students_create",{
  name:"Unassigned personal lesson learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 // No workplace enrollment: personal/private lessons must work for a
 // newly created student, while explicit school workplaces remain scoped.
 const key=randomUUID();
 const input={studentId,workplaceId:null,date:"2081-05-12",
  time:"10:00",durationMinutes:45,isHomeVisit:false,idempotencyKey:key};
 const browser=await page.request.post("/api/coaching/calendar/private-sessions",{data:input});
 expect(browser.status(),await browser.text()).toBe(200);
 const created=await browser.json();
 expect(created).toMatchObject({student_id:studentId,replayed:false});
 const replay=await tool("ccp_v1_private_sessions_create",{...input,confirmed:true});
 expect(replay.error).toBeUndefined();
 expect(replay.data).toMatchObject({id:created.id,replayed:true});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 expect((await db.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const person=await db.from("session_participants").select("student_id")
  .eq("session_id",created.id).single();
 expect(person.error).toBeNull();
 expect(person.data?.student_id).toBe(studentId);
});
