import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("AUDIT: canonical attendance keeps immutable mark, correction and clear history across web/MCP",async({page,request})=>{
 const tool=await delegatedTool(page,request);
 const person=await tool("ccp_v1_students_create",{
  name:"Audit attendee "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(person.error).toBeUndefined();
 const studentId=person.data.entityId as string;
 const workplace=await tool("ccp_v1_workplaces_create",{
  name:"Audited lessons "+randomUUID(),timezone:"UTC",currency:"USD",
  locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 expect((await tool("ccp_v1_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const created=await tool("ccp_v1_sessions_create",{
  workplaceId,studentId,title:"Chess tactics audit",
  startsAt:new Date(Date.UTC(2070,0,1)+
    (Number.parseInt(randomUUID().slice(0,8),16)%250)*86400000).toISOString(),
  durationMinutes:60,lessonNote:"",idempotencyKey:randomUUID(),
 });
 expect(created.error).toBeUndefined();
 const sessionId=created.data.entityId as string;
 const body={studentId,status:"present",note:"Accurate forks",
  noticeAt:null,cancelReason:"",expectedUpdatedAt:null,
  idempotencyKey:randomUUID(),notifyFamily:false,confirmed:true};
 const web=await page.request.put("/api/coaching/sessions/"+sessionId+"/attendance",{
  data:body,
 });
 expect(web.status(),await web.text()).toBe(200);
 const first=await web.json();
 const correction=await tool("ccp_v1_session_attendance_set",{
  sessionId,...body,status:"late",note:"Arrived ten minutes late",
  expectedUpdatedAt:first.revision,idempotencyKey:randomUUID(),
 });
 expect(correction.error).toBeUndefined();
 const clear=await page.request.put("/api/coaching/sessions/"+sessionId+"/attendance",{
  data:{...body,status:null,note:"",
   expectedUpdatedAt:correction.data.revision,idempotencyKey:randomUUID()},
 });
 expect(clear.status(),await clear.text()).toBe(200);
 const signed=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 expect((await signed.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const {data:audits,error}=await signed.from("ccp_session_attendance_audit")
  .select("action,actor_role,actor_id,before_value,after_value,recorded_at")
  .eq("session_id",sessionId).eq("student_id",studentId)
  .order("recorded_at",{ascending:true}).order("id");
 expect(error).toBeNull();
 expect(audits).toHaveLength(3);
 expect(audits?.map(x=>x.action)).toEqual(["insert","update","delete"]);
 expect(audits?.every(x=>x.actor_role==="authenticated")).toBe(true);
 expect(audits?.[0].before_value).toBeNull();
 expect(audits?.[0].after_value.status).toBe("present");
 expect(audits?.[1].before_value.status).toBe("present");
 expect(audits?.[1].after_value.status).toBe("late");
 expect(audits?.[2].before_value.status).toBe("late");
 expect(audits?.[2].after_value).toBeNull();
 expect(JSON.stringify(audits)).not.toContain("portal_token");
 const register=await tool("ccp_v1_session_attendance_list",{sessionId});
 expect(register.error).toBeUndefined();
 expect(register.data.find((x:{studentId:string})=>x.studentId===studentId).status)
  .toBe("unmarked");
 const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const publicAudit=await anon.from("ccp_session_attendance_audit")
  .select("id").eq("session_id",sessionId);
 expect(publicAudit.data??[]).toHaveLength(0);
});
