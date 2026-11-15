import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {planCanonicalOccurrences, type CanonicalSlot}
  from "../lib/server/canonical-calendar-service";

test("SCHEMA: one canonical session per recurrence identity, no teacher-owned duplicate on replay",async({page,request})=>{
 // A fresh authenticated owner is the isolation boundary, not a randomly
 // chosen date on the shared seed teacher's calendar.
 const credentials={
  email:"canonical-slot-"+randomUUID()+"@example.com",
  password:"Canonical-test-"+randomUUID(),
 };
 const signup=await request.post("/api/auth/signup",{data:{
  email:credentials.email,password:credentials.password,
  displayName:"Canonical Slot E2E",timezone:"UTC",
 }});
 expect(signup.status(),await signup.text()).toBe(200);
 expect(await signup.json()).toMatchObject({ok:true});
 const tool=await delegatedTool(page,request,undefined,credentials);
 const learner=await tool("ccp_students_create",{
  name:"Canonical slot learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(learner.error).toBeUndefined();
 const studentId=learner.data.entityId as string;
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
 const login=await db.auth.signInWithPassword(credentials);
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
 // Deliberately fixed: the newly provisioned teacher has no prior lessons,
 // making replays deterministic and independent of other acceptance tests.
 const {data:existing,error:existingError}=await db.from("teaching_sessions")
  .select("id").eq("teacher_id",teacher).limit(1);
 expect(existingError).toBeNull();
 expect(existing).toEqual([]);
 const date="2080-01-01";
 const day=new Date(date+"T00:00:00.000Z").getUTCDay();
 const enrolled=await tool("ccp_workplaces_enroll",{
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
  student_id:studentId,slot_occurrence_date:date,
 });
 expect(new Date(sessions.data![0].starts_at).toISOString()).toBe(rows[0].starts_at);
 const roster=await db.from("session_participants").select("student_id")
  .eq("session_id",sessions.data![0].id);
 expect(roster.error).toBeNull();
 expect(roster.data).toEqual([{student_id:studentId}]);
 // Real overlapping sessions must still fail: never bypass the SQL schedule
 // guard just to make the positive replay test pass.
 const {data:overlapSlot,error:overlapError}=await db.from("lesson_slots").insert({
  teacher_id:teacher,student_id:studentId,workplace_id:workplaces![0].id,
  day_of_week:day,start_time:"15:15",duration_minutes:45,
  start_date:date,end_date:date,active:true,is_home_visit:false,
 }).select("*").single();
 expect(overlapError).toBeNull();
 const overlappingRows=planCanonicalOccurrences(teacher,[overlapSlot as CanonicalSlot],
  workplaces!,workplaces![0].id,timezone,date,date);
 expect(overlappingRows).toHaveLength(1);
 const conflict=await db.rpc("ccp_canonical_slot_materialize",{p_rows:overlappingRows});
 expect(conflict.error).toMatchObject({code:"23P01",message:"SESSION_CONFLICT"});
 const {data:overlapSessions,error:overlapSessionsError}=await db.from("teaching_sessions")
  .select("id").eq("slot_id",overlapSlot!.id);
 expect(overlapSessionsError).toBeNull();
 expect(overlapSessions).toEqual([]);
 const invalid=await db.rpc("ccp_canonical_slot_materialize",{
  p_rows:[{...rows[0],teacher_id:randomUUID()}],
 });
 expect(invalid.error).not.toBeNull();
 const intact=await db.from("teaching_sessions").select("id")
  .eq("slot_id",slot.id);
 expect(intact.data).toHaveLength(1);
});
