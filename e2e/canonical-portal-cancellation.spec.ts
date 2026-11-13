import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: guardian cancels one frozen canonical participant, with atomic replay and no teacher impersonation",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_v1_students_create",{
  name:"Guardian canonical cancellation "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const guardian=await call("ccp_v1_guardians_create",{
  name:"Guardian "+randomUUID(),studentIds:[studentId],confirmed:true,
 });
 expect(guardian.error).toBeUndefined();
 const guardianDetails=await page.request.get("/api/guardians/"+guardian.data.id);
 expect(guardianDetails.status(),await guardianDetails.text()).toBe(200);
 const portalToken=(await guardianDetails.json()).portal_token as string;
 expect(portalToken.length).toBeGreaterThanOrEqual(32);
 const workplace=await call("ccp_v1_workplaces_create",{
  name:"Guardian workplace "+randomUUID(),timezone:"UTC",currency:"USD",
  locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 expect((await call("ccp_v1_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const created=await call("ccp_v1_sessions_create",{
  workplaceId,studentId,title:"Upcoming private lesson",
  startsAt:"2059-07-09T15:00:00Z",durationMinutes:60,
  lessonNote:"",idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const sessionId=created.data.entityId as string;
 const url="/api/portal/"+encodeURIComponent(portalToken)+
  "/sessions/"+sessionId+"/students/"+studentId+"/cancel";
 const [first,second]=await Promise.all([
  page.request.post(url,{data:{note:"School tournament"}}),
  page.request.post(url,{data:{note:"School tournament"}}),
 ]);
 expect(first.status(),await first.text()).toBe(200);
 expect(second.status(),await second.text()).toBe(200);
 const a=await first.json(),b=await second.json();
 expect([a.replayed,b.replayed].sort()).toEqual([false,true]);
 expect(a.noticeAt).toBe(b.noticeAt);
 const signed=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 expect((await signed.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const saved=await signed.from("session_attendance")
  .select("status,notice_at,cancel_reason,cancelled_by")
  .eq("session_id",sessionId).eq("student_id",studentId).single();
 expect(saved.error).toBeNull();
 expect(saved.data).toMatchObject({
  status:"student_cancelled",cancel_reason:"School tournament",
  cancelled_by:"student",notice_at:a.noticeAt,
 });
 const replay=await page.request.post(url,{data:{note:"Change the reason"}});
 expect(replay.status(),await replay.text()).toBe(200);
 expect((await replay.json()).replayed).toBe(true);
 const unauth=await page.request.post(
  "/api/portal/"+encodeURIComponent("x".repeat(40))+
  "/sessions/"+sessionId+"/students/"+studentId+"/cancel",
  {data:{note:"Unauthorized"}});
 expect(unauth.status()).toBe(404);
 const register=await call("ccp_v1_attendance_preview",{sessionId});
 expect(register.error).toBeUndefined();
 expect(register.data.attendance.find((r:{student_id:string})=>
  r.student_id===studentId).status).toBe("student_cancelled");
 const details=await call("ccp_v1_sessions_details",{sessionId});
 expect(details.error).toBeUndefined();
 expect(details.data.status).toBe("scheduled");
});
