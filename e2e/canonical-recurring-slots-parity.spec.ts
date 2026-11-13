import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";
import {planCanonicalOccurrences,type CanonicalSlot}
 from "../lib/server/canonical-calendar-service";

test("PARITY: canonical recurring edits and deletes are atomic, tenant-scoped and protect attended history",
 async({page,request})=>{
 const tool=await delegatedTool(page,request);
 const student=await tool("ccp_v1_students_create",{
  name:"Recurring pupil "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const workplace=await tool("ccp_v1_workplaces_create",{
  name:"Recurring workplace "+randomUUID(),timezone:"UTC",
  currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 expect((await tool("ccp_v1_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const login=await db.auth.signInWithPassword(SEED_TEACHER);
 expect(login.error).toBeNull();
 const teacherId=login.data.user!.id;
 const offset=14+Number.parseInt(randomUUID().slice(0,8),16)%20;
 const todayUtc=Date.parse(new Date().toISOString().slice(0,10)+"T00:00:00Z");
 const startMs=todayUtc+offset*86400000;
 const firstDate=new Date(startMs).toISOString().slice(0,10);
 const secondDate=new Date(startMs+7*86400000).toISOString().slice(0,10);
 const dayOfWeek=new Date(startMs).getUTCDay();
 const {data:slot,error:slotError}=await db.from("lesson_slots").insert({
  teacher_id:teacherId,student_id:studentId,workplace_id:workplaceId,
  day_of_week:dayOfWeek,start_time:"05:00",duration_minutes:60,
  start_date:firstDate,end_date:secondDate,active:true,
  rate_cents:6500,is_home_visit:false,
 }).select("*").single();
 expect(slotError).toBeNull();
 const rows=planCanonicalOccurrences(
  teacherId,[slot as CanonicalSlot],[{id:workplaceId,timezone:"UTC"}],
  workplaceId,"UTC",firstDate,secondDate);
 expect(rows).toHaveLength(2);
 const materialized=await db.rpc("ccp_canonical_slot_materialize",{p_rows:rows});
 expect(materialized.error).toBeNull();
 const sessions=await db.from("teaching_sessions")
  .select("id,starts_at,slot_occurrence_date")
  .eq("teacher_id",teacherId).eq("slot_id",slot!.id)
  .order("slot_occurrence_date");
 expect(sessions.error).toBeNull();
 expect(sessions.data).toHaveLength(2);
 const protectedId=sessions.data![0].id;
 const initial=await page.request.get(
  "/api/coaching/calendar/slots?studentId="+studentId);
 expect(initial.status(),await initial.text()).toBe(200);
 const initialList=await initial.json();
 expect(initialList.some((r:{id:string})=>r.id===slot!.id)).toBe(true);
 const modelList=await tool("ccp_v1_recurring_slots_list",{studentId});
 expect(modelList.error).toBeUndefined();
 expect(modelList.data).toEqual(initialList);
 const attended=await page.request.put(
  "/api/coaching/sessions/"+protectedId+"/attendance",{
   data:{studentId,status:"present",note:"",
    noticeAt:null,cancelReason:"",expectedUpdatedAt:null,
    notifyFamily:false,idempotencyKey:randomUUID()},
  });
 expect(attended.status(),await attended.text()).toBe(200);
 const change={changes:{startTime:"06:00"},
  expectedUpdatedAt:slot!.updated_at,idempotencyKey:randomUUID()};
 const changed=await page.request.patch(
  "/api/coaching/calendar/slots/"+slot!.id,{data:change});
 expect(changed.status(),await changed.text()).toBe(200);
 expect((await changed.json()).replayed).toBe(false);
 const duplicate=await tool("ccp_v1_recurring_slots_update",{
  slotId:slot!.id,...change,confirmed:true,
 });
 expect(duplicate.error).toBeUndefined();
 expect(duplicate.data.replayed).toBe(true);
 const after=await db.from("teaching_sessions")
  .select("id,slot_id,slot_occurrence_date,starts_at")
  .eq("teacher_id",teacherId).eq("slot_id",slot!.id)
  .order("slot_occurrence_date");
 expect(after.error).toBeNull();
 expect(after.data).toHaveLength(2);
 expect(after.data![0]).toMatchObject({
  id:protectedId,slot_occurrence_date:firstDate,
  starts_at:rows[0].starts_at,
 });
 expect(after.data![1].id).not.toBe(sessions.data![1].id);
 expect(new Date(after.data![1].starts_at).toISOString())
  .toBe(secondDate+"T06:00:00.000Z");
 const stale=await tool("ccp_v1_recurring_slots_update",{
  slotId:slot!.id,changes:{startTime:"07:00"},
  expectedUpdatedAt:slot!.updated_at,idempotencyKey:randomUUID(),
  confirmed:true,
 });
 expect(stale.error?.code).toBe("CONFLICT");
 const delKey=randomUUID();
 const deleted=await tool("ccp_v1_recurring_slots_delete",{
  slotId:slot!.id,idempotencyKey:delKey,confirmed:true,
 });
 expect(deleted.error).toBeUndefined();
 expect(deleted.data.ok).toBe(true);
 expect(deleted.data.preserved).toBeGreaterThanOrEqual(1);
 const deleteRetry=await page.request.delete(
  "/api/coaching/calendar/slots/"+slot!.id,{
   data:{idempotencyKey:delKey},
  });
 expect(deleteRetry.status(),await deleteRetry.text()).toBe(200);
 expect((await deleteRetry.json()).replayed).toBe(true);
 const preserved=await db.from("teaching_sessions")
  .select("id,slot_id").eq("id",protectedId).single();
 expect(preserved.error).toBeNull();
 expect(preserved.data).toMatchObject({id:protectedId,slot_id:null});
 const removed=await db.from("teaching_sessions")
  .select("id").eq("id",after.data![1].id).maybeSingle();
 expect(removed.error).toBeNull();
 expect(removed.data).toBeNull();
 const foreign=await tool("ccp_v1_recurring_slots_update",{
  slotId:randomUUID(),changes:{startTime:"08:00"},
  expectedUpdatedAt:slot!.updated_at,idempotencyKey:randomUUID(),
  confirmed:true,
 });
 expect(foreign.error?.code).toBe("NOT_FOUND");
});
