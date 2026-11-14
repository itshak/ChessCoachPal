import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("FINANCE: group session bills distinct frozen students once and locks paid teaching history",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const w=await call("ccp_v1_workplaces_create",{
  name:"Canonical group finance "+randomUUID(),timezone:"UTC",
  currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(w.error).toBeUndefined();
 const workplaceId=w.data.entityId as string;
 const students:string[]=[],guardians:string[]=[];
 for(let i=0;i<2;i++){
  const s=await call("ccp_v1_students_create",{
   name:"Billing student "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(s.error).toBeUndefined();
  const studentId=s.data.entityId as string;
  students.push(studentId);
  expect((await call("ccp_v1_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
  const guardian=await call("ccp_v1_guardians_create",{
   name:"Billing family "+randomUUID(),studentIds:[studentId],confirmed:true,
  });
  expect(guardian.error).toBeUndefined();
  guardians.push(guardian.data.id as string);
 }
 const group=await call("ccp_v1_groups_create",{
  workplaceId,name:"Group lesson "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(group.error).toBeUndefined();
 for(const studentId of students)
  expect((await call("ccp_v1_groups_enroll",{
   groupId:group.data.entityId,studentId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
 const date=new Date(Date.UTC(2085,0,1)+
  (Number.parseInt(randomUUID().slice(0,8),16)%366)*86400000)
   .toISOString().slice(0,10);
 const lesson=await call("ccp_v1_sessions_create",{
  workplaceId,groupId:group.data.entityId,
  title:"One instructor hour, two participants",
  startsAt:date+"T13:00:00Z",durationMinutes:60,
  lessonNote:"",idempotencyKey:randomUUID(),
 });
 expect(lesson.error).toBeUndefined();
 const sessionId=lesson.data.entityId as string;
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const auth=await db.auth.signInWithPassword(SEED_TEACHER);
 expect(auth.error).toBeNull();
 const teacher=auth.data.user!.id;
 const invoiceIds:string[]=[];
 for(let i=0;i<2;i++){
  const {data:invoice,error:invoiceErr}=await db.from("invoices").insert({
   teacher_id:teacher,guardian_id:guardians[i],period_start:date,
   period_end:date,status:"draft",subtotal_cents:3000,currency:"USD",
  }).select("id").single();
  expect(invoiceErr).toBeNull();
  invoiceIds.push(invoice!.id);
  const {error}=await db.from("invoice_items").insert({
   invoice_id:invoice!.id,session_id:sessionId,student_id:students[i],
   kind:"lesson",description:"One group chess lesson",
   quantity:1,unit_cents:3000,amount_cents:3000,sort_order:0,
  });
  expect(error).toBeNull();
 }
 const {data:lines,error:readError}=await db.from("invoice_items")
  .select("invoice_id,session_id,student_id")
  .eq("session_id",sessionId).eq("kind","lesson");
 expect(readError).toBeNull();
 expect(lines).toHaveLength(2);
 expect(new Set(lines!.map(l=>l.student_id))).toEqual(new Set(students));
 const duplicate=await db.from("invoice_items").insert({
  invoice_id:invoiceIds[0],session_id:sessionId,student_id:students[0],
  kind:"lesson",description:"Duplicate charge",quantity:1,
  unit_cents:3000,amount_cents:3000,sort_order:1,
 });
 expect(duplicate.error).not.toBeNull();
 const altered=await db.from("teaching_sessions")
  .update({duration_minutes:90}).eq("id",sessionId);
 expect(altered.error).not.toBeNull();
 const details=await call("ccp_v1_sessions_details",{sessionId});
 expect(details.error).toBeUndefined();
 expect(details.data.duration_minutes).toBe(60);
 const rogue=await db.from("invoice_items").insert({
  invoice_id:invoiceIds[1],session_id:sessionId,student_id:randomUUID(),
  kind:"lesson",description:"Foreign participant",quantity:1,
  unit_cents:3000,amount_cents:3000,sort_order:1,
 });
 expect(rogue.error).not.toBeNull();
});
