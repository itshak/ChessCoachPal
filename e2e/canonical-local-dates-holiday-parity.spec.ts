import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";
import {planCanonicalOccurrences,type CanonicalSlot}
 from "../lib/server/canonical-calendar-service";

/** Holidays are explicit teacher-approved occurrence cancellations, not
 * silently invented jurisdictional holiday calendars. A cancelled session
 * retains its slot/date identity and cannot reappear on materialization.
 */
test("PARITY:PARITY-canonical-local-time-dst-holiday-manual-exception honors local recurrence, protected cancellation and workplace isolation on web and MCP",async({page,request})=>{
 const tool=await delegatedTool(page,request);
 const student=await tool("ccp_v1_students_create",{
  name:"DST chess student "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const workplace=await tool("ccp_v1_workplaces_create",{
  name:"New York chess classroom "+randomUUID(),
  timezone:"America/New_York",currency:"USD",locale:"en",
  policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 expect((await tool("ccp_v1_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const dates=["2027-03-07","2027-03-14","2027-03-21"];
 const key=randomUUID();
 const input={
  studentId,workplaceId,dayOfWeek:0,startTime:"09:00",
  durationMinutes:60,startDate:dates[0],endDate:dates[2],
  rateCents:5000,isHomeVisit:false,idempotencyKey:key,
 };
 const created=await page.request.post("/api/coaching/calendar/slots",{
  data:input,
 });
 expect(created.status(),await created.text()).toBe(200);
 expect(await created.json()).toMatchObject({id:key});
 const replay=await tool("ccp_v1_recurring_slots_create",{
  ...input,confirmed:true,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data.replayed).toBe(true);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const login=await db.auth.signInWithPassword(SEED_TEACHER);
 expect(login.error).toBeNull();
 const teacherId=login.data.user!.id;
 const slot=await db.from("lesson_slots").select("*").eq("id",key).single();
 expect(slot.error).toBeNull();
 const planned=planCanonicalOccurrences(
  teacherId,[slot.data as CanonicalSlot],
  [{id:workplaceId,timezone:"America/New_York"}],
  workplaceId,"America/New_York",dates[0],dates[2],
 );
 expect(planned.map(x=>x.slot_occurrence_date)).toEqual(dates);
 expect(planned.map(x=>x.starts_at)).toEqual([
  "2027-03-07T14:00:00.000Z",
  "2027-03-14T13:00:00.000Z",
  "2027-03-21T13:00:00.000Z",
 ]);
 const made=await db.rpc("ccp_canonical_slot_materialize",{p_rows:planned});
 expect(made.error).toBeNull();
 const sessions=await db.from("teaching_sessions")
  .select("id,starts_at,status,updated_at,slot_occurrence_date")
  .eq("teacher_id",teacherId).eq("slot_id",key)
  .order("slot_occurrence_date");
 expect(sessions.error).toBeNull();
 expect(sessions.data).toHaveLength(3);
 const middle=sessions.data![1];
 expect(middle.slot_occurrence_date).toBe(dates[1]);
 // The coach manually closes one occurrence for a regional holiday.
 // The other Sunday lessons must not shift or be silently cancelled.
 const approvalId=randomUUID();
 const cancelled=await page.request.patch(
  "/api/coaching/sessions/"+middle.id+"/lifecycle",{data:{
   status:"cancelled",expectedUpdatedAt:middle.updated_at,
   idempotencyKey:approvalId,
  }});
 expect(cancelled.status(),await cancelled.text()).toBe(200);
 expect(await cancelled.json()).toMatchObject({id:middle.id,status:"cancelled"});
 const modelReplay=await tool("ccp_v1_sessions_edit",{
  sessionId:middle.id,changes:{status:"cancelled"},
  expectedUpdatedAt:middle.updated_at,idempotencyKey:approvalId,confirmed:true,
 });
 expect(modelReplay.error).toBeUndefined();
 expect(modelReplay.data.status).toBe("cancelled");
 const rematerialize=await db.rpc("ccp_canonical_slot_materialize",{
  p_rows:planned,
 });
 expect(rematerialize.error).toBeNull();
 expect(rematerialize.data.inserted).toBe(0);
 const after=await db.from("teaching_sessions")
  .select("id,starts_at,status,slot_occurrence_date")
  .eq("slot_id",key).order("slot_occurrence_date");
 expect(after.error).toBeNull();
 expect(after.data).toHaveLength(3);
 expect(after.data!.map(x=>x.status))
  .toEqual(["scheduled","cancelled","scheduled"]);
 expect(after.data![1].id).toBe(middle.id);
 expect(after.data!.map(x=>new Date(x.starts_at).toISOString()))
  .toEqual(planned.map(x=>x.starts_at));
 const website=await page.request.get("/api/coaching/calendar/slots?studentId="+studentId);
 expect(website.status(),await website.text()).toBe(200);
 const model=await tool("ccp_v1_recurring_slots_list",{studentId});
 expect(model.error).toBeUndefined();
 expect(model.data).toEqual(await website.json());
 // A different named workplace must not silently enroll this student.
 const otherWork=await tool("ccp_v1_workplaces_create",{
  name:"Other timezone school "+randomUUID(),timezone:"Europe/London",
  currency:"GBP",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(otherWork.error).toBeUndefined();
 const denied={...input,workplaceId:otherWork.data.entityId,
  idempotencyKey:randomUUID()};
 const webDenied=await page.request.post("/api/coaching/calendar/slots",{
  data:denied,
 });
 expect(webDenied.status()).toBe(404);
 const toolDenied=await tool("ccp_v1_recurring_slots_create",{
  ...denied,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(toolDenied.error?.code).toBe("NOT_FOUND");
});
