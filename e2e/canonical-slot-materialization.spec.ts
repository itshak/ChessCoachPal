import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";
import {planCanonicalOccurrences, type CanonicalSlot}
  from "../lib/server/canonical-calendar-service";

test("SCHEMA: one canonical session per recurrence identity, no teacher-owned duplicate on replay",async({page,request})=>{
 const tool=await delegatedTool(page,request);
 const learner=await tool("ccp_v1_students_create",{
  name:"Canonical slot learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(learner.error).toBeUndefined();
 const studentId=learner.data.entityId as string;
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
 const login=await db.auth.signInWithPassword(SEED_TEACHER);
 expect(login.error).toBeNull();
 const teacher=login.data.user!.id;
 const {data:workplaces,error:workError}=await db.from("workplaces")
  .select("id,timezone").eq("teacher_id",teacher)
  .order("created_at").order("id");
 expect(workError).toBeNull();
 expect(workplaces?.length).toBeGreaterThan(0);
 const {data:policy,error:policyError}=await db.from("studio_policies")
  .select("timezone").eq("teacher_id",teacher).maybeSingle();
 expect(policyError).toBeNull();
 const timezone=policy?.timezone ?? "UTC";
 // Isolate this fixture from parallel tests and retries, while still
 // asserting idempotency for one stable slot/date inside the test.
 const date=new Date(Date.UTC(2080,0,1)+
  (Number.parseInt(randomUUID().slice(0,8),16)%1200)*86400000).toISOString().slice(0,10);
 const day=new Date(date+"T00:00:00.000Z").getUTCDay();
 const enrolled=await tool("ccp_v1_workplaces_enroll",{
  workplaceId:workplaces![0].id,studentId,idempotencyKey:randomUUID(),
 });
 expect(enrolled.error).toBeUndefined();
 const {data:slot,error:slotError}=await db.from("lesson_slots").insert({
   teacher_id:teacher,student_id:studentId,
   workplace_id:workplaces![0].id,day_of_week:day,
   start_time:"15:00",duration_minutes:45,start_date:date,end_date:date,
   active:true,is_home_visit:false,
  }).select("*").single();
 expect(slotError).toBeNull();
 const rows=planCanonicalOccurrences(teacher,[slot as CanonicalSlot],
    workplaces!,workplaces![0].id,timezone,date,date);
 expect(rows).toHaveLength(1);
 const first=await db.rpc("ccp_canonical_slot_materialize",{p_rows:rows});
 expect(first.error).toBeNull();
 expect(first.data).toMatchObject({planned:1,inserted:1});
 const replay=await db.rpc("ccp_canonical_slot_materialize",{p_rows:rows});
 expect(replay.error).toBeNull();
 expect(replay.data).toMatchObject({planned:1,inserted:0});
 const sessions=await db.from("teaching_sessions").select(
  "id,student_id,slot_id,slot_occurrence_date,starts_at"
 ).eq("slot_id",slot.id);
 expect(sessions.error).toBeNull();
 expect(sessions.data).toHaveLength(1);
 expect(sessions.data![0]).toMatchObject({
  student_id:studentId,slot_occurrence_date:date,starts_at:rows[0].starts_at,
 });
 const roster=await db.from("session_participants").select("student_id")
  .eq("session_id",sessions.data![0].id);
 expect(roster.error).toBeNull();
 expect(roster.data).toEqual([{student_id:studentId}]);
 const invalid=await db.rpc("ccp_canonical_slot_materialize",{
  p_rows:[{...rows[0],teacher_id:randomUUID()}],
 });
 expect(invalid.error).not.toBeNull();
 const intact=await db.from("teaching_sessions").select("id")
  .eq("slot_id",slot.id);
 expect(intact.data).toHaveLength(1);
});
