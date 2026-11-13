import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: group charge generation uses one canonical occurrence, two frozen students and browser/MCP replay",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const workplace=await call("ccp_v1_workplaces_create",{
  name:"Canonical generation "+randomUUID(),timezone:"UTC",currency:"USD",
  locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 const studentIds:string[]=[];
 for(let i=0;i<2;i++){
  const student=await call("ccp_v1_students_create",{
   name:"Canonical finance student "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  studentIds.push(studentId);
  const guardian=await call("ccp_v1_guardians_create",{
   name:"Canonical finance guardian "+randomUUID(),studentIds:[studentId],
   confirmed:true,
  });
  expect(guardian.error).toBeUndefined();
  const enrol=await call("ccp_v1_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:randomUUID(),
  });
  expect(enrol.error).toBeUndefined();
  const rate=await page.request.put("/api/students/"+studentId,{
   data:{defaultRateCents:3000},
  });
  expect(rate.status(),await rate.text()).toBe(200);
 }
 const group=await call("ccp_v1_groups_create",{
  workplaceId,name:"One shared teaching event "+randomUUID(),
  idempotencyKey:randomUUID(),
 });
 expect(group.error).toBeUndefined();
 const groupId=group.data.entityId as string;
 for(const studentId of studentIds){
  const e=await call("ccp_v1_groups_enroll",{
   groupId,studentId,idempotencyKey:randomUUID(),
  });
  expect(e.error).toBeUndefined();
 }
 const day=new Date(Date.UTC(2091,0,1)+
   (Number.parseInt(randomUUID().slice(0,8),16)%1200)*86400000)
   .toISOString().slice(0,10);
 const lesson=await call("ccp_v1_sessions_create",{
  workplaceId,groupId,title:"Shared tactics class",
  startsAt:day+"T13:00:00Z",durationMinutes:60,
  lessonNote:"",idempotencyKey:randomUUID(),
 });
 expect(lesson.error).toBeUndefined();
 const sessionId=lesson.data.entityId as string;
 const bulk=await call("ccp_v1_session_attendance_bulk_set",{
  sessionId,idempotencyKey:randomUUID(),confirmed:true,
  attendance:studentIds.map((studentId,i)=>({
   studentId,status:i===0?"present":"late",note:"",noticeAt:null,
   cancelReason:"",expectedUpdatedAt:null,
   notifyFamily:false,confirmed:true,
  })),
 });
 expect(bulk.error).toBeUndefined();
 const period={periodStart:day,periodEnd:day};
 const webPreview=await page.request.post("/api/billing/generate",{
  data:{...period,commit:false},
 });
 expect(webPreview.status(),await webPreview.text()).toBe(200);
 const preview=await webPreview.json();
 const modelPreview=await call("ccp_v1_billing_generation_preview",period);
 expect(modelPreview.error).toBeUndefined();
 expect(modelPreview.data).toEqual(preview);
 expect(preview.totalFamilies).toBe(2);
 expect(preview.totalCents).toBe(6000);
 expect(preview.drafts).toHaveLength(2);
 expect(preview.drafts.flatMap((x:{items:unknown[]})=>x.items)).toHaveLength(2);
 const key=randomUUID();
 const [web,agent]=await Promise.all([
  page.request.post("/api/billing/generate",{
   data:{...period,commit:true,idempotencyKey:key},
  }),
  call("ccp_v1_billing_generation_commit",{
   ...period,idempotencyKey:key,confirmed:true,
  }),
 ]);
 expect(web.status(),await web.text()).toBe(200);
 expect(agent.error).toBeUndefined();
 const receipt=await web.json();
 expect(receipt.count).toBe(2);
 expect(receipt.created).toEqual(agent.data.created);
 const replay=await call("ccp_v1_billing_generation_commit",{
  ...period,idempotencyKey:key,confirmed:true,
 });
 expect(replay.error).toBeUndefined();
 expect(replay.data.created).toEqual(receipt.created);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 expect((await db.auth.signInWithPassword(SEED_TEACHER)).error).toBeNull();
 const {data:lines,error}=await db.from("invoice_items")
  .select("invoice_id,session_id,student_id,kind")
  .eq("session_id",sessionId).eq("kind","lesson");
 expect(error).toBeNull();
 expect(lines).toHaveLength(2);
 expect(new Set(lines!.map(x=>x.student_id))).toEqual(new Set(studentIds));
 expect(new Set(lines!.map(x=>x.invoice_id)).size).toBe(2);
 const details=await call("ccp_v1_sessions_details",{sessionId});
 expect(details.error).toBeUndefined();
 expect(details.data.status).toBe("scheduled");
});
