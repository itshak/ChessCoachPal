import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {SEED_TEACHER} from "./helpers/auth";

test("SECURITY: approved canonical note intent is durable, private, and unique on website/MCP replay",
 async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_v1_students_create",{
  name:"Outbox recipient "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const family=await call("ccp_v1_guardians_create",{
  name:"Outbox family "+randomUUID(),studentIds:[studentId],confirmed:true,
 });
 expect(family.error).toBeUndefined();
 const workplace=await call("ccp_v1_workplaces_create",{
  name:"Outbox studio "+randomUUID(),timezone:"UTC",currency:"USD",
  locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 expect((await call("ccp_v1_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const session=await call("ccp_v1_sessions_create",{
  workplaceId,studentId,title:"Outbox consent check",
  startsAt:"2080-10-14T13:00:00Z",durationMinutes:60,
  lessonNote:"",idempotencyKey:randomUUID(),
 });
 expect(session.error).toBeUndefined();
 const sessionId=session.data.entityId as string;
 const key=randomUUID(),shared="Teacher approved family note "+randomUUID();
 const body={
  studentId,body:shared,privateBody:"Do not email this coaching observation",
  sharedWithGuardian:true,sendEmail:true,confirmedEmail:true,
  expectedUpdatedAt:null,idempotencyKey:key,
 };
 const put=await page.request.put("/api/coaching/sessions/"+sessionId+"/notes",{data:body});
 expect(put.status(),await put.text()).toBe(200);
 expect((await put.json()).emailQueued).toBe(true);
 const replay=await call("ccp_v1_session_notes_save",{
  sessionId,...body,confirmed:true,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data.replayed).toBe(true);
 const anon=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const signed=createClient(anon,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 expect((await signed.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const denied=await signed.rpc("ccp_outbox_claim",{p_limit:1});
 expect(denied.error).not.toBeNull();
 const notReadable=await signed.from("ccp_delivery_outbox")
   .select("id,payload").eq("event_key","session-note:"+key);
 expect(notReadable.data??[]).toEqual([]);
 const cron=await page.request.get("/api/cron/canonical-outbox");
 expect(cron.status()).toBe(401);
 const admin=createClient(anon,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const row=await admin.from("ccp_delivery_outbox")
  .select("event_key,kind,session_id,student_id,payload,state,attempts")
  .eq("event_key","session-note:"+key);
 expect(row.error).toBeNull();
 expect(row.data).toHaveLength(1);
 expect(row.data![0]).toMatchObject({
  event_key:"session-note:"+key,kind:"session_note_family",
  session_id:sessionId,student_id:studentId,
  state:"pending",attempts:0,
 });
 expect(row.data![0].payload).toMatchObject({body:shared});
 expect(JSON.stringify(row.data![0].payload)).not.toContain(body.privateBody);
});
