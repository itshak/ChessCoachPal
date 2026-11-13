import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-canonical-session-edit canonical teaching session move and cancellation use the same website/MCP SQL writer",async({page,request})=>{
 const tool=await delegatedTool(page,request);
 const pupil=await tool("ccp_v1_students_create",{
  name:"Lifecycle student "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(pupil.error).toBeUndefined();
 const studentId=pupil.data.entityId as string;
 const workplace=await tool("ccp_v1_workplaces_create",{
  name:"Lifecycle workplace "+randomUUID(),timezone:"UTC",
  currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 expect((await tool("ccp_v1_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const first=new Date(Date.UTC(2088,0,1)+
   (Number.parseInt(randomUUID().slice(0,8),16)%365)*86400000)
    .toISOString().slice(0,10)+"T08:00:00.000Z";
 const created=await tool("ccp_v1_sessions_create",{
  workplaceId,studentId,title:"Lifecycle coaching",
  startsAt:first,durationMinutes:60,
  lessonNote:"Original title",idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const sessionId=created.data.entityId as string;
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 expect((await db.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const revision=await db.from("teaching_sessions")
  .select("updated_at,starts_at").eq("id",sessionId).single();
 expect(revision.error).toBeNull();
 const next=first.replace("T08:","T09:");
 const key=randomUUID();
 const web=await page.request.patch(
  "/api/coaching/sessions/"+sessionId+"/lifecycle",{
   data:{startsAt:next,durationMinutes:45,isHomeVisit:true,
     expectedUpdatedAt:revision.data!.updated_at,idempotencyKey:key},
  });
 expect(web.status(),await web.text()).toBe(200);
 const webRow=await web.json();
 expect(webRow).toMatchObject({id:sessionId,duration_minutes:45,is_home_visit:true});
 expect(new Date(webRow.starts_at).toISOString()).toBe(next);
 const replay=await tool("ccp_v1_sessions_edit",{
  sessionId,changes:{startsAt:next,durationMinutes:45,isHomeVisit:true},
  expectedUpdatedAt:revision.data!.updated_at,
  idempotencyKey:key,confirmed:true,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data).toMatchObject({
  id:sessionId,duration_minutes:45,is_home_visit:true,
 });
 expect(new Date(replay.data.starts_at).toISOString()).toBe(next);
 const stale=await tool("ccp_v1_sessions_edit",{
  sessionId,changes:{title:"Stale title"},
  expectedUpdatedAt:revision.data!.updated_at,
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(stale.error?.code).toBe("CONFLICT");
 const cancel=await tool("ccp_v1_sessions_edit",{
  sessionId,changes:{status:"cancelled"},
  expectedUpdatedAt:webRow.updated_at,
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(cancel.error).toBeUndefined();
 expect(cancel.data.status).toBe("cancelled");
 const websiteCancelled=await page.request.patch(
  "/api/coaching/sessions/"+sessionId+"/lifecycle",{
   data:{title:"Cannot rewind history",
     expectedUpdatedAt:webRow.updated_at,idempotencyKey:randomUUID()},
  });
 expect(websiteCancelled.status()).toBe(409);
 const stored=await db.from("teaching_sessions")
  .select("id,status,starts_at,duration_minutes,is_home_visit").eq("id",sessionId).single();
 expect(stored.error).toBeNull();
 expect(stored.data).toMatchObject({
  id:sessionId,status:"cancelled",duration_minutes:45,is_home_visit:true,
 });
 expect(new Date(stored.data!.starts_at).toISOString()).toBe(next);
 const preserved=await db.from("session_participants")
  .select("student_id").eq("session_id",sessionId);
 expect(preserved.error).toBeNull();
 expect(preserved.data).toEqual([{student_id:studentId}]);
});
