import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

/** One approved teacher note queues exactly one immutable intent; neither an
 * unapproved family note nor teacher-private notes ever enter its payload.
 * The delivery worker uses only service-role SQL claims, never delegated MCP.
 */
test("SECURITY: canonical note approval queues deduplicated private-safe delivery, not direct email",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=(await call("ccp_v1_students_create",{
  name:"Outbox learner "+randomUUID(),idempotencyKey:randomUUID(),
 }));
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const guardian=await call("ccp_v1_guardians_create",{
  name:"Outbox guardian "+randomUUID(),studentIds:[studentId],confirmed:true,
 });
 expect(guardian.error).toBeUndefined();
 const workplace=await call("ccp_v1_workplaces_create",{
  name:"Outbox workplace "+randomUUID(),timezone:"UTC",currency:"USD",
  locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 expect((await call("ccp_v1_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const session=await call("ccp_v1_sessions_create",{
  workplaceId,studentId,title:"Approved teaching notes",
  startsAt:"2061-10-02T11:00:00Z",durationMinutes:30,
  lessonNote:"",idempotencyKey:randomUUID(),
 });
 expect(session.error).toBeUndefined();
 const sessionId=session.data.entityId as string;
 const secret="Private teacher detail "+randomUUID();
 const key=randomUUID();
 const input={sessionId,studentId,body:"Practised rook endings",
  privateBody:secret,sharedWithGuardian:true,
  sendEmail:true,confirmedEmail:true,expectedUpdatedAt:null,
  idempotencyKey:key,confirmed:true};
 const site=await page.request.put("/api/coaching/sessions/"+sessionId+"/notes",{
  data:input,
 });
 expect(site.status(),await site.text()).toBe(200);
 expect(await site.json()).toMatchObject({emailQueued:true,replayed:false});
 const replay=await call("ccp_v1_session_notes_save",input);
 expect(replay.error).toBeUndefined();
 expect(replay.data).toMatchObject({emailQueued:true,replayed:true});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 expect((await db.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const denied=await db.rpc("ccp_outbox_claim",{p_limit:10});
 expect(denied.error).not.toBeNull();
 const unauthorized=await db.from("ccp_delivery_outbox").select("payload")
  .eq("session_id",sessionId);
 expect(unauthorized.error).not.toBeNull();
 const service=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const {data:queued,error:lookup}=await service.from("ccp_delivery_outbox")
  .select("id,event_key,kind,state,payload,attempts")
  .eq("session_id",sessionId);
 expect(lookup).toBeNull();
 expect(queued).toHaveLength(1);
 expect(queued![0]).toMatchObject({
  event_key:"session-note:"+key,kind:"session_note_family",
  state:"pending",attempts:0,
 });
 const serialized=JSON.stringify(queued![0].payload);
 expect(serialized).toContain("Practised rook endings");
 expect(serialized).not.toContain(secret);
 const reader=await call("ccp_v1_session_notes_list",{sessionId});
 expect(reader.error).toBeUndefined();
 expect(reader.data[0]).not.toHaveProperty("private_body");
});
